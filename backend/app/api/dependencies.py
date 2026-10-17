"""Reusable authorization dependencies built on persisted user identity."""

from collections.abc import Callable, Sequence

from fastapi import Depends, HTTPException, status

from app.api.v1.auth import _resolve_authenticated_user
from app.core.permissions import ALL_PERMISSIONS, ROLE_PERMISSIONS, Permission
from app.models.user import User


def has_role(
    allowed_roles: Sequence[str], *, permissions: Permission = Permission.NONE
) -> Callable[[User], User]:
    """Require an explicit role and all requested permission bits.

    Role changes take effect immediately: authorization uses the database user,
    never the potentially stale role claim from the signed access token.
    Invalid policies fail during application startup rather than allow access.
    """
    if isinstance(allowed_roles, str):
        raise ValueError("Pass a sequence of role names, not a single string")
    roles = frozenset(allowed_roles)
    if not roles or not roles.issubset(ROLE_PERMISSIONS):
        raise ValueError("At least one known role is required")
    if int(permissions) < 0 or int(permissions) & ~int(ALL_PERMISSIONS):
        raise ValueError("Unknown permission bits are not allowed")

    def authorize(
        current_user: User = Depends(_resolve_authenticated_user),
    ) -> User:
        granted = ROLE_PERMISSIONS.get(current_user.role, Permission.NONE)
        if (
            not current_user.is_active
            or current_user.role not in roles
            or granted & permissions != permissions
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "INSUFFICIENT_PERMISSIONS",
                    "message": "Your account is not authorized to access this resource.",
                },
            )
        return current_user

    return authorize
