from unittest.mock import patch, MagicMock
import uuid
from fastapi.testclient import TestClient

from app.core.security import hash_password


def test_login_rejects_external_email_domain(client: TestClient):
    """
    REQ-01 / Scenario 2:
    Login attempts from non-institutional domains (e.g. @gmail.com)
    must be rejected immediately with HTTP 403 Forbidden and code DOMAIN_NOT_ALLOWED.
    """
    mock_payload = {
        "email": "estudiante@gmail.com",
        "hd": "gmail.com",
        "name": "External User",
        "sub": "google-oauth-11111",
    }

    with patch("app.api.v1.auth.verify_google_id_token", return_value=mock_payload):
        response = client.post(
            "/api/v1/auth/google",
            json={"token": "mock-external-token"},
        )

    assert response.status_code == 403
    data = response.json()
    assert data["detail"]["code"] == "DOMAIN_NOT_ALLOWED"
    assert "unsa.edu.pe" in data["detail"]["message"].lower()


def test_login_rejects_invalid_or_expired_google_token(client: TestClient):
    """
    REQ-01 / Boundary:
    Invalid, corrupt, or expired Google tokens must trigger HTTP 401 Unauthorized.
    """
    with patch(
        "app.api.v1.auth.verify_google_id_token",
        side_effect=ValueError("Token expired or verification failed"),
    ):
        response = client.post(
            "/api/v1/auth/google",
            json={"token": "invalid-expired-token"},
        )

    assert response.status_code == 401
    data = response.json()
    assert data["detail"]["code"] == "INVALID_CREDENTIALS"


def test_login_success_with_institutional_email(client: TestClient, mock_db_session: MagicMock):
    """
    REQ-01 / Scenario 1:
    Valid @unsa.edu.pe accounts must be issued a signed JWT session cookie/token
    with user role 'student' and profile data initialized.
    """
    mock_payload = {
        "email": "mromero@unsa.edu.pe",
        "hd": "unsa.edu.pe",
        "name": "Marco Romero",
        "sub": "google-oauth-22222",
    }

    # Simulate existing or created user in DB
    mock_user = MagicMock()
    mock_user.id = "b4f2c001-0000-0000-0000-000000000001"
    mock_user.email = "mromero@unsa.edu.pe"
    mock_user.role = "student"
    mock_user.full_name = "Marco Romero"

    with patch("app.api.v1.auth.verify_google_id_token", return_value=mock_payload), \
         patch("app.api.v1.auth.get_or_create_user", return_value=mock_user):
        response = client.post(
            "/api/v1/auth/google",
            json={"token": "valid-institutional-token"},
        )

    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "mromero@unsa.edu.pe"
    assert data["user"]["role"] == "student"


def test_get_current_user_me_authenticated(client: TestClient):
    """
    REQ-02 / Session Validation:
    Protected route GET /api/v1/auth/me returns the profile when provided a valid JWT.
    """
    mock_user = MagicMock()
    mock_user.id = "b4f2c001-0000-0000-0000-000000000001"
    mock_user.email = "mromero@unsa.edu.pe"
    mock_user.role = "student"
    mock_user.full_name = "Marco Romero"

    with patch("app.api.v1.auth.get_current_user", return_value=mock_user):
        response = client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer mock-valid-jwt"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "mromero@unsa.edu.pe"
    assert data["role"] == "student"


