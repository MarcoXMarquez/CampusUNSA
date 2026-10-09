from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    create_access_token,
    get_current_user_from_db,
    oauth2_scheme,
    validate_institutional_email,
    verify_google_id_token,
)
from app.models.user import User, UserProfile
from app.schemas.auth import GoogleAuthRequest, TokenResponse, UserResponse

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
        user = User(
            email=email,
            role="student",
            is_active=True,
        )
        db.add(user)
        db.flush()

        full_name = google_payload.get("name") or email.split("@")[0]
        profile = UserProfile(
            user_id=user.id,
            full_name=full_name,
            avatar_url=google_payload.get("picture"),
        )
        db.add(profile)
        db.commit()
        db.refresh(user)

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


@router.get("/me", response_model=UserResponse)
def get_my_profile(
    current_user: User = Depends(_resolve_authenticated_user),
) -> UserResponse:
    """
    Returns the profile and authentication claims of the currently logged-in user.
    """
    return UserResponse.model_validate(current_user)
