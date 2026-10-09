import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException

from app.core.security import (
    create_access_token,
    decode_access_token,
    get_current_user_from_db,
    validate_institutional_email,
    verify_google_id_token,
)
from app.models.user import User
from app.api.v1.auth import get_or_create_user


def test_validate_institutional_email_valid():
    # Should not raise exception
    validate_institutional_email("student@unsa.edu.pe")
    validate_institutional_email("PROFESSOR@UNSA.EDU.PE ")


def test_validate_institutional_email_invalid():
    with pytest.raises(HTTPException) as exc_info:
        validate_institutional_email("intruder@yahoo.com")
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "DOMAIN_NOT_ALLOWED"


def test_create_and_decode_access_token():
    test_data = {"sub": str(uuid.uuid4()), "role": "student"}
    token = create_access_token(test_data, expires_delta=timedelta(minutes=15))
    decoded = decode_access_token(token)
    assert decoded["sub"] == test_data["sub"]
    assert decoded["role"] == "student"


def test_decode_invalid_token():
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token("corrupt.token.value")
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["code"] == "INVALID_CREDENTIALS"


def test_verify_google_id_token_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"email": "user@unsa.edu.pe", "name": "Test User"}

    with patch("httpx.get", return_value=mock_response):
        payload = verify_google_id_token("mock-token")
    assert payload["email"] == "user@unsa.edu.pe"


def test_verify_google_id_token_failure_status():
    mock_response = MagicMock()
    mock_response.status_code = 400

    with patch("httpx.get", return_value=mock_response):
        with pytest.raises(ValueError):
            verify_google_id_token("invalid-token")


def test_verify_google_id_token_missing_email():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"name": "No Email"}

    with patch("httpx.get", return_value=mock_response):
        with pytest.raises(ValueError):
            verify_google_id_token("token-no-email")


def test_get_current_user_from_db_success():
    user_id = uuid.uuid4()
    mock_user = User(id=user_id, email="test@unsa.edu.pe", role="student", is_active=True)

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_user

    token = create_access_token({"sub": str(user_id)})
    resolved_user = get_current_user_from_db(token, mock_db)
    assert resolved_user.id == user_id


def test_get_current_user_from_db_missing_sub():
    token = create_access_token({"role": "student"})
    mock_db = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_db(token, mock_db)
    assert exc_info.value.status_code == 401


def test_get_current_user_from_db_invalid_uuid():
    token = create_access_token({"sub": "not-a-valid-uuid"})
    mock_db = MagicMock()

    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_db(token, mock_db)
    assert exc_info.value.status_code == 401


def test_get_current_user_from_db_not_found():
    token = create_access_token({"sub": str(uuid.uuid4())})
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_db(token, mock_db)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["code"] == "USER_NOT_FOUND"


def test_get_current_user_from_db_inactive():
    user_id = uuid.uuid4()
    inactive_user = User(id=user_id, email="test@unsa.edu.pe", role="student", is_active=False)
    token = create_access_token({"sub": str(user_id)})
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = inactive_user

    with pytest.raises(HTTPException) as exc_info:
        get_current_user_from_db(token, mock_db)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "USER_INACTIVE"


def test_get_or_create_user_existing():
    existing_user = User(id=uuid.uuid4(), email="existing@unsa.edu.pe", role="student")
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = existing_user

    payload = {"email": "existing@unsa.edu.pe", "name": "Existing User"}
    user = get_or_create_user(mock_db, payload)
    assert user.email == "existing@unsa.edu.pe"


def test_get_or_create_user_new():
    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = None

    payload = {"email": "new@unsa.edu.pe", "name": "New Student", "picture": "https://example.com/photo.jpg"}
    user = get_or_create_user(mock_db, payload)
    assert user.email == "new@unsa.edu.pe"
    assert mock_db.add.called
    assert mock_db.commit.called
