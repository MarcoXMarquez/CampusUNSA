from datetime import datetime, timezone
from typing import Any, Dict, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user_from_db,
    hash_password,
    oauth2_scheme,
    validate_institutional_email,
    verify_google_id_token,
    verify_password,
)
from app.models.user import User, UserProfile
from app.schemas.auth import EmailLoginRequest, GoogleAuthRequest, TokenResponse, UserResponse
from app.schemas.classroom import (
    ClassroomConsentRequest,
    ClassroomConsentResponse,
    ClassroomStatusResponse,
)
from app.services.google_oauth import GoogleOAuthService
from app.services.token_encryption import encrypt_token

router = APIRouter()


def get_or_create_user(db: Session, google_payload: Dict[str, Any]) -> User:
    """
    Retrieves an existing User by email or provisions a new User and UserProfile.
    """
    email = google_payload.get("email")
    if not email:
        raise ValueError("Payload missing email address")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user_id = uuid.uuid4()
        user = User(
            id=user_id,
            email=email,
            role="student",
            is_active=True,
        )
        full_name = google_payload.get("name") or email.split("@")[0]
        profile = UserProfile(
            user_id=user_id,
            full_name=full_name,
            avatar_url=google_payload.get("picture"),
        )
        user.profile = profile
        db.add(user)
        db.flush()
        db.add(profile)
        db.commit()
        db.refresh(user)

    return user


def authenticate_or_register_email_user(
    db: Session,
    email: str,
    password: str,
    full_name: Optional[str] = None,
) -> User:
    """
    Authenticates an institutional user via stored PBKDF2 password hash,
    or provisions a new student account when the email does not exist yet.
    """
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user_id = uuid.uuid4()
        resolved_name = full_name.strip() if full_name and full_name.strip() else email.split("@")[0]
        user = User(
            id=user_id,
            email=email,
            role="student",
            is_active=True,
            password_hash=hash_password(password),
        )
        profile = UserProfile(
            user_id=user_id,
            full_name=resolved_name,
        )
        user.profile = profile
        db.add(user)
        db.flush()
        db.add(profile)
        db.commit()
        db.refresh(user)
        return user

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "USER_INACTIVE",
                "message": "User account is deactivated.",
            },
        )

    if (
        not user.password_hash
        or not isinstance(user.password_hash, str)
        or not verify_password(password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid institutional email or password",
            },
        )

    return user


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Extracts the authenticated User entity from the provided Bearer token.
    Can be patched in test suites or delegates directly to get_current_user_from_db.
    """
    return get_current_user_from_db(token=token, db=db)


def _resolve_authenticated_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Dynamic dependency indirection that allows get_current_user to be patched in unit tests
    while strictly enforcing oauth2_scheme authentication checks when headers are missing.
    """
    return get_current_user(token=token, db=db)


@router.post("/google", response_model=TokenResponse)
def login_with_google(
    payload: GoogleAuthRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Authenticates a user via Google OAuth ID token.
    Enforces institutional @unsa.edu.pe domain restriction, provisions user profile,
    and returns a signed JWT access token.
    """
    try:
        google_payload = verify_google_id_token(payload.token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid or expired Google token",
            },
        ) from exc

    email = google_payload.get("email", "")
    validate_institutional_email(email)

    user = get_or_create_user(db=db, google_payload=google_payload)

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        }
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login_with_email_password(
    payload: EmailLoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """
    Authenticates a user via institutional @unsa.edu.pe email and password.
    Enforces institutional domain restrictions, verifies PBKDF2 password hashes for existing accounts
    or registers new institutional students, and returns a signed JWT access token.
    """
    cleaned_password = payload.password.strip()
    if not cleaned_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_CREDENTIALS",
                "message": "Password must not be empty",
            },
        )

    cleaned_email = payload.email.strip().lower()
    validate_institutional_email(cleaned_email)

    user = authenticate_or_register_email_user(
        db=db,
        email=cleaned_email,
        password=cleaned_password,
        full_name=payload.full_name,
    )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
        }
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: User = Depends(_resolve_authenticated_user),
) -> UserResponse:
    """
    Returns the profile and authentication claims of the currently logged-in user.
    """
    return UserResponse.model_validate(current_user)


@router.get("/google/classroom/status", response_model=ClassroomStatusResponse)
def get_classroom_connection_status(
    current_user: User = Depends(_resolve_authenticated_user),
) -> ClassroomStatusResponse:
    """
    Retrieves the Google Classroom linkage status and last connection timestamp.
    """
    is_connected = bool(current_user.google_refresh_token)
    return ClassroomStatusResponse(
        connected=is_connected,
        connected_at=current_user.google_classroom_connected_at,
        sync_status=current_user.google_classroom_sync_status,
    )


@router.post("/google/classroom/callback", response_model=ClassroomConsentResponse)
def handle_classroom_oauth_callback(
    payload: ClassroomConsentRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> ClassroomConsentResponse:
    """
    Exchanges Google OAuth authorization code for tokens, securely encrypts the refresh token,
    and marks the student account as connected for automatic background synchronization.
    """
    try:
        token_data = GoogleOAuthService.exchange_code_for_tokens(
            code=payload.code,
            redirect_uri=payload.redirect_uri,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_AUTHORIZATION_CODE",
                "message": str(exc),
            },
        ) from exc

    refresh_token = token_data.get("refresh_token")
    if not refresh_token:
        # Fallback to access_token if Google did not return a new refresh token (already authorized)
        refresh_token = token_data.get("access_token", "")

    now = datetime.now(timezone.utc)
    current_user.google_refresh_token = encrypt_token(refresh_token)
    current_user.google_classroom_connected_at = now
    current_user.google_classroom_sync_status = "CONNECTED"
    db.commit()
    db.refresh(current_user)

    return ClassroomConsentResponse(
        status="CONNECTED",
        connected_at=now,
        message="Google Classroom successfully connected",
    )
