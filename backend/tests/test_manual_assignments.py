"""TDD tests for manual assignment creation and persistence (POST /api/v1/courses/assignments)."""

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
from app.models.classroom import (
    ClassroomAssignment,
    CourseCatalog,
    CourseExternalSource,
    UserCourseEnrollment,
    UserExternalCourse,
)
from app.models.user import User


@pytest.fixture
def db_session() -> Session:
    """Provide an isolated SQLite in-memory database session per test."""
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


def _create_student(
    db: Session,
    email: str = "manual.task@unsa.edu.pe",
    cui: str = "20210042",
) -> tuple[User, Dict[str, str]]:
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


def test_create_manual_assignment_linked_to_enrolled_course_and_personal_task(
    db_session: Session,
) -> None:
    """Students can create manual tasks tied to an enrolled course or without a course."""
    inspector = inspect(db_session.bind)
    columns = {col["name"]: col for col in inspector.get_columns("classroom_assignments")}
    assert "component_type" in columns
    assert columns["source_id"]["nullable"] is True

    student, headers = _create_student(db_session)
    _other_student, other_headers = _create_student(
        db_session,
        email="other.student@unsa.edu.pe",
        cui="20210099",
    )

    catalog = CourseCatalog(
        code="1705275",
        curriculum_year=2017,
        official_name="Desarrollo de Software para Juegos",
        normalized_name="desarrollo de software para juegos",
        category="E",
        study_year=5,
        semester=1,
        department="Ingenieria de Sistemas",
        credits=4,
    )
    db_session.add(catalog)
    enrollment = UserCourseEnrollment(
        user_id=student.id,
        course_code="1705275",
        term="2026B",
        theory_group="A",
        lab_group="B",
    )
    db_session.add(enrollment)
    db_session.commit()

    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as client:
            # 1. Create course-linked manual lab assignment
            course_res = client.post(
                "/api/v1/courses/assignments",
                json={
                    "title": "Informe de avance",
                    "course_code": "1705275",
                    "component_type": "LABORATORIO",
                    "due_date": "2026-11-21T04:59:00Z",
                    "priority": "ALTA",
                    "notes": "Subir capturas de Unity",
                },
                headers=headers,
            )
            assert course_res.status_code == 201
            course_task = course_res.json()
            assert course_task["title"] == "Informe de avance"
            assert course_task["course_code"] == "1705275"
            assert course_task["course_id"] == str(enrollment.id)
            assert course_task["source_id"] is None
            assert course_task["component_type"] == "LABORATORIO"
            assert course_task["group_code"] == "B"
            assert course_task["priority"] == "ALTA"
            assert course_task["description"] == "Subir capturas de Unity"
            assert course_task["origin"] == "manual"
            assert course_task["is_completed"] is False

            # 2. Create personal manual assignment with no course
            personal_res = client.post(
                "/api/v1/courses/assignments",
                json={
                    "title": "Comprar materiales",
                    "course_code": None,
                    "component_type": "TEORIA",
                    "due_date": None,
                    "priority": None,
                    "notes": "  ",
                },
                headers=headers,
            )
            assert personal_res.status_code == 201
            personal_task = personal_res.json()
            assert personal_task["title"] == "Comprar materiales"
            assert personal_task["course_code"] is None
            assert personal_task["course_id"] is None
            assert personal_task["source_id"] is None
            assert personal_task["component_type"] == "TEORIA"
            assert personal_task["description"] is None
            assert personal_task["origin"] == "manual"

            # 3. Listed in unified GET /courses/assignments
            listed = client.get("/api/v1/courses/assignments", headers=headers)
            assert listed.status_code == 200
            titles = {item["title"] for item in listed.json()}
            assert titles == {"Informe de avance", "Comprar materiales"}

            # 4. Completion PATCH enforces ownership
            other_patch = client.patch(
                f"/api/v1/classroom/assignments/{course_task['id']}/completion",
                json={"is_completed": True},
                headers=other_headers,
            )
            assert other_patch.status_code == 404

            owner_patch = client.patch(
                f"/api/v1/classroom/assignments/{course_task['id']}/completion",
                json={"is_completed": True},
                headers=headers,
            )
            assert owner_patch.status_code == 200
            assert owner_patch.json()["is_completed"] is True
    finally:
        app.dependency_overrides.clear()


def test_create_manual_assignment_validation_and_preservation_on_synced_clear(
    db_session: Session,
) -> None:
    """Validate error codes and verify clearing synced LMS data preserves manual tasks."""
    student, headers = _create_student(db_session)

    catalog = CourseCatalog(
        code="1704257",
        curriculum_year=2017,
        official_name="Calidad de Software",
        normalized_name="calidad de software",
        category="E",
        study_year=4,
        semester=2,
        department="Ingenieria de Sistemas",
        credits=4,
    )
    db_session.add(catalog)
    source = CourseExternalSource(
        term="2026B",
        origin="classroom",
        external_course_id="gc-calidad",
        raw_name="Calidad de Software",
        course_code="1704257",
        component_type="TEORIA",
        mapping_status="LINKED",
    )
    db_session.add(source)
    db_session.flush()
    enrollment = UserCourseEnrollment(
        user_id=student.id,
        course_code="1704257",
        term="2026B",
        theory_group="A",
    )
    db_session.add(enrollment)
    db_session.flush()
    db_session.add(
        UserExternalCourse(
            user_id=student.id,
            source_id=source.id,
            enrollment_id=enrollment.id,
        )
    )
    db_session.add(
        ClassroomAssignment(
            user_id=student.id,
            source_id=source.id,
            course_code="1704257",
            enrollment_id=enrollment.id,
            classroom_assignment_id="gc-sync-1",
            title="Synced task",
            state="PUBLISHED",
            origin="classroom",
        )
    )
    db_session.commit()

    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as client:
            unauth_res = client.post(
                "/api/v1/courses/assignments",
                json={"title": "Unauthenticated task"},
            )
            assert unauth_res.status_code == 401

            blank_res = client.post(
                "/api/v1/courses/assignments",
                json={"title": "   "},
                headers=headers,
            )
            assert blank_res.status_code == 422

            unenrolled_res = client.post(
                "/api/v1/courses/assignments",
                json={"title": "Unknown course task", "course_code": "9999999"},
                headers=headers,
            )
            assert unenrolled_res.status_code == 404

            created = client.post(
                "/api/v1/courses/assignments",
                json={
                    "title": "Manual note inside Calidad",
                    "course_code": "1704257",
                    "component_type": "LABORATORIO",
                },
                headers=headers,
            )
            assert created.status_code == 201

            # Clearing synced assignments/courses must preserve manual tasks
            clear_res = client.delete("/api/v1/classroom/assignments", headers=headers)
            assert clear_res.status_code == 200
            assert clear_res.json()["deleted_count"] == 1

            clear_courses_res = client.delete("/api/v1/classroom/courses", headers=headers)
            assert clear_courses_res.status_code == 200

            remaining = client.get("/api/v1/courses/assignments", headers=headers).json()
            assert len(remaining) == 1
            assert remaining[0]["title"] == "Manual note inside Calidad"
            assert remaining[0]["origin"] == "manual"
    finally:
        app.dependency_overrides.clear()
