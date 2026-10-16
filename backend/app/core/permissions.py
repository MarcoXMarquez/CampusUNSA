"""Explicit, deny-by-default role permissions for institutional accounts."""

from collections.abc import Mapping
from enum import IntFlag
from types import MappingProxyType


class Permission(IntFlag):
    NONE = 0
    READ_ALL_TICKETS = 1


ROLE_PERMISSIONS: Mapping[str, Permission] = MappingProxyType(
    {
        "student": Permission.NONE,
        "secretary": Permission.READ_ALL_TICKETS,
        "admin": Permission.READ_ALL_TICKETS,
    }
)

ALL_PERMISSIONS = Permission.READ_ALL_TICKETS
