"""
TDD Suite for Curriculum Unification:
- Shared course_catalog (2017 & 2025 UNSA Systems Engineering plans: 158 courses)
- Shared course_external_sources across Classroom & DUTIC per academic term
- Per-student user_course_enrollments with independent theory/lab groups (A-F)
- Zero-task source preservation via user_external_courses (PENDING_LINK)
- Deterministic course matching (7-digit code, official name, assignment title hints)
- Automatic inference of student's curriculum_year (2017 vs 2025)
- Unified /api/v1/courses/* endpoints
"""

import uuid
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.user import User
from app.services.token_encryption import encrypt_token


@pytest.fixture
def test_db_session() -> Session:
    """Provide an isolated SQLite in-memory database session."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _make_student(db: Session, email: str, cui: str) -> tuple[User, Dict[str, str]]:
    student = User(
        id=uuid.uuid4(),
        email=email,
        cui=cui,
        role="student",
        is_active=True,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    token = create_access_token(data={"sub": str(student.id), "role": "student"})
    return student, {"Authorization": f"Bearer {token}"}


def test_curriculum_catalog_seeded_with_2017_and_2025_plans(test_db_session: Session) -> None:
    """Catalog endpoint must expose all 71 courses of 2017 and 87 courses of 2025 without classroom_courses."""
    inspector = inspect(test_db_session.bind)
    tables = set(inspector.get_table_names())
    assert "classroom_courses" not in tables
    assert {"course_catalog", "course_external_sources", "user_external_courses", "user_course_enrollments"}.issubset(tables)

    _, headers = _make_student(test_db_session, "catalog.reader@unsa.edu.pe", "20200001")
    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with TestClient(app) as client:
            res_all = client.get("/api/v1/courses/catalog", headers=headers)
            assert res_all.status_code == 200
            assert len(res_all.json()) == 158

            res_2017 = client.get("/api/v1/courses/catalog?curriculum_year=2017", headers=headers)
            assert res_2017.status_code == 200
            assert len(res_2017.json()) == 71

            res_2025 = client.get("/api/v1/courses/catalog?curriculum_year=2025", headers=headers)
            assert res_2025.status_code == 200
            assert len(res_2025.json()) == 87
    finally:
        app.dependency_overrides.clear()


def test_unifies_moodle_and_classroom_theory_and_lab_into_single_enrollment(
    test_db_session: Session,
) -> None:
    """
    Reproduces real DB scenario for 1705275:
    - DUTIC iCal: Curso 26B_20-1705275A
    - Classroom Theory: Desarrollo de Software para Juegos - A
    - Classroom Lab (manual link): DSJ - Lab (section: A)
    All 3 external sources must collapse into 1 UserCourseEnrollment for 1705275.
    """
    from app.models.classroom import (
        ClassroomAssignment,
        CourseExternalSource,
        UserCourseEnrollment,
    )

    student, headers = _make_student(test_db_session, "mamani.test@unsa.edu.pe", "20201111")
    ical_url = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=1&authtoken=tok123"
    student.moodle_calendar_url = encrypt_token(ical_url)
    student.moodle_calendar_sync_status = "CONNECTED"
    test_db_session.commit()

    ics_payload = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:moodle-dsj-1@aulavirtual.unsa.edu.pe/2026B\r\n"
        "SUMMARY:Avance Hito 1\r\n"
        "DTEND:20261120T235900Z\r\n"
        "CATEGORIES:26B_20-1705275A\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    mock_ics_resp = MagicMock()
    mock_ics_resp.status_code = 200
    mock_ics_resp.headers = {"content-type": "text/calendar"}
    mock_ics_resp.text = ics_payload

    classroom_courses = [
        {
            "id": "191924683865",
            "name": "Desarrollo de Software para Juegos - A",
            "section": None,
            "alternateLink": "https://classroom.google.com/c/191924683865",
        },
        {
            "id": "231635344864",
            "name": "DSJ - Lab",
            "section": "A",
            "alternateLink": "https://classroom.google.com/c/231635344864",
        },
    ]

    def mock_coursework(_token: str, course_id: str) -> List[Dict[str, Any]]:
        if course_id == "191924683865":
            return [
                {
                    "id": "cw-theory-1",
                    "courseId": "191924683865",
                    "title": "Documento GDD",
                    "state": "PUBLISHED",
                }
            ]
        return []  # Intentionally 0 tasks in DSJ - Lab

    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with TestClient(app) as client:
            with patch("httpx.Client.get", return_value=mock_ics_resp):
                res_ical = client.post("/api/v1/dutic/ical/sync", headers=headers, json={})
                assert res_ical.status_code == 200

            with patch(
                "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
                return_value=classroom_courses,
            ), patch(
                "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
                side_effect=mock_coursework,
            ):
                res_gc = client.post(
                    "/api/v1/classroom/sync",
                    headers=headers,
                    json={"refresh_token": "tok"},
                )
                assert res_gc.status_code == 200

            # DSJ - Lab had 0 tasks and abbreviated name -> must appear in pending links
            pending_res = client.get("/api/v1/courses/pending-links", headers=headers)
            assert pending_res.status_code == 200
            pending_items = pending_res.json()
            assert len(pending_items) == 1
            dsj_lab_source_id = pending_items[0]["source_id"]
            assert pending_items[0]["raw_name"] == "DSJ - Lab"

            # Manually link DSJ - Lab to 1705275 (LABORATORIO, group A)
            link_res = client.post(
                f"/api/v1/courses/sources/{dsj_lab_source_id}/link",
                headers=headers,
                json={
                    "course_code": "1705275",
                    "component_type": "LABORATORIO",
                    "group_code": "A",
                },
            )
            assert link_res.status_code == 200

            # Only 1 enrollment row must exist for 1705275
            enrolled_res = client.get("/api/v1/courses/enrolled", headers=headers)
            assert enrolled_res.status_code == 200
            enrolled_items = enrolled_res.json()
            assert len(enrolled_items) == 1
            unified = enrolled_items[0]
            assert unified["course_code"] == "1705275"
            assert unified["theory_group"] == "A"
            assert unified["lab_group"] == "A"
            assert len(unified["sources"]) == 3

            # All assignments share the same unified enrollment course_id
            assign_res = client.get("/api/v1/courses/assignments", headers=headers)
            assert assign_res.status_code == 200
            tasks = assign_res.json()
            assert len(tasks) == 2
            assert all(t["course_code"] == "1705275" for t in tasks)
            assert all(t["course_id"] == unified["id"] for t in tasks)

        test_db_session.expire_all()
        assert (
            test_db_session.query(UserCourseEnrollment)
            .filter(UserCourseEnrollment.user_id == student.id)
            .count()
            == 1
        )
        assert (
            test_db_session.query(CourseExternalSource)
            .filter(CourseExternalSource.course_code == "1705275")
            .count()
            == 3
        )
        assert (
            test_db_session.query(ClassroomAssignment)
            .filter(ClassroomAssignment.user_id == student.id, ClassroomAssignment.course_code == "1705275")
            .count()
            == 2
        )
    finally:
        app.dependency_overrides.clear()


def test_shared_external_source_keeps_groups_a_to_f_isolated_per_student(
    test_db_session: Session,
) -> None:
    """
    Two students sharing the same Classroom course (without group letter in title)
    must share the CourseExternalSource link to 1705275, while storing independent
    groups (up to F) in each student's UserCourseEnrollment.
    """
    from app.models.classroom import CourseExternalSource, UserCourseEnrollment

    student_a, headers_a = _make_student(test_db_session, "alumno.a@unsa.edu.pe", "20202221")
    student_f, headers_f = _make_student(test_db_session, "alumno.f@unsa.edu.pe", "20202222")

    shared_classroom = [
        {
            "id": "shared-gc-999",
            "name": "Lab Videojuegos",
            "section": "2026B",
            "alternateLink": "https://classroom.google.com/c/shared-gc-999",
        }
    ]

    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with TestClient(app) as client:
            with patch(
                "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
                return_value=shared_classroom,
            ), patch(
                "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
                return_value=[],
            ):
                assert client.post("/api/v1/classroom/sync", headers=headers_a, json={"refresh_token": "t1"}).status_code == 200
                assert client.post("/api/v1/classroom/sync", headers=headers_f, json={"refresh_token": "t2"}).status_code == 200

            pending_a = client.get("/api/v1/courses/pending-links", headers=headers_a).json()
            source_id = pending_a[0]["source_id"]

            # Student A links shared source as LABORATORIO and selects group A
            assert client.post(
                f"/api/v1/courses/sources/{source_id}/link",
                headers=headers_a,
                json={"course_code": "1705275", "component_type": "LABORATORIO", "group_code": "A"},
            ).status_code == 200

            # Student F now sees 0 pending links automatically because source is shared,
            # and their lab_group starts unset (not polluted with A) until F sets F.
            assert client.get("/api/v1/courses/pending-links", headers=headers_f).json() == []
            enrolled_f_before = client.get("/api/v1/courses/enrolled", headers=headers_f).json()
            assert enrolled_f_before[0]["course_code"] == "1705275"
            assert enrolled_f_before[0]["lab_group"] is None

            # Student F sets their own group F
            grp_res = client.patch(
                "/api/v1/courses/enrolled/1705275/groups",
                headers=headers_f,
                json={"lab_group": "F"},
            )
            assert grp_res.status_code == 200
            assert grp_res.json()["lab_group"] == "F"

            # Groups beyond F (e.g., G) must be rejected
            bad_grp = client.patch(
                "/api/v1/courses/enrolled/1705275/groups",
                headers=headers_f,
                json={"lab_group": "G"},
            )
            assert bad_grp.status_code == 422

        test_db_session.expire_all()
        assert test_db_session.query(CourseExternalSource).count() == 1
        enr_a = test_db_session.query(UserCourseEnrollment).filter(UserCourseEnrollment.user_id == student_a.id).one()
        enr_f = test_db_session.query(UserCourseEnrollment).filter(UserCourseEnrollment.user_id == student_f.id).one()
        assert enr_a.lab_group == "A"
        assert enr_f.lab_group == "F"
    finally:
        app.dependency_overrides.clear()


def test_task_title_hint_links_internal_moodle_code_and_preserves_unlinked_tasks(
    test_db_session: Session,
) -> None:
    """
    When Moodle uses an internal category (26B_SISTEMAS_073), deterministic matching
    scans task titles for an official catalog name (Negocios Electronicos -> 1704257).
    Unmatched courses stay PENDING_LINK without hiding their assignments.
    """
    student, headers = _make_student(test_db_session, "hints.student@unsa.edu.pe", "20203333")
    ical_url = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=2&authtoken=tok456"
    student.moodle_calendar_url = encrypt_token(ical_url)
    student.moodle_calendar_sync_status = "CONNECTED"
    test_db_session.commit()

    ics_payload = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:sistemas-073-1\r\n"
        "SUMMARY:Vencimiento de Entrega GP LAB NE 07 1 Negocios Electronicos - E Government\r\n"
        "DTEND:20261121T235900Z\r\n"
        "CATEGORIES:26B_SISTEMAS_073\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:sistemas-096-1\r\n"
        "SUMMARY:Vencimiento de Subir el Ejercicio del Laboratorio de Flocking\r\n"
        "DESCRIPTION:Usar OpenCV, PyTorch y Deep Learning en el informe\r\n"
        "DTEND:20261122T235900Z\r\n"
        "CATEGORIES:26B_SISTEMAS_096\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "text/calendar"}
    mock_resp.text = ics_payload

    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with TestClient(app) as client:
            with patch("httpx.Client.get", return_value=mock_resp):
                assert client.post("/api/v1/dutic/ical/sync", headers=headers, json={}).status_code == 200

            enrolled = client.get("/api/v1/courses/enrolled", headers=headers).json()
            by_name = {c["name"]: c for c in enrolled}
            assert "NEGOCIOS ELECTRONICOS (E)" in by_name
            assert by_name["NEGOCIOS ELECTRONICOS (E)"]["course_code"] == "1704257"

            # 26B_SISTEMAS_096 remains pending link, but its assignment must still be returned
            pending = client.get("/api/v1/courses/pending-links", headers=headers).json()
            assert len(pending) == 1
            assert pending[0]["raw_section"] == "26B_SISTEMAS_096"

            tasks = client.get("/api/v1/courses/assignments", headers=headers).json()
            assert len(tasks) == 2
            assert any("Flocking" in t["title"] and t["course_code"] is None for t in tasks)
            assert any("Negocios Electronicos" in t["title"] and t["course_code"] == "1704257" for t in tasks)

        test_db_session.expire_all()
        refreshed = test_db_session.query(User).filter(User.id == student.id).one()
        assert refreshed.inferred_curriculum_year == 2017
    finally:
        app.dependency_overrides.clear()


def test_curriculum_inference_disambiguates_shared_course_names_between_2017_and_2025(
    test_db_session: Session,
) -> None:
    """
    Courses sharing the exact name across 2017 and 2025 (e.g. Base de Datos: 1703133 vs 2503242)
    must resolve to 2503242 when the student's codes indicate the 2025 curriculum plan.
    """
    student, headers = _make_student(test_db_session, "plan2025.student@unsa.edu.pe", "20254444")
    ical_url = "https://aulavirtual.unsa.edu.pe/2026B/calendar/export_execute.php?userid=3&authtoken=tok789"
    student.moodle_calendar_url = encrypt_token(ical_url)
    student.moodle_calendar_sync_status = "CONNECTED"
    test_db_session.commit()

    ics_payload = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:m25-1\r\n"
        "SUMMARY:Practica 1\r\n"
        "DTEND:20261121T235900Z\r\n"
        "CATEGORIES:26B_20-2503240B\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.headers = {"content-type": "text/calendar"}
    mock_resp.text = ics_payload

    classroom_courses = [
        {
            "id": "gc-bd-2025",
            "name": "Base de Datos",
            "section": "B",
            "alternateLink": "https://classroom.google.com/c/gc-bd-2025",
        }
    ]

    app.dependency_overrides[get_db] = lambda: test_db_session
    try:
        with TestClient(app) as client:
            with patch("httpx.Client.get", return_value=mock_resp):
                assert client.post("/api/v1/dutic/ical/sync", headers=headers, json={}).status_code == 200

            test_db_session.expire_all()
            refreshed = test_db_session.query(User).filter(User.id == student.id).one()
            assert refreshed.inferred_curriculum_year == 2025

            with patch(
                "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
                return_value=classroom_courses,
            ), patch(
                "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
                return_value=[],
            ):
                assert client.post("/api/v1/classroom/sync", headers=headers, json={"refresh_token": "t"}).status_code == 200

            enrolled = client.get("/api/v1/courses/enrolled", headers=headers).json()
            codes = {c["course_code"] for c in enrolled}
            assert codes == {"2503240", "2503242"}
    finally:
        app.dependency_overrides.clear()
