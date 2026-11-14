import uuid
from datetime import timedelta
from unittest.mock import MagicMock, patch
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    get_current_user_from_db,
    hash_password,
    validate_institutional_email,
    verify_google_id_token,
    verify_password,
)
from app.models.user import User
from app.api.v1.auth import get_or_create_user
from app.services.token_encryption import decrypt_token, encrypt_token


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


def test_password_hash_and_verify_roundtrip():
    hashed = hash_password("unsaSecret2026")
    assert hashed.startswith("pbkdf2_sha256$100000$")
    assert verify_password("unsaSecret2026", hashed) is True
    assert verify_password("wrongPassword", hashed) is False
    assert verify_password("unsaSecret2026", None) is False
    assert verify_password("unsaSecret2026", "malformed") is False


def test_settings_fail_closed_in_production():
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="production")

    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="prod_jwt_secret_strong_value_123456",
            POSTGRES_PASSWORD="prod_db_password_strong_value",
        )

    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="staging",
            SECRET_KEY="shared_secret_value_not_allowed",
            ENCRYPTION_KEY="shared_secret_value_not_allowed",
            POSTGRES_PASSWORD="prod_db_password_strong_value",
        )

    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            SECRET_KEY="prod_jwt_secret_strong_value_123456",
            ENCRYPTION_KEY="prod_enc_key_distinct_strong_value",
            POSTGRES_PASSWORD="postgres_dev_password",
        )

    valid_prod = Settings(
        ENVIRONMENT="production",
        SECRET_KEY="prod_jwt_secret_strong_value_123456",
        ENCRYPTION_KEY="prod_enc_key_distinct_strong_value",
        POSTGRES_PASSWORD="prod_db_password_strong_value",
    )
    assert valid_prod.ENVIRONMENT == "production"


def test_token_encryption_dedicated_key_and_empty_key_rejection(monkeypatch: pytest.MonkeyPatch):
    import base64
    import hashlib
    from cryptography.fernet import Fernet
    from app.core.config import settings

    ciphertext = encrypt_token("refresh-token-abc")
    assert ciphertext and ciphertext != "refresh-token-abc"
    assert decrypt_token(ciphertext) == "refresh-token-abc"

    # Legacy tokens encrypted with SECRET_KEY remain readable during rotation.
    legacy_key = base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest())
    legacy_ciphertext = Fernet(legacy_key).encrypt(b"legacy-refresh-token").decode("utf-8")
    assert decrypt_token(legacy_ciphertext) == "legacy-refresh-token"

    monkeypatch.setattr(settings, "ENCRYPTION_KEY", "")
    with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
        encrypt_token("refresh-token-abc")
