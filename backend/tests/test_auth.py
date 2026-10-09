from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient


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
