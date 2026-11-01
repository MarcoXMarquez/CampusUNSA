"""
US-24 Test Suite: Seamless Google Classroom OAuth Consent & Automated Background Sync.
Validates:
- Classroom connection status checking
- Google OAuth 2.0 authorization code exchange and encrypted token persistence
- Transparent synchronization using stored refresh tokens
- Error handling for unconnected users and revoked tokens (NEEDS_REAUTH)
- Direct GoogleOAuthService and token encryption utilities
"""

import uuid
from typing import Dict
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
from app.services.classroom_sync import GoogleClassroomAuthError


@pytest.fixture
def test_db_session() -> Session:
    """Provides an isolated SQLite in-memory database session."""
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
def auth_student(test_db_session: Session) -> User:
    """Creates a persistent test student in the test database."""
    student = User(
        id=uuid.uuid4(),
        email="student.test@unsa.edu.pe",
        cui="20210001",
        role="student",
        is_active=True,
    )
    test_db_session.add(student)
    test_db_session.commit()
    test_db_session.refresh(student)
    return student


@pytest.fixture
def auth_headers(auth_student: User) -> Dict[str, str]:
    """Generates valid Bearer authentication headers for the test student."""
    token = create_access_token(data={"sub": str(auth_student.id), "role": auth_student.role})
    return {"Authorization": f"Bearer {token}"}


def test_classroom_status_disconnected_by_default(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that a newly registered student reports disconnected Classroom status."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.get("/api/v1/auth/google/classroom/status", headers=auth_headers)
        assert res.status_code == 200
        data = res.json()
        assert data["connected"] is False
        assert data["connected_at"] is None
        assert data["sync_status"] == "NOT_CONNECTED"

    app.dependency_overrides.clear()


@patch("app.services.google_oauth.GoogleOAuthService.exchange_code_for_tokens")
def test_classroom_oauth_callback_success(
    mock_exchange: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests successful code exchange, encrypted token persistence, and status update."""
    mock_exchange.return_value = {
        "access_token": "mock_google_access_token_123",
        "refresh_token": "mock_google_refresh_token_456",
        "expires_in": 3600,
        "token_type": "Bearer",
    }
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/google/classroom/callback",
            headers=auth_headers,
            json={"code": "valid_oauth_authorization_code"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "CONNECTED"
        assert data["connected_at"] is not None

        # Verify database record
        test_db_session.expire_all()
        updated_user = test_db_session.query(User).filter(User.id == auth_student.id).first()
        assert updated_user is not None
        assert updated_user.google_refresh_token is not None
        # Must be encrypted, not stored in plaintext
        assert updated_user.google_refresh_token != "mock_google_refresh_token_456"
        assert updated_user.google_classroom_sync_status == "CONNECTED"
        assert updated_user.google_classroom_connected_at is not None

        # Status endpoint should now report connected
        status_res = client.get("/api/v1/auth/google/classroom/status", headers=auth_headers)
        assert status_res.status_code == 200
        assert status_res.json()["connected"] is True

    app.dependency_overrides.clear()


@patch("app.services.google_oauth.GoogleOAuthService.exchange_code_for_tokens")
def test_classroom_oauth_callback_error(
    mock_exchange: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests handling of failed code exchange (invalid code, Google rejected request)."""
    mock_exchange.side_effect = ValueError("Invalid authorization code from Google")
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/auth/google/classroom/callback",
            headers=auth_headers,
            json={"code": "expired_or_invalid_code"},
        )
        assert res.status_code == 400
        data = res.json()
        assert "Invalid authorization code" in str(data)

    app.dependency_overrides.clear()


def test_sync_without_token_unconnected_user_rejected(
    test_db_session: Session,
    auth_headers: Dict[str, str],
) -> None:
    """Tests that calling /sync with no token for an unconnected user returns HTTP 400."""
    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/classroom/sync",
            headers=auth_headers,
            json={},
        )
        assert res.status_code == 400
        data = res.json()
        assert data["detail"]["code"] == "CLASSROOM_NOT_CONNECTED"

    app.dependency_overrides.clear()


