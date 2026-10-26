"""
US-04 Test Suite: Google Classroom Course & Assignment Synchronization Engine.
Covers:
- Course and coursework fetching & persistence
- Deduplication and idempotent upserting (student_id, classroom_assignment_id)
- Expired OAuth token handling (HTTP 401 -> NEEDS_REAUTH)
- Rate-limit handling (HTTP 429)
- Empty courses handling
- REST endpoints for synced courses and assignments retrieval
"""

import uuid
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.user import User


# Fixtures for isolated database execution
@pytest.fixture
def test_db_session() -> Session:
    """Provides an isolated SQLite in-memory session with all metadata schemas initialized."""
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


@pytest.fixture
def auth_student_headers(test_db_session: Session) -> Dict[str, str]:
    """Provisions a test student and returns valid Authorization Bearer headers."""
    student = User(
        id=uuid.uuid4(),
        email="test.student@unsa.edu.pe",
        cui="20201234",
        role="student",
        is_active=True,
    )
    test_db_session.add(student)
    test_db_session.commit()
    test_db_session.refresh(student)

    token = create_access_token(data={"sub": str(student.id), "role": "student"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_classroom_courses() -> List[Dict[str, Any]]:
    """Sample mock courses returned by Google Classroom API."""
    return [
        {
            "id": "course-101",
            "name": "Software Engineering III",
            "section": "Group A",
            "alternateLink": "https://classroom.google.com/c/course-101",
            "courseState": "ACTIVE",
        },
        {
            "id": "course-102",
            "name": "Database Architecture",
            "section": "Group B",
            "alternateLink": "https://classroom.google.com/c/course-102",
            "courseState": "ACTIVE",
        },
    ]


@pytest.fixture
def mock_classroom_assignments() -> List[Dict[str, Any]]:
    """Sample mock coursework returned by Google Classroom API."""
    return [
        {
            "id": "assignment-201",
            "courseId": "course-101",
            "title": "Sprint 3 Agile Plan & Delivery",
            "description": "Deliver system architecture and sprint board artifacts.",
            "dueDate": {"year": 2026, "month": 10, "day": 28},
            "dueTime": {"hours": 23, "minutes": 59},
            "maxPoints": 20.0,
            "state": "PUBLISHED",
            "alternateLink": "https://classroom.google.com/c/course-101/a/assignment-201/details",
        },
        {
            "id": "assignment-202",
            "courseId": "course-102",
            "title": "PostgreSQL Indexing Lab",
            "description": "Demonstrate composite index performance on high volume queries.",
            "dueDate": {"year": 2026, "month": 10, "day": 30},
            "dueTime": {"hours": 18, "minutes": 0},
            "maxPoints": 20.0,
            "state": "PUBLISHED",
            "alternateLink": "https://classroom.google.com/c/course-102/a/assignment-202/details",
        },
    ]


# ---------------------------------------------------------------------------
# Test Cases (Phase Red)
# ---------------------------------------------------------------------------

def test_sync_courses_and_coursework_success(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_classroom_courses: List[Dict[str, Any]],
    mock_classroom_assignments: List[Dict[str, Any]],
) -> None:
    """
    Scenario 1: Authenticated student triggers sync.
    All active enrolled courses and pending coursework must be saved in the database.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=mock_classroom_courses,
    ), patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
        return_value=mock_classroom_assignments,
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "mock_refresh_token_123"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SYNCED"
    assert data["synced_courses_count"] == 2
    assert data["synced_assignments_count"] == 2


def test_sync_deduplication_updates_existing_assignment(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_classroom_courses: List[Dict[str, Any]],
) -> None:
    """
    Scenario 1 (Deduplication):
    Re-synchronizing the same assignment with updated title or due date must update
    the existing record rather than inserting a duplicate row.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    initial_assignments = [
        {
            "id": "assignment-301",
            "courseId": "course-101",
            "title": "Initial Draft Title",
            "description": "Initial description.",
            "dueDate": {"year": 2026, "month": 10, "day": 28},
            "dueTime": {"hours": 20, "minutes": 0},
            "maxPoints": 20.0,
            "state": "PUBLISHED",
            "alternateLink": "https://classroom.google.com/details/301",
        }
    ]

    updated_assignments = [
        {
            "id": "assignment-301",
            "courseId": "course-101",
            "title": "Updated Final Title",
            "description": "Updated assignment details with new requirements.",
            "dueDate": {"year": 2026, "month": 10, "day": 31},
            "dueTime": {"hours": 23, "minutes": 59},
            "maxPoints": 20.0,
            "state": "PUBLISHED",
            "alternateLink": "https://classroom.google.com/details/301",
        }
    ]

    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=mock_classroom_courses,
    ):
        with patch(
            "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
            return_value=initial_assignments,
        ):
            with TestClient(app) as test_client:
                first_response = test_client.post(
                    "/api/v1/classroom/sync",
                    headers=auth_student_headers,
                    json={"refresh_token": "mock_refresh_token_123"},
                )
                assert first_response.status_code == 200

        with patch(
            "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
            return_value=updated_assignments,
        ):
            with TestClient(app) as test_client:
                second_response = test_client.post(
                    "/api/v1/classroom/sync",
                    headers=auth_student_headers,
                    json={"refresh_token": "mock_refresh_token_123"},
                )
                assert second_response.status_code == 200

                # Verify list endpoint returns only 1 updated assignment, not 2
                get_response = test_client.get(
                    "/api/v1/classroom/assignments",
                    headers=auth_student_headers,
                )
                assert get_response.status_code == 200
                assignments = get_response.json()
                assert len(assignments) == 1
                assert assignments[0]["title"] == "Updated Final Title"

    app.dependency_overrides.clear()


def test_sync_expired_token_graceful_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
) -> None:
    """
    Scenario 2: Expired Token Graceful Handling.
    When Google Classroom API returns HTTP 401 Unauthorized, the student's sync state
    must be flagged as NEEDS_REAUTH without crashing workers or bubbling unhandled 500s.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    from app.services.classroom_sync import GoogleClassroomAuthError

    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        side_effect=GoogleClassroomAuthError("Token expired or revoked by Google"),
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "expired_refresh_token"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 401
    data = response.json()
    assert data["detail"]["code"] == "NEEDS_REAUTH"
    assert "reauth" in data["detail"]["message"].lower()


def test_sync_rate_limited_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
) -> None:
    """
    REQ-08 Boundary:
    When Google API encounters rate limiting (HTTP 429), the service returns
    HTTP 429 RATE_LIMIT_EXCEEDED gracefully.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    from app.services.classroom_sync import GoogleClassroomRateLimitError

    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        side_effect=GoogleClassroomRateLimitError("Quota exceeded for Classroom API"),
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "mock_token"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 429
    data = response.json()
    assert data["detail"]["code"] == "RATE_LIMIT_EXCEEDED"


