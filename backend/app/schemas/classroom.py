"""
Pydantic v2 schemas for Google Classroom synchronization, courses, and coursework assignments.
"""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SyncClassroomRequest(BaseModel):
    """
    Payload for triggering manual or automated Google Classroom synchronization.
    """
    refresh_token: Optional[str] = None


class SyncClassroomResponse(BaseModel):
    """
    Summary response after completing Classroom synchronization.
    """
    status: str
    synced_courses_count: int
    synced_assignments_count: int
    synced_at: Optional[datetime] = None


class CourseResponse(BaseModel):
    """
    Serialized course entity.
    """
    id: uuid.UUID
    classroom_course_id: str
    name: str
    section: Optional[str] = None
    alternate_link: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssignmentResponse(BaseModel):
    """
    Serialized coursework assignment entity.
    """
    id: uuid.UUID
    course_id: uuid.UUID
    classroom_assignment_id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_points: Optional[float] = None
    state: str
    is_completed: bool = False
    alternate_link: Optional[str] = None
    origin: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AssignmentCompletionRequest(BaseModel):
    """Set a student's local completion flag without changing LMS publication state."""

    model_config = ConfigDict(extra="forbid")
    is_completed: bool = Field(strict=True)


class ClassroomConsentRequest(BaseModel):
    """
    Payload containing Google OAuth authorization code from client consent popup.
    """
    code: str
    redirect_uri: Optional[str] = "postmessage"


class ClassroomConsentResponse(BaseModel):
    """
    Response returned after successful authorization code exchange and token persistence.
    """
    status: str
    connected_at: Optional[datetime] = None
    message: str


class ClassroomStatusResponse(BaseModel):
    """
    Status of the student's Google Classroom integration linkage.
    """
    connected: bool
    connected_at: Optional[datetime] = None
    sync_status: str
