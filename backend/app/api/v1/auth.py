from datetime import datetime, timezone
import logging
from typing import Any, Dict, Optional
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import _resolve_authenticated_user, get_current_user  # noqa: F401
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.security import (
    create_access_token,
    hash_password,
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
from app.schemas.otp import (
    OtpChannel,
    OtpGenerateRequest,
    OtpGenerateResponse,
    OtpStatusResponse,
    OtpUnlinkResponse,
    OtpVerifyRequest,
    OtpVerifyResponse,
)
from app.services.classroom.classroom_sync import ClassroomSyncService, GoogleClassroomError
from app.services.classroom.google_oauth import GoogleOAuthService
from app.services.messaging.otp_service import InvalidOtpError, OTPService, OtpError
from app.core.token_encryption import encrypt_token

logger = logging.getLogger(__name__)
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

    initial_token = token_data.get("access_token") or refresh_token
    if initial_token:
        db.flush()
        try:
            ClassroomSyncService.sync_student_classroom(
                db=db,
                user=current_user,
                token=initial_token,
            )
        except GoogleClassroomError as exc:
            db.commit()
            logger.warning(
                "Initial Classroom sync deferred after OAuth callback for user %s: %s",
                current_user.id,
                exc,
            )
    else:
        db.commit()

    return ClassroomConsentResponse(
        status="CONNECTED",
        connected_at=now,
        message="Google Classroom successfully connected",
    )


@router.post("/otp/generate", response_model=OtpGenerateResponse)
def generate_messaging_otp(
    payload: OtpGenerateRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    redis_client: Any = Depends(get_redis),
) -> OtpGenerateResponse:
    """Generates a 6-digit single-use OTP with strict 300-second Redis TTL."""
    try:
        otp_code, expires_in_seconds, expires_at, deep_link_url = OTPService.generate_otp(
            redis_client=redis_client,
            user=current_user,
            channel=payload.channel,
        )
    except OtpError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    return OtpGenerateResponse(
        channel=payload.channel,
        otp_code=otp_code,
        expires_in_seconds=expires_in_seconds,
        expires_at=expires_at,
        deep_link_url=deep_link_url,
    )


@router.post("/otp/verify", response_model=OtpVerifyResponse)
def verify_messaging_otp(
    payload: OtpVerifyRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
    redis_client: Any = Depends(get_redis),
) -> OtpVerifyResponse:
    """Verifies a 6-digit OTP against Redis and binds WhatsApp or Telegram to the user."""
    try:
        _, normalized_identifier, welcome_message = OTPService.verify_and_bind(
            db=db,
            redis_client=redis_client,
            channel=payload.channel,
            identifier=payload.identifier,
            submitted_code=payload.code,
            user=current_user,
        )
    except InvalidOtpError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "code": exc.code,
                "message": exc.message,
                "attempts_remaining": exc.attempts_remaining,
            },
        ) from exc
    except OtpError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc

    return OtpVerifyResponse(
        channel=payload.channel,
        identifier=normalized_identifier,
        linked=True,
        message=welcome_message,
    )


@router.get("/otp/status", response_model=OtpStatusResponse)
def get_messaging_otp_status(
    current_user: User = Depends(_resolve_authenticated_user),
    redis_client: Any = Depends(get_redis),
) -> OtpStatusResponse:
    """Returns WhatsApp and Telegram linkage status plus active OTP countdowns."""
    return OtpStatusResponse(**OTPService.get_status(redis_client=redis_client, user=current_user))


@router.delete("/otp/link/{channel}", response_model=OtpUnlinkResponse)
def unlink_messaging_channel(
    channel: OtpChannel,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
    redis_client: Any = Depends(get_redis),
) -> OtpUnlinkResponse:
    """Removes the bound WhatsApp phone number or Telegram chat ID from the user account."""
    OTPService.unlink_channel(
        db=db,
        redis_client=redis_client,
        user=current_user,
        channel=channel,
    )
    return OtpUnlinkResponse(
        channel=channel,
        linked=False,
        message=f"{channel.capitalize()} unlinked successfully.",
    )
