import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict


class GoogleAuthRequest(BaseModel):
    """
    Payload sent from client containing the Google OAuth ID token.
    """
    token: str


class EmailLoginRequest(BaseModel):
    """
    Payload sent from client for institutional email and password sign-in or sign-up.
    """
    email: str
    password: str
    full_name: Optional[str] = None


class UserResponse(BaseModel):
    """
    Standard serialized representation of an authenticated User.
    """
    id: Optional[uuid.UUID] = None
    email: str
    role: str
    full_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    """
    Authentication response with signed JWT and user identity.
    """
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