def test_get_current_user_me_unauthorized_without_token(client: TestClient):
    """
    REQ-02 / Session Validation:
    GET /api/v1/auth/me without an Authorization header must return HTTP 401 Unauthorized.
    """
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_login_rejects_demo_token_bypass(client: TestClient):
    """
    The literal 'demo' token must never bypass Google ID token verification.
    """
    with patch(
        "app.api.v1.auth.verify_google_id_token",
        side_effect=ValueError("Invalid token"),
    ):
        response = client.post(
            "/api/v1/auth/google",
            json={"token": "demo"},
        )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_email_password_login_success_with_institutional_email(client: TestClient, mock_db_session: MagicMock):
    """
    Valid @unsa.edu.pe credentials register a student with password_hash and authenticate subsequent logins.
    """
    mock_db_session.query.return_value.filter.return_value.first.return_value = None

    signup_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "alumnosistema@unsa.edu.pe",
            "password": "validpassword123",
            "full_name": "Alumno Sistema",
        },
    )

    assert signup_response.status_code == 200
    signup_data = signup_response.json()
    assert "access_token" in signup_data
    assert signup_data["token_type"] == "bearer"
    assert signup_data["user"]["email"] == "alumnosistema@unsa.edu.pe"
    assert signup_data["user"]["role"] == "student"

    existing_user = MagicMock()
    existing_user.id = uuid.UUID("b4f2c001-0000-0000-0000-000000000099")
    existing_user.email = "alumnosistema@unsa.edu.pe"
    existing_user.role = "student"
    existing_user.is_active = True
    existing_user.full_name = "Alumno Sistema"
    existing_user.password_hash = hash_password("validpassword123")
    mock_db_session.query.return_value.filter.return_value.first.return_value = existing_user

    signin_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "alumnosistema@unsa.edu.pe",
            "password": "validpassword123",
        },
    )

    assert signin_response.status_code == 200
    signin_data = signin_response.json()
    assert "access_token" in signin_data
    assert signin_data["user"]["email"] == "alumnosistema@unsa.edu.pe"


def test_email_password_login_rejects_wrong_password(client: TestClient, mock_db_session: MagicMock):
    """
    Existing institutional accounts with a stored password_hash must reject incorrect passwords with HTTP 401.
    """
    existing_user = MagicMock()
    existing_user.id = uuid.UUID("b4f2c001-0000-0000-0000-000000000101")
    existing_user.email = "estudiante@unsa.edu.pe"
    existing_user.role = "student"
    existing_user.is_active = True
    existing_user.password_hash = hash_password("correct-horse-battery")
    mock_db_session.query.return_value.filter.return_value.first.return_value = existing_user

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "estudiante@unsa.edu.pe",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_email_password_login_rejects_account_without_password_hash(client: TestClient, mock_db_session: MagicMock):
    """
    Existing OAuth-only or staff accounts without password_hash must reject password login with HTTP 401.
    """
    oauth_or_staff_user = MagicMock()
    oauth_or_staff_user.id = uuid.UUID("b4f2c001-0000-0000-0000-000000000102")
    oauth_or_staff_user.email = "secretary@unsa.edu.pe"
    oauth_or_staff_user.role = "secretary"
    oauth_or_staff_user.is_active = True
    oauth_or_staff_user.password_hash = None
    mock_db_session.query.return_value.filter.return_value.first.return_value = oauth_or_staff_user

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "secretary@unsa.edu.pe",
            "password": "any-password",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "INVALID_CREDENTIALS"


def test_email_password_login_rejects_external_domain(client: TestClient):
    """
    Attempts to sign in with an external non-UNSA email domain must be rejected with HTTP 403 DOMAIN_NOT_ALLOWED.
    """
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "intruso@gmail.com",
            "password": "somepassword123",
        },
    )

    assert response.status_code == 403
    data = response.json()
    assert data["detail"]["code"] == "DOMAIN_NOT_ALLOWED"
    assert "unsa.edu.pe" in data["detail"]["message"].lower()


def test_email_password_login_rejects_empty_password(client: TestClient):
    """
    Attempts to submit an empty password must return HTTP 400 with INVALID_CREDENTIALS.
    """
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "estudiante@unsa.edu.pe",
            "password": "   ",
        },
    )

    assert response.status_code == 400
    data = response.json()
    assert data["detail"]["code"] == "INVALID_CREDENTIALS"
    assert "empty" in data["detail"]["message"].lower()
