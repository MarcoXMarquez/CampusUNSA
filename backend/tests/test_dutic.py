"""
US-23 Test Suite: UNSA Moodle (DUTIC) Course & Assignment Synchronization Engine.
Covers:
- Course and coursework fetching & persistence via native Moodle AJAX client
- Hidden tasks detection via deep course module scan (mod_assign)
- Deduplication and idempotent upserting (origin='moodle')
- Expired session handling (HTTP 401 -> NEEDS_REAUTH)
- Empty courses handling
- REST endpoints security (mandatory Bearer authentication)
"""

import uuid
from typing import Any, Dict, List
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.user import User


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
        cui="20205678",
        role="student",
        is_active=True,
    )
    test_db_session.add(student)
    test_db_session.commit()
    test_db_session.refresh(student)

    token = create_access_token(data={"sub": str(student.id), "role": "student"})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_moodle_courses() -> List[Dict[str, Any]]:
    """Sample mock courses returned by Moodle AJAX core_course_get_enrolled_courses_by_timeline_classification."""
    return [
        {
            "id": 10501,
            "fullname": "1704231 - INGENIERÍA DE SOFTWARE 3 - GRUPO A",
            "shortname": "1704231-IS3-A",
            "contacts": [{"name": "Ing. Docente Principal", "role": "Profesor"}],
        },
        {
            "id": 10502,
            "fullname": "1704232 - ARQUITECTURA DE SISTEMAS - GRUPO B",
            "shortname": "1704232-ARQ-B",
            "contacts": [{"name": "Ing. Docente Secundario", "role": "Profesor"}],
        },
    ]


@pytest.fixture
def mock_moodle_tasks() -> List[Dict[str, Any]]:
    """Sample mock assignments returned from Moodle timeline and course module inspection."""
    return [
        {
            "id": 8801,
            "courseId": 10501,
            "name": "Práctica Calificada 03 - Patrones de Diseño",
            "dueDate": 1793318340,  # Epoch timestamp
            "submission": "not-submitted",
            "hidden": False,
            "url": "https://aulavirtual.unsa.edu.pe/mod/assign/view.php?id=8801",
            "grade": None,
        },
        {
            "id": 8802,
            "courseId": 10502,
            "name": "Laboratorio 04 - Pipeline CI/CD",
            "dueDate": 1793404740,
            "submission": "submitted",
            "hidden": False,
            "url": "https://aulavirtual.unsa.edu.pe/mod/assign/view.php?id=8802",
            "grade": "18.00 / 20.00",
        },
    ]


# ---------------------------------------------------------------------------
# Test Cases (Phase Red for US-23)
# ---------------------------------------------------------------------------

def test_dutic_sync_courses_and_assignments_success(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_moodle_courses: List[Dict[str, Any]],
    mock_moodle_tasks: List[Dict[str, Any]],
) -> None:
    """
    US-23 / Scenario 1:
    Authenticated student provides DUTIC session credentials.
    Active courses and pending coursework must be pulled from Moodle and persisted with origin='moodle'.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        return_value=mock_moodle_courses,
    ), patch(
        "app.services.dutic_sync.DuticApiClient.fetch_all_tasks",
        return_value=mock_moodle_tasks,
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/dutic/sync",
                headers=auth_student_headers,
                json={"moodle_session": "valid_cookie_123", "sesskey": "valid_sesskey_abc"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SYNCED"
    assert data["synced_courses_count"] == 2
    assert data["synced_assignments_count"] == 2


def test_dutic_sync_hidden_tasks_detection(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_moodle_courses: List[Dict[str, Any]],
) -> None:
    """
    US-23 Core Feature:
    Hidden assignments not visible in the Moodle calendar timeline must be detected
    via deep course scanning and marked as hidden=True in persistence.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    tasks_with_hidden = [
        {
            "id": 9901,
            "courseId": 10501,
            "name": "Tarea Oculta No Listada en Calendario",
            "dueDate": 1793500000,
            "submission": "not-submitted",
            "hidden": True,
            "url": "https://aulavirtual.unsa.edu.pe/mod/assign/view.php?id=9901",
            "grade": None,
        }
    ]

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        return_value=mock_moodle_courses,
    ), patch(
        "app.services.dutic_sync.DuticApiClient.fetch_all_tasks",
        return_value=tasks_with_hidden,
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/dutic/sync",
                headers=auth_student_headers,
                json={"moodle_session": "cookie", "sesskey": "key"},
            )
            assert response.status_code == 200

            # Verify through assignment query endpoint
            get_res = test_client.get(
                "/api/v1/dutic/assignments",
                headers=auth_student_headers,
            )
            assert get_res.status_code == 200
            assignments = get_res.json()
            assert len(assignments) == 1
            assert assignments[0]["origin"] == "moodle"
            assert assignments[0]["title"] == "Tarea Oculta No Listada en Calendario"

    app.dependency_overrides.clear()


