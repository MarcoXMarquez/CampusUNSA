"""
Google OAuth 2.0 Client Service.
Handles:
- Exchanging authorization codes for access and refresh tokens
- Refreshing expired access tokens using long-lived refresh tokens
- Graceful error isolation for expired or revoked credentials
"""

from typing import Any, Dict, Optional
import httpx

from app.core.config import settings
from app.services.classroom_sync import GoogleClassroomAuthError, GoogleClassroomError


class GoogleOAuthService:
    """Service client for interacting with Google OAuth 2.0 token endpoints."""

    TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

    @classmethod
    def exchange_code_for_tokens(
        cls,
        code: str,
        redirect_uri: Optional[str] = "postmessage",
    ) -> Dict[str, Any]:
        """
        Exchanges a single-use authorization code for Google access and refresh tokens.
        """
        if not code:
            raise ValueError("Authorization code is required")

        data = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri or "postmessage",
            "grant_type": "authorization_code",
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(cls.TOKEN_ENDPOINT, data=data)
                if response.status_code != 200:
                    error_detail = response.text
                    try:
                        err_json = response.json()
                        error_detail = err_json.get("error_description", err_json.get("error", error_detail))
                    except Exception:
                        pass
                    raise ValueError(f"Google token exchange failed: {error_detail}")
                return response.json()
        except httpx.RequestError as exc:
            raise GoogleClassroomError(f"Network error communicating with Google OAuth: {exc}") from exc

    @classmethod
    def refresh_access_token(cls, refresh_token: str) -> str:
        """
        Refreshes an expired Google access token using a stored refresh token.
        Raises GoogleClassroomAuthError if the token is revoked or expired.
        """
        if not refresh_token:
            raise GoogleClassroomAuthError("No refresh token provided")

        data = {
            "refresh_token": refresh_token,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.post(cls.TOKEN_ENDPOINT, data=data)
                if response.status_code in (400, 401):
                    raise GoogleClassroomAuthError("Google refresh token expired or revoked")
                response.raise_for_status()
                token_data = response.json()
                access_token = token_data.get("access_token")
                if not access_token:
                    raise GoogleClassroomAuthError("No access token returned in Google response")
                return access_token
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (400, 401):
                raise GoogleClassroomAuthError("Google refresh token expired or revoked") from exc
            raise GoogleClassroomError(f"Google OAuth refresh HTTP error: {exc}") from exc
        except httpx.RequestError as exc:
            raise GoogleClassroomError(f"Network error refreshing Google access token: {exc}") from exc
