"""TDD tests for assignment priority, component_type, and group_code metadata."""

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
)
from app.models.user import User


@pytest.fixture
def db_session() -> Session:
    """Provide an isolated SQLite in-memory session."""
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


def _create_student(db: Session) -> tuple[User, Dict[str, str]]:
    student = User(
        id=uuid.uuid4(),
        email="tasks.meta@unsa.edu.pe",
        cui="20209901",
        role="student",
        is_active=True,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    token = create_access_token(data={"sub": str(student.id), "role": "student"})
    return student, {"Authorization": f"Bearer {token}"}


def test_classroom_assignment_includes_priority_component_and_group_metadata(
    db_session: Session,
) -> None:
    """Assignments API must expose optional priority, component_type, and group_code."""
    inspector = inspect(db_session.bind)
    columns = {col["name"] for col in inspector.get_columns("classroom_assignments")}
    assert "priority" in columns

    student, headers = _create_student(db_session)

    catalog = CourseCatalog(
        code="1704257",
        curriculum_year=2017,
        official_name="Calidad de Software",
        normalized_name="calidad de software",
        category="EE",
        study_year=4,
        semester=8,
        department="Ingenieria de Sistemas",
        credits=4,
    )
    db_session.add(catalog)

    enrollment = UserCourseEnrollment(
        user_id=student.id,
        course_code="1704257",
        term="2026B",
        theory_group="A",
        lab_group="B",
    )
    db_session.add(enrollment)
    db_session.flush()

    theory_source = CourseExternalSource(
        term="2026B",
        origin="classroom",
        external_course_id="gc-calidad-t",
        raw_name="Calidad de Software",
        course_code="1704257",
        component_type="TEORIA",
        default_group_code="A",
        mapping_status="LINKED",
    )
    lab_source = CourseExternalSource(
        term="2026B",
        origin="classroom",
        external_course_id="gc-calidad-lab",
        raw_name="Calidad de Software - Lab",
        course_code="1704257",
        component_type="LABORATORIO",
        default_group_code="C",
        mapping_status="LINKED",
    )
    db_session.add_all([theory_source, lab_source])
    db_session.flush()

    overdue_lab = ClassroomAssignment(
        user_id=student.id,
        source_id=lab_source.id,
        course_code="1704257",
        enrollment_id=enrollment.id,
        classroom_assignment_id="gc-lab-1",
        title="Informe de Calidad ISO 25010",
        priority="ALTA",
        state="PUBLISHED",
        origin="classroom",
    )
    theory_task = ClassroomAssignment(
        user_id=student.id,
        source_id=theory_source.id,
        course_code="1704257",
        enrollment_id=enrollment.id,
        classroom_assignment_id="gc-theory-1",
        title="Lectura CMMI",
        state="PUBLISHED",
        origin="classroom",
    )
    db_session.add_all([overdue_lab, theory_task])
    db_session.commit()

    app.dependency_overrides[get_db] = lambda: db_session
    try:
        with TestClient(app) as client:
            res = client.get("/api/v1/courses/assignments", headers=headers)
            assert res.status_code == 200
            items = {item["classroom_assignment_id"]: item for item in res.json()}

            assert items["gc-lab-1"]["priority"] == "ALTA"
            assert items["gc-lab-1"]["component_type"] == "LABORATORIO"
            assert items["gc-lab-1"]["group_code"] == "B"

            assert items["gc-theory-1"]["priority"] is None
            assert items["gc-theory-1"]["component_type"] == "TEORIA"
            assert items["gc-theory-1"]["group_code"] == "A"

            patch_res = client.patch(
                f"/api/v1/classroom/assignments/{overdue_lab.id}/completion",
                headers=headers,
                json={"is_completed": True},
            )
            assert patch_res.status_code == 200
            patched = patch_res.json()
            assert patched["is_completed"] is True
            assert patched["priority"] == "ALTA"
            assert patched["component_type"] == "LABORATORIO"
            assert patched["group_code"] == "B"
    finally:
        app.dependency_overrides.clear()
