---
name: security-auditor-unsa
description: Institutional security and authentication auditor for CampusUNSA. Enforces strict @unsa.edu.pe email domain restrictions, Google OAuth verification, JWT session token management, and Redis OTP security.
---

# Institutional Security & Authentication Standard — CampusUNSA

## 1. Overview and Mission

The `security-auditor-unsa` skill enforces institutional security policies, access controls, and token lifecycles across the entire CampusUNSA platform.

## 2. Inviolable Security Policies

1. **Strict Institutional Domain Restriction:**
   - Only Google OAuth accounts ending in `@unsa.edu.pe` are permitted.
   - Any login attempt from public domains (e.g. `@gmail.com`, `@yahoo.com`) or unauthorized domains must be rejected immediately with `HTTP 403 Forbidden` and error code `DOMAIN_NOT_ALLOWED`.
2. **WhatsApp Pairing Code TTL:**
   - OTP pairing codes stored in Redis for WhatsApp binding must expire after exactly 300 seconds (5 minutes).
3. **Cryptographic Signing:**
   - All session tokens must be signed with `HS256` using `settings.SECRET_KEY`.
   - Expiration time must be enforced on all JWT claims.
4. **Zero Emojis:**
   - Security error payloads and log strings must never contain emojis.
5. **Technical English:**
   - All error codes (`DOMAIN_NOT_ALLOWED`, `INVALID_CREDENTIALS`, `USER_NOT_FOUND`) and error messages must be in English.

## 3. Institutional Email Validation Pattern

```python
from fastapi import HTTPException, status
from app.core.config import settings

def validate_institutional_email(email: str) -> None:
    """
    Validates that an email strictly belongs to the unsa.edu.pe institutional domain.
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
```

## 4. Protected Route Dependency Pattern

To protect an endpoint requiring user authentication:

```python
from fastapi import APIRouter, Depends
from app.api.v1.auth import _resolve_authenticated_user
from app.models.user import User
from app.schemas.auth import UserResponse

router = APIRouter()

@router.get("/protected-endpoint", response_model=UserResponse)
def protected_handler(
    current_user: User = Depends(_resolve_authenticated_user),
) -> UserResponse:
    return UserResponse.model_validate(current_user)
```

## 5. Security Audit Checklist

When reviewing any authentication or sensitive endpoint:
* [ ] Is external domain validation checked BEFORE user provisioning?
* [ ] Does invalid Google token return HTTP 401 with code `INVALID_CREDENTIALS`?
* [ ] Does unauthorized domain return HTTP 403 with code `DOMAIN_NOT_ALLOWED`?
* [ ] Is password/secret data excluded from all Pydantic response schemas?
* [ ] Are database sessions closed cleanly via dependency injection?
* [ ] Are Redis keys assigned appropriate TTLs (e.g. 300s for OTP)?
