from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from typing import Any, Dict, Optional
import uuid

import httpx
from fastapi import HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User

PBKDF2_ITERATIONS = 100_000


def hash_password(password: str) -> str:
    """Hashes a plaintext password with PBKDF2-HMAC-SHA256 and a random 16-byte salt."""
    salt_hex = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt_hex),
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt_hex}${digest.hex()}"


def verify_password(plain_password: str, stored_hash: Optional[str]) -> bool:
    """Verifies a plaintext password against a stored PBKDF2-HMAC-SHA256 hash using constant-time comparison."""
    if not plain_password or not stored_hash:
        return False
    parts = stored_hash.split("$")
    if len(parts) != 4 or parts[0] != "pbkdf2_sha256":
        return False
    try:
        iterations = int(parts[1])
        salt = bytes.fromhex(parts[2])
        expected_digest = bytes.fromhex(parts[3])
    except ValueError:
        return False
    if iterations < 1 or not salt:
        return False
    computed_digest = hashlib.pbkdf2_hmac(
        "sha256",
        plain_password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(computed_digest, expected_digest)

# OAuth2 scheme for Bearer token extraction
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/google",
    auto_error=True,
)


def validate_institutional_email(email: str) -> None:
    """
    Validates that an email belongs strictly to the institutional domain (@unsa.edu.pe).
    Raises HTTP 403 Forbidden with code DOMAIN_NOT_ALLOWED if invalid.
    """
    normalized_email = email.strip().lower()
    expected_domain = f"@{settings.INSTITUTIONAL_DOMAIN.lower()}"
    if not normalized_email.endswith(expected_domain):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "DOMAIN_NOT_ALLOWED",
                "message": f"Only @{settings.INSTITUTIONAL_DOMAIN} institutional email addresses are permitted.",
            },
        )


def verify_google_id_token(token: str) -> Dict[str, Any]:
    """
    Verifies a Google ID token by querying Google's tokeninfo validation endpoint.
    Raises ValueError if the token is invalid, expired, or verification fails.
    """
    tokeninfo_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
    try:
        response = httpx.get(tokeninfo_url, timeout=10.0)
        if response.status_code != 200:
            raise ValueError(f"Google token verification failed with status {response.status_code}")
        payload = response.json()
        if "email" not in payload:
            raise ValueError("Google token payload does not contain an email address")
        return payload
    except Exception as exc:
        raise ValueError(f"Token expired or verification failed: {exc}") from exc


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    Generates a signed JWT access token using the project secret key and HS256 algorithm.
    """
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    """
    Decodes and validates a signed JWT access token.
    Raises HTTPException 401 if invalid or expired.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Could not validate access credentials.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user_from_db(token: str, db: Session) -> User:
    """
    Resolves an active User entity from a decoded JWT Bearer token.
    """
    payload = decode_access_token(token)
    user_id_str: Optional[str] = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Token does not contain user identity.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_uuid = uuid.UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Malformed user identifier in token.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "USER_NOT_FOUND",
                "message": "Authenticated user not found in database.",
            },
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "USER_INACTIVE",
                "message": "User account is deactivated.",
            },
        )
    return user