def test_sync_empty_courses_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
) -> None:
    """
    REQ-08 Boundary:
    When the student is not enrolled in any active Google Classroom course,
    the sync completes cleanly with 0 items without errors.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=[],
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "mock_token"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SYNCED"
    assert data["synced_courses_count"] == 0
    assert data["synced_assignments_count"] == 0


def test_classroom_endpoints_require_authentication(client: TestClient) -> None:
    """Classroom API endpoints must reject unauthenticated requests with HTTP 401."""
    sync_res = client.post("/api/v1/classroom/sync", json={"refresh_token": "xyz"})
    assert sync_res.status_code == 401

    courses_res = client.get("/api/v1/classroom/courses")
    assert courses_res.status_code == 401

    assignments_res = client.get("/api/v1/classroom/assignments")
    assert assignments_res.status_code == 401


def test_get_student_courses_endpoint(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_classroom_courses: List[Dict[str, Any]],
) -> None:
    """Test retrieving synced courses via GET /api/v1/classroom/courses."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=mock_classroom_courses,
    ), patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
        return_value=[],
    ):
        with TestClient(app) as test_client:
            sync_res = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "token123"},
            )
            assert sync_res.status_code == 200

            courses_res = test_client.get(
                "/api/v1/classroom/courses",
                headers=auth_student_headers,
            )
            assert courses_res.status_code == 200
            courses = courses_res.json()
            assert len(courses) == 2
            assert courses[0]["name"] == "Database Architecture" or courses[1]["name"] == "Database Architecture"

    app.dependency_overrides.clear()


def test_classroom_api_client_fetch_courses_and_coursework_unit() -> None:
    """Direct unit tests for ClassroomApiClient HTTP behaviors."""
    from app.services.classroom_sync import (
        ClassroomApiClient,
        GoogleClassroomAuthError,
        GoogleClassroomRateLimitError,
    )
    import httpx

    # Happy path courses
    mock_resp_courses = MagicMock()
    mock_resp_courses.status_code = 200
    mock_resp_courses.json.return_value = {"courses": [{"id": "c1", "name": "Course 1"}]}

    with patch.object(httpx.Client, "get", return_value=mock_resp_courses):
        courses = ClassroomApiClient.fetch_courses("valid_token")
        assert len(courses) == 1
        assert courses[0]["name"] == "Course 1"

    # Happy path coursework
    mock_resp_work = MagicMock()
    mock_resp_work.status_code = 200
    mock_resp_work.json.return_value = {"courseWork": [{"id": "a1", "title": "HW 1"}]}

    with patch.object(httpx.Client, "get", return_value=mock_resp_work):
        work = ClassroomApiClient.fetch_coursework("valid_token", "c1")
        assert len(work) == 1
        assert work[0]["title"] == "HW 1"

    # 401 Unauthorized courses
    mock_resp_401 = MagicMock()
    mock_resp_401.status_code = 401
    with patch.object(httpx.Client, "get", return_value=mock_resp_401):
        with pytest.raises(GoogleClassroomAuthError):
            ClassroomApiClient.fetch_courses("expired_token")

    # 429 Rate limited coursework
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    with patch.object(httpx.Client, "get", return_value=mock_resp_429):
        with pytest.raises(GoogleClassroomRateLimitError):
            ClassroomApiClient.fetch_coursework("valid_token", "c1")


def test_sync_coursework_errors_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_classroom_courses: List[Dict[str, Any]],
) -> None:
    """Test error handling when coursework endpoint raises 401 or 429."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    from app.services.classroom_sync import (
        GoogleClassroomAuthError,
        GoogleClassroomRateLimitError,
    )

    # 401 during coursework fetch
    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=mock_classroom_courses,
    ), patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
        side_effect=GoogleClassroomAuthError("Coursework token expired"),
    ):
        with TestClient(app) as test_client:
            res_401 = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "token"},
            )
            assert res_401.status_code == 401
            assert res_401.json()["detail"]["code"] == "NEEDS_REAUTH"

    # 429 during coursework fetch
    with patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_courses",
        return_value=mock_classroom_courses,
    ), patch(
        "app.services.classroom_sync.ClassroomApiClient.fetch_coursework",
        side_effect=GoogleClassroomRateLimitError("Rate limit exceeded"),
    ):
        with TestClient(app) as test_client:
            res_429 = test_client.post(
                "/api/v1/classroom/sync",
                headers=auth_student_headers,
                json={"refresh_token": "token"},
            )
            assert res_429.status_code == 429
            assert res_429.json()["detail"]["code"] == "RATE_LIMIT_EXCEEDED"

    app.dependency_overrides.clear()

