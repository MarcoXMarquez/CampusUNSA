"""Shared Pydantic v2 schemas for multi-provider LMS courses, assignments, and integrations."""

import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AcademicCourseResponse(BaseModel):
    """Normalized academic course entity across Classroom and Moodle origins."""

    id: uuid.UUID
    classroom_course_id: str
    name: str
    section: Optional[str] = None
    alternate_link: Optional[str] = None
    origin: str = "classroom"
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AcademicAssignmentResponse(BaseModel):
    """Normalized academic coursework assignment entity across LMS origins."""

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


class AcademicSyncResponse(BaseModel):
    """Summary response returned after completing a provider synchronization."""

    status: str
    synced_courses_count: int
    synced_assignments_count: int
    synced_at: Optional[datetime] = None


class IntegrationStatusResponse(BaseModel):
    """Connection and synchronization status for an external academic provider."""

    connected: bool
    connected_at: Optional[datetime] = None
    sync_status: str


class IntegrationConsentResponse(BaseModel):
    """Confirmation payload returned after connecting or subscribing a provider."""

    status: str
    connected_at: Optional[datetime] = None
    message: str
