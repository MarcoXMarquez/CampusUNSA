"""US-05: student-owned completion persists independently of LMS publication state."""

from collections.abc import Iterator
from datetime import datetime, timezone
import os
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User


@pytest.fixture
def completion_db() -> Iterator[Session]:
    database_url = os.environ.get("COMPLETION_TEST_DATABASE_URL")
    if database_url:
        engine = create_engine(database_url)
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                schema = f"completion_test_{uuid4().hex}"
                connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
                connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
                Base.metadata.create_all(connection)
                with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
                    yield session
            finally:
                transaction.rollback()
        engine.dispose()
        return
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def completion_client(completion_db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: completion_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def seed_assignment(db: Session, origin: str = "classroom") -> ClassroomAssignment:
    user = User(email=f"{uuid4()}@unsa.edu.pe", role="student", is_active=True)
    db.add(user)
    db.flush()
    course = ClassroomCourse(
        user_id=user.id, classroom_course_id=f"{origin}-{uuid4()}", name="Software Engineering"
    )
    db.add(course)
    db.flush()
    assignment = ClassroomAssignment(
        user_id=user.id, course_id=course.id, classroom_assignment_id=str(uuid4()),
        title="Sprint report", origin=origin, state="PUBLISHED",
        due_date=datetime(2026, 11, 4, 12, tzinfo=timezone.utc),
    )
    db.add(assignment)
    db.commit()
    return assignment


def authorization(user_id: UUID) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': str(user_id)})}"}


@pytest.mark.parametrize("origin", ["classroom", "moodle"])
def test_completion_persists_and_can_be_reopened(
    completion_client: TestClient, completion_db: Session, origin: str
) -> None:
    assignment = seed_assignment(completion_db, origin)
    headers = authorization(assignment.user_id)
    path = f"/api/v1/classroom/assignments/{assignment.id}/completion"
    for completed in (True, True, False):
        response = completion_client.patch(path, headers=headers, json={"is_completed": completed})
        assert response.status_code == 200
        assert response.json()["is_completed"] is completed
        assert response.json()["state"] == "PUBLISHED"
        completion_db.expire_all()
        persisted = completion_db.get(ClassroomAssignment, assignment.id)
        assert persisted is not None
        assert persisted.is_completed is completed
        listed = completion_client.get("/api/v1/classroom/assignments", headers=headers).json()
        assert listed[0]["is_completed"] is completed
        if origin == "moodle":
            moodle = completion_client.get("/api/v1/dutic/assignments", headers=headers).json()
            assert moodle[0]["is_completed"] is completed


def test_new_assignment_defaults_to_pending(
    completion_client: TestClient, completion_db: Session
) -> None:
    assignment = seed_assignment(completion_db)
    response = completion_client.get(
        "/api/v1/classroom/assignments", headers=authorization(assignment.user_id)
    )
    assert response.json()[0]["is_completed"] is False


def test_completion_cannot_modify_another_students_assignment(
    completion_client: TestClient, completion_db: Session
) -> None:
    target = seed_assignment(completion_db)
    other = seed_assignment(completion_db)
    response = completion_client.patch(
        f"/api/v1/classroom/assignments/{target.id}/completion",
        headers=authorization(other.user_id), json={"is_completed": True},
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "ASSIGNMENT_NOT_FOUND"
    completion_db.refresh(target)
    assert target.is_completed is False


def test_completion_requires_authentication(completion_client: TestClient) -> None:
    response = completion_client.patch(
        f"/api/v1/classroom/assignments/{uuid4()}/completion", json={"is_completed": True}
    )
    assert response.status_code == 401


@pytest.mark.parametrize("payload", [{}, {"is_completed": "true"}, {"is_completed": 1},
                                     {"is_completed": None}, {"is_completed": True, "user_id": "other"}])
def test_completion_rejects_invalid_payloads(
    completion_client: TestClient, completion_db: Session, payload: dict[str, object]
) -> None:
    assignment = seed_assignment(completion_db)
    response = completion_client.patch(
        f"/api/v1/classroom/assignments/{assignment.id}/completion",
        headers=authorization(assignment.user_id), json=payload,
    )
    assert response.status_code == 422


def test_completion_returns_not_found_for_unknown_assignment(
    completion_client: TestClient, completion_db: Session
) -> None:
    assignment = seed_assignment(completion_db)
    response = completion_client.patch(
        f"/api/v1/classroom/assignments/{uuid4()}/completion",
        headers=authorization(assignment.user_id), json={"is_completed": True},
    )
    assert response.status_code == 404


def test_classroom_resynchronization_preserves_completion(
    completion_client: TestClient, completion_db: Session
) -> None:
    assignment = seed_assignment(completion_db)
    assignment.is_completed = True
    completion_db.commit()
    course = completion_db.get(ClassroomCourse, assignment.course_id)
    assert course is not None
    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=[{"id": course.classroom_course_id, "name": course.name}],
    ), patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
        return_value=[{"id": assignment.classroom_assignment_id, "title": "Updated LMS title"}],
    ):
        response = completion_client.post(
            "/api/v1/classroom/sync", headers=authorization(assignment.user_id),
            json={"refresh_token": "test-access-token"},
        )
    assert response.status_code == 200
    completion_db.refresh(assignment)
    assert assignment.title == "Updated LMS title"
    assert assignment.is_completed is True
    assert assignment.state == "PUBLISHED"