@patch("app.services.classroom_sync.ClassroomApiClient.fetch_coursework")
@patch("app.services.classroom_sync.ClassroomApiClient.fetch_courses")
@patch("app.services.google_oauth.GoogleOAuthService.refresh_access_token")
def test_sync_automatic_with_stored_refresh_token(
    mock_refresh: MagicMock,
    mock_fetch_courses: MagicMock,
    mock_fetch_coursework: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests automatic sync without passing tokens in payload when user has connected Classroom."""
    from app.services.token_encryption import encrypt_token

    # Setup student with stored encrypted token
    auth_student.google_refresh_token = encrypt_token("sample_stored_refresh_token")
    auth_student.google_classroom_sync_status = "CONNECTED"
    test_db_session.commit()

    mock_refresh.return_value = "fresh_google_access_token"
    mock_fetch_courses.return_value = [
        {
            "id": "c-auto-1",
            "name": "Distributed Systems",
            "section": "Sec A",
            "alternateLink": "https://classroom.google.com/c/c-auto-1",
            "courseState": "ACTIVE",
        }
    ]
    mock_fetch_coursework.return_value = [
        {
            "id": "cw-auto-1",
            "courseId": "c-auto-1",
            "title": "Lab 1 Assignment",
            "description": "Submit code",
            "dueDate": {"year": 2026, "month": 11, "day": 15},
            "dueTime": {"hours": 23, "minutes": 59},
            "maxPoints": 20.0,
            "state": "PUBLISHED",
            "alternateLink": "https://classroom.google.com/c/c-auto-1/a/cw-auto-1",
        }
    ]

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/classroom/sync",
            headers=auth_headers,
            json={},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "SYNCED"
        assert data["synced_courses_count"] == 1
        assert data["synced_assignments_count"] == 1

        mock_refresh.assert_called_once_with("sample_stored_refresh_token")
        mock_fetch_courses.assert_called_once_with("fresh_google_access_token")

    app.dependency_overrides.clear()


@patch("app.services.google_oauth.GoogleOAuthService.refresh_access_token")
def test_sync_revoked_stored_token_sets_needs_reauth(
    mock_refresh: MagicMock,
    test_db_session: Session,
    auth_headers: Dict[str, str],
    auth_student: User,
) -> None:
    """Tests that expired or revoked stored refresh tokens flag user as NEEDS_REAUTH."""
    from app.services.token_encryption import encrypt_token

    auth_student.google_refresh_token = encrypt_token("revoked_refresh_token")
    auth_student.google_classroom_sync_status = "CONNECTED"
    test_db_session.commit()

    mock_refresh.side_effect = GoogleClassroomAuthError("Token has been expired or revoked by user")

    app.dependency_overrides[get_db] = lambda: test_db_session

    with TestClient(app) as client:
        res = client.post(
            "/api/v1/classroom/sync",
            headers=auth_headers,
            json={},
        )
        assert res.status_code == 401
        data = res.json()
        assert data["detail"]["code"] == "NEEDS_REAUTH"

        test_db_session.expire_all()
        refreshed_user = test_db_session.query(User).filter(User.id == auth_student.id).first()
        assert refreshed_user is not None
        assert refreshed_user.google_classroom_sync_status == "NEEDS_REAUTH"

    app.dependency_overrides.clear()


def test_token_encryption_empty_strings() -> None:
    """Tests encryption service edge cases with empty strings."""
    from app.services.token_encryption import decrypt_token, encrypt_token

    assert encrypt_token("") == ""
    assert decrypt_token("") == ""


def test_google_oauth_service_validation_errors() -> None:
    """Tests client-side parameter validation for Google OAuth service."""
    from app.services.google_oauth import GoogleOAuthService

    with pytest.raises(ValueError, match="Authorization code is required"):
        GoogleOAuthService.exchange_code_for_tokens("")

    with pytest.raises(GoogleClassroomAuthError, match="No refresh token provided"):
        GoogleOAuthService.refresh_access_token("")


@patch("httpx.Client.post")
def test_google_oauth_service_exchange_success(mock_post: MagicMock) -> None:
    """Tests successful HTTP exchange with Google OAuth token endpoint."""
    from app.services.google_oauth import GoogleOAuthService

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "access_token": "acc_123",
        "refresh_token": "ref_456",
        "expires_in": 3600,
    }
    mock_post.return_value = mock_resp

    data = GoogleOAuthService.exchange_code_for_tokens("code_test_123")
    assert data["access_token"] == "acc_123"
    assert data["refresh_token"] == "ref_456"


@patch("httpx.Client.post")
def test_google_oauth_service_exchange_failure(mock_post: MagicMock) -> None:
    """Tests Google OAuth token endpoint returning an error response."""
    from app.services.google_oauth import GoogleOAuthService

    mock_resp = MagicMock()
    mock_resp.status_code = 400
    mock_resp.text = "invalid_grant"
    mock_resp.json.return_value = {"error": "invalid_grant", "error_description": "Code expired"}
    mock_post.return_value = mock_resp

    with pytest.raises(ValueError, match="Code expired"):
        GoogleOAuthService.exchange_code_for_tokens("expired_code")


@patch("httpx.Client.post")
def test_google_oauth_service_refresh_success(mock_post: MagicMock) -> None:
    """Tests successful token refresh call to Google OAuth token endpoint."""
    from app.services.google_oauth import GoogleOAuthService

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"access_token": "new_fresh_acc_token"}
    mock_post.return_value = mock_resp

    token = GoogleOAuthService.refresh_access_token("valid_refresh_token")
    assert token == "new_fresh_acc_token"


@patch("httpx.Client.post")
def test_google_oauth_service_refresh_revoked(mock_post: MagicMock) -> None:
    """Tests token refresh call when Google returns 401 unauthorized."""
    from app.services.google_oauth import GoogleOAuthService

    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_post.return_value = mock_resp

    with pytest.raises(GoogleClassroomAuthError, match="expired or revoked"):
        GoogleOAuthService.refresh_access_token("revoked_refresh_token")