def test_dutic_sync_deduplication_updates_existing_assignment(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_moodle_courses: List[Dict[str, Any]],
) -> None:
    """
    US-23 / Deduplication:
    Re-synchronizing an assignment with updated submission status or grade
    must update the existing record rather than inserting a duplicate.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    initial_tasks = [
        {
            "id": 7701,
            "courseId": 10501,
            "name": "Avance de Proyecto Final",
            "dueDate": 1793500000,
            "submission": "not-submitted",
            "hidden": False,
            "url": "https://aulavirtual.unsa.edu.pe/mod/assign/view.php?id=7701",
            "grade": None,
        }
    ]

    updated_tasks = [
        {
            "id": 7701,
            "courseId": 10501,
            "name": "Avance de Proyecto Final",
            "dueDate": 1793500000,
            "submission": "graded",
            "hidden": False,
            "url": "https://aulavirtual.unsa.edu.pe/mod/assign/view.php?id=7701",
            "grade": "19.00 / 20.00",
        }
    ]

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        return_value=mock_moodle_courses,
    ):
        with patch(
            "app.services.dutic_sync.DuticApiClient.fetch_all_tasks",
            return_value=initial_tasks,
        ):
            with TestClient(app) as test_client:
                res1 = test_client.post(
                    "/api/v1/dutic/sync",
                    headers=auth_student_headers,
                    json={"moodle_session": "cookie", "sesskey": "key"},
                )
                assert res1.status_code == 200

        with patch(
            "app.services.dutic_sync.DuticApiClient.fetch_all_tasks",
            return_value=updated_tasks,
        ):
            with TestClient(app) as test_client:
                res2 = test_client.post(
                    "/api/v1/dutic/sync",
                    headers=auth_student_headers,
                    json={"moodle_session": "cookie", "sesskey": "key"},
                )
                assert res2.status_code == 200

                get_res = test_client.get(
                    "/api/v1/dutic/assignments",
                    headers=auth_student_headers,
                )
                assert get_res.status_code == 200
                assignments = get_res.json()
                assert len(assignments) == 1
                assert assignments[0]["state"] == "graded"

    app.dependency_overrides.clear()


def test_dutic_sync_expired_session_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
) -> None:
    """
    US-23 / Expired Session:
    When Moodle rejects the MoodleSession cookie (requireloginerror),
    the endpoint returns HTTP 401 with NEEDS_REAUTH detail cleanly.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    from app.services.dutic_sync import DuticSessionExpiredError

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        side_effect=DuticSessionExpiredError("Moodle session expired or invalid"),
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/dutic/sync",
                headers=auth_student_headers,
                json={"moodle_session": "expired_cookie", "sesskey": "expired_key"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 401
    data = response.json()
    assert data["detail"]["code"] == "NEEDS_REAUTH"
    assert "reauth" in data["detail"]["message"].lower()


def test_dutic_sync_empty_courses_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
) -> None:
    """
    US-23 Boundary:
    When a student has 0 enrolled courses in Moodle, sync finishes cleanly with 0 items.
    """
    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        return_value=[],
    ), patch(
        "app.services.dutic_sync.DuticApiClient.fetch_all_tasks",
        return_value=[],
    ):
        with TestClient(app) as test_client:
            response = test_client.post(
                "/api/v1/dutic/sync",
                headers=auth_student_headers,
                json={"moodle_session": "cookie", "sesskey": "key"},
            )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "SYNCED"
    assert data["synced_courses_count"] == 0
    assert data["synced_assignments_count"] == 0


def test_dutic_endpoints_require_authentication(client: TestClient) -> None:
    """All DUTIC Moodle endpoints reject unauthenticated requests with HTTP 401."""
    sync_res = client.post("/api/v1/dutic/sync", json={"moodle_session": "c", "sesskey": "k"})
    assert sync_res.status_code == 401

    courses_res = client.get("/api/v1/dutic/courses")
    assert courses_res.status_code == 401

    assignments_res = client.get("/api/v1/dutic/assignments")
    assert assignments_res.status_code == 401


