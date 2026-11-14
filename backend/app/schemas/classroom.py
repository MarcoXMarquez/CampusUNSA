"""Pydantic v2 schemas for Google Classroom synchronization, courses, and coursework."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.academic import (
    AcademicAssignmentResponse,
    AcademicCourseResponse,
    AcademicSyncResponse,
    IntegrationConsentResponse,
    IntegrationStatusResponse,
)


class SyncClassroomRequest(BaseModel):
    """Payload for triggering manual or automated Google Classroom synchronization."""

    refresh_token: Optional[str] = None


class SyncClassroomResponse(AcademicSyncResponse):
    """Summary response after completing Classroom synchronization."""


class CourseResponse(AcademicCourseResponse):
    """Serialized course entity."""


class AssignmentResponse(AcademicAssignmentResponse):
    """Serialized coursework assignment entity."""


class AssignmentCompletionRequest(BaseModel):
    """Set a student's local completion flag without changing LMS publication state."""

    model_config = ConfigDict(extra="forbid")
    is_completed: bool = Field(strict=True)


class ClassroomConsentRequest(BaseModel):
    """Payload containing Google OAuth authorization code from client consent popup."""

    code: str
    redirect_uri: Optional[str] = "postmessage"


class ClassroomConsentResponse(IntegrationConsentResponse):
    """Response returned after successful authorization code exchange and token persistence."""


class ClassroomStatusResponse(IntegrationStatusResponse):
    """Status of the student's Google Classroom integration linkage."""
