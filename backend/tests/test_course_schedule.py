"""
TDD Suite for shared course schedule blocks (course_schedule_blocks):
- Default empty schedule_blocks returned by GET /api/v1/courses/enrolled
- Shared blocks keyed by (course_code, term, component_type, group_code)
- Multiple weekly sessions per group and dirty-check updates/deletions
- Group-based visibility across students and strict input validation
"""

import uuid
from typing import Dict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.classroom import UserCourseEnrollment
from app.models.user import User
from app.services.academic.curriculum_resolver import DEFAULT_TERM, CurriculumResolverService


@pytest.fixture
def schedule_db_session() -> Session:
    """Provide an isolated SQLite in-memory database session with catalog seeded."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        CurriculumResolverService.ensure_catalog_seeded(session)
        session.commit()
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _create_student_and_enroll(
    db: Session,
    email: str,
    cui: str,
    course_code: str = "1705275",
    theory_group: str | None = "A",
    lab_group: str | None = "B",
    term: str = DEFAULT_TERM,
) -> tuple[User, Dict[str, str]]:
    student = User(
        id=uuid.uuid4(),
        email=email,
        cui=cui,
        role="student",
        is_active=True,
    )
    db.add(student)
    db.flush()
    enrollment = UserCourseEnrollment(
        user_id=student.id,
        course_code=course_code,
        term=term,
        theory_group=theory_group,
        lab_group=lab_group,
    )
    db.add(enrollment)
    db.commit()
    db.refresh(student)
    token = create_access_token(data={"sub": str(student.id), "role": "student"})
    return student, {"Authorization": f"Bearer {token}"}


def test_enrolled_courses_include_empty_schedule_blocks_by_default(
    schedule_db_session: Session,
) -> None:
    """Enrolled courses include schedule_blocks: [] and course_schedule_blocks table exists."""
    inspector = inspect(schedule_db_session.bind)
    tables = set(inspector.get_table_names())
    assert "course_schedule_blocks" in tables

    _, headers = _create_student_and_enroll(
        schedule_db_session,
        email="schedule.empty@unsa.edu.pe",
        cui="20201001",
    )

    app.dependency_overrides[get_db] = lambda: schedule_db_session
    try:
        with TestClient(app) as client:
            res = client.get("/api/v1/courses/enrolled", headers=headers)
            assert res.status_code == 200
            courses = res.json()
            assert len(courses) == 1
            assert courses[0]["course_code"] == "1705275"
            assert courses[0]["schedule_blocks"] == []
    finally:
        app.dependency_overrides.clear()


def test_put_schedule_updates_groups_and_supports_multiple_weekly_sessions(
    schedule_db_session: Session,
) -> None:
    """Students can update A-F groups and save/replace multiple weekly blocks per group."""
    _, headers = _create_student_and_enroll(
        schedule_db_session,
        email="schedule.editor@unsa.edu.pe",
        cui="20201002",
        theory_group=None,
        lab_group=None,
    )

    app.dependency_overrides[get_db] = lambda: schedule_db_session
    try:
        with TestClient(app) as client:
            initial_payload = {
                "theory_group": "a",
                "lab_group": "C",
                "blocks": [
                    {
                        "component_type": "TEORIA",
                        "group_code": "A",
                        "day_of_week": 1,
                        "start_time": "16:40",
                        "end_time": "18:30",
                        "room": "  Aula 302  ",
                    },
                    {
                        "component_type": "TEORIA",
                        "group_code": "A",
                        "day_of_week": 3,
                        "start_time": "08:40",
                        "end_time": "10:20",
                        "room": "Aula 204",
                    },
                    {
                        "component_type": "LABORATORIO",
                        "group_code": "C",
                        "day_of_week": 4,
                        "start_time": "14:00",
                        "end_time": "15:40",
                        "room": "Lab 4",
                    },
                ],
            }
            put_res = client.put(
                "/api/v1/courses/enrolled/1705275/schedule",
                headers=headers,
                json=initial_payload,
            )
            assert put_res.status_code == 200
            data = put_res.json()
            assert data["theory_group"] == "A"
            assert data["lab_group"] == "C"
            assert len(data["schedule_blocks"]) == 3
            assert [b["day_of_week"] for b in data["schedule_blocks"]] == [1, 3, 4]
            assert data["schedule_blocks"][0]["room"] == "Aula 302"

            # Replace TEORIA group A blocks with a single modified slot and remove Lab block
            updated_payload = {
                "theory_group": "A",
                "lab_group": "C",
                "blocks": [
                    {
                        "component_type": "TEORIA",
                        "group_code": "A",
                        "day_of_week": 1,
                        "start_time": "16:40",
                        "end_time": "18:20",
                        "room": "Aula 305",
                    },
                ],
            }
            update_res = client.put(
                "/api/v1/courses/enrolled/1705275/schedule",
                headers=headers,
                json=updated_payload,
            )
            assert update_res.status_code == 200
            updated_blocks = update_res.json()["schedule_blocks"]
            assert len(updated_blocks) == 1
            assert updated_blocks[0]["end_time"] == "18:20"
            assert updated_blocks[0]["room"] == "Aula 305"
    finally:
        app.dependency_overrides.clear()


def test_shared_schedule_blocks_visible_across_students_in_same_group(
    schedule_db_session: Session,
) -> None:
    """Blocks saved by Student A in group A are shared with another student in group A only."""
    _, headers_a1 = _create_student_and_enroll(
        schedule_db_session,
        email="student.a1@unsa.edu.pe",
        cui="20202001",
        theory_group="A",
        lab_group="B",
    )
    _, headers_a2 = _create_student_and_enroll(
        schedule_db_session,
        email="student.a2@unsa.edu.pe",
        cui="20202002",
        theory_group="A",
        lab_group="D",
    )
    _, headers_b = _create_student_and_enroll(
        schedule_db_session,
        email="student.b1@unsa.edu.pe",
        cui="20202003",
        theory_group="B",
        lab_group="D",
    )

    app.dependency_overrides[get_db] = lambda: schedule_db_session
    try:
        with TestClient(app) as client:
            save_res = client.put(
                "/api/v1/courses/enrolled/1705275/schedule",
                headers=headers_a1,
                json={
                    "theory_group": "A",
                    "lab_group": "B",
                    "blocks": [
                        {
                            "component_type": "TEORIA",
                            "group_code": "A",
                            "day_of_week": 2,
                            "start_time": "07:00",
                            "end_time": "08:40",
                            "room": "Aula 205",
                        },
                        {
                            "component_type": "LABORATORIO",
                            "group_code": "B",
                            "day_of_week": 5,
                            "start_time": "14:00",
                            "end_time": "15:40",
                            "room": "Lab Redes",
                        },
                    ],
                },
            )
            assert save_res.status_code == 200

            # Student A2 shares TEORIA group A, but has lab_group D so does not see lab group B
            a2_enrolled = client.get("/api/v1/courses/enrolled", headers=headers_a2)
            assert a2_enrolled.status_code == 200
            a2_blocks = a2_enrolled.json()[0]["schedule_blocks"]
            assert len(a2_blocks) == 1
            assert a2_blocks[0]["component_type"] == "TEORIA"
            assert a2_blocks[0]["group_code"] == "A"
            assert a2_blocks[0]["room"] == "Aula 205"

            # Direct schedule lookup for a target group pair
            lookup_res = client.get(
                "/api/v1/courses/enrolled/1705275/schedule?theory_group=A&lab_group=B",
                headers=headers_b,
            )
            assert lookup_res.status_code == 200
            assert len(lookup_res.json()) == 2

            # Student B with theory_group B sees no blocks in /enrolled yet
            b_enrolled = client.get("/api/v1/courses/enrolled", headers=headers_b)
            assert b_enrolled.status_code == 200
            assert b_enrolled.json()[0]["schedule_blocks"] == []
    finally:
        app.dependency_overrides.clear()


def test_schedule_validation_errors_and_not_enrolled_course(
    schedule_db_session: Session,
) -> None:
    """Rejects invalid group codes, bad days/times, inverted intervals, and non-enrolled courses."""
    _, headers = _create_student_and_enroll(
        schedule_db_session,
        email="schedule.validation@unsa.edu.pe",
        cui="20203001",
    )

    app.dependency_overrides[get_db] = lambda: schedule_db_session
    try:
        with TestClient(app) as client:
            invalid_payloads = [
                # Invalid group letter Z
                {
                    "theory_group": "Z",
                    "blocks": [],
                },
                # Invalid day_of_week 0 and 8
                {
                    "theory_group": "A",
                    "blocks": [
                        {
                            "component_type": "TEORIA",
                            "group_code": "A",
                            "day_of_week": 0,
                            "start_time": "08:00",
                            "end_time": "09:40",
                        }
                    ],
                },
                {
                    "theory_group": "A",
                    "blocks": [
                        {
                            "component_type": "TEORIA",
                            "group_code": "A",
                            "day_of_week": 8,
                            "start_time": "08:00",
                            "end_time": "09:40",
                        }
                    ],
                },
                # Invalid time format
                {
                    "theory_group": "A",
                    "blocks": [
                        {
                            "component_type": "TEORIA",
                            "group_code": "A",
                            "day_of_week": 1,
                            "start_time": "25:99",
                            "end_time": "26:00",
                        }
                    ],
                },
                # end_time <= start_time
                {
                    "theory_group": "A",
                    "blocks": [
                        {
                            "component_type": "TEORIA",
                            "group_code": "A",
                            "day_of_week": 1,
                            "start_time": "10:00",
                            "end_time": "09:00",
                        }
                    ],
                },
            ]

            for payload in invalid_payloads:
                bad_res = client.put(
                    "/api/v1/courses/enrolled/1705275/schedule",
                    headers=headers,
                    json=payload,
                )
                assert bad_res.status_code == 422

            not_enrolled_res = client.put(
                "/api/v1/courses/enrolled/1704257/schedule",
                headers=headers,
                json={"theory_group": "A", "blocks": []},
            )
            assert not_enrolled_res.status_code == 404
            assert not_enrolled_res.json()["detail"]["code"] == "ENROLLMENT_NOT_FOUND"
    finally:
        app.dependency_overrides.clear()