def test_get_dutic_courses_endpoint(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
    mock_moodle_courses: List[Dict[str, Any]],
) -> None:
    """Test retrieving synced Moodle courses via GET /api/v1/dutic/courses."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        return_value=mock_moodle_courses,
    ), patch(
        "app.services.dutic_sync.DuticApiClient.fetch_all_tasks",
        return_value=[],
    ):
        with TestClient(app) as test_client:
            sync_res = test_client.post(
                "/api/v1/dutic/sync",
                headers=auth_student_headers,
                json={"moodle_session": "cookie", "sesskey": "key"},
            )
            assert sync_res.status_code == 200

            courses_res = test_client.get(
                "/api/v1/dutic/courses",
                headers=auth_student_headers,
            )
            assert courses_res.status_code == 200
            courses = courses_res.json()
            assert len(courses) == 2

    app.dependency_overrides.clear()


def test_dutic_api_client_ajax_batch_unit() -> None:
    """Direct unit tests for DuticApiClient HTTP and AJAX batch handling."""
    from unittest.mock import MagicMock
    from app.services.dutic_sync import (
        DuticApiClient,
        DuticSessionExpiredError,
        DuticRateLimitError,
    )
    import httpx

    # Happy path batch
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = '[{"error": false, "data": {"courses": [{"id": 1, "fullname": "IS3"}]}}]'
    mock_resp.json.return_value = [{"error": False, "data": {"courses": [{"id": 1, "fullname": "IS3"}]}}]

    with patch.object(httpx.Client, "post", return_value=mock_resp):
        courses = DuticApiClient.fetch_enrolled_courses("session", "key")
        assert len(courses) == 1
        assert courses[0]["fullname"] == "IS3"

    # Happy path timeline tasks
    mock_resp_tasks = MagicMock()
    mock_resp_tasks.status_code = 200
    mock_resp_tasks.text = '[{"error": false, "data": {"events": [{"id": 50, "modulename": "assign", "name": "Task 1", "timesort": 1700000000}]}}]'
    mock_resp_tasks.json.return_value = [{"error": False, "data": {"events": [{"id": 50, "modulename": "assign", "name": "Task 1", "timesort": 1700000000}]}}]

    with patch.object(httpx.Client, "post", return_value=mock_resp_tasks):
        tasks = DuticApiClient.fetch_all_tasks("session", "key")
        assert len(tasks) == 1
        assert tasks[0]["name"] == "Task 1"

    # Moodle requireloginerror in payload
    mock_resp_login_err = MagicMock()
    mock_resp_login_err.status_code = 200
    mock_resp_login_err.text = '[{"error": true, "exception": {"errorcode": "requireloginerror"}}]'
    mock_resp_login_err.json.return_value = [{"error": True, "exception": {"errorcode": "requireloginerror"}}]

    with patch.object(httpx.Client, "post", return_value=mock_resp_login_err):
        with pytest.raises(DuticSessionExpiredError):
            DuticApiClient.fetch_enrolled_courses("session", "key")

    # Moodle 303 Redirect to login
    mock_resp_303 = MagicMock()
    mock_resp_303.status_code = 303
    with patch.object(httpx.Client, "post", return_value=mock_resp_303):
        with pytest.raises(DuticSessionExpiredError):
            DuticApiClient.fetch_enrolled_courses("session", "key")

    # Moodle 429 Rate limit
    mock_resp_429 = MagicMock()
    mock_resp_429.status_code = 429
    mock_resp_429.raise_for_status.side_effect = httpx.HTTPStatusError("Rate limited", request=MagicMock(), response=mock_resp_429)
    with patch.object(httpx.Client, "post", return_value=mock_resp_429):
        with pytest.raises(DuticRateLimitError):
            DuticApiClient.fetch_enrolled_courses("session", "key")


def test_dutic_sync_rate_limited_handling(
    test_db_session: Session,
    auth_student_headers: Dict[str, str],
) -> None:
    """Test handling when Moodle API throws DuticRateLimitError."""
    app.dependency_overrides[get_db] = lambda: test_db_session
    from app.services.dutic_sync import DuticRateLimitError

    with patch(
        "app.services.dutic_sync.DuticApiClient.fetch_enrolled_courses",
        side_effect=DuticRateLimitError("Rate limit exceeded"),
    ):
        with TestClient(app) as test_client:
            res = test_client.post(
                "/api/v1/dutic/sync",
                headers=auth_student_headers,
                json={"moodle_session": "cookie", "sesskey": "key"},
            )
            assert res.status_code == 429
            assert res.json()["detail"]["code"] == "RATE_LIMIT_EXCEEDED"

    app.dependency_overrides.clear()

