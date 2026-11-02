"""
Pydantic v2 schemas for UNSA Moodle (DUTIC) synchronization.
"""

import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class SyncDuticRequest(BaseModel):
    """
    Credentials payload for authenticating with Moodle's internal AJAX endpoint.
    """
    moodle_session: str
    sesskey: str


class SyncDuticResponse(BaseModel):
    """
    Summary response after completing Moodle DUTIC synchronization.
    """
    status: str
    synced_courses_count: int
    synced_assignments_count: int
    synced_at: Optional[datetime] = None


class DuticCourseResponse(BaseModel):
    """
    Serialized Moodle course entity.
    """
    id: uuid.UUID
    classroom_course_id: str
    name: str
    section: Optional[str] = None
    alternate_link: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DuticAssignmentResponse(BaseModel):
    """
    Serialized Moodle coursework assignment entity.
    """
    id: uuid.UUID
    course_id: uuid.UUID
    classroom_assignment_id: str
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    max_points: Optional[float] = None
    state: str
    alternate_link: Optional[str] = None
    origin: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MoodleIcalSubscribeRequest(BaseModel):
    """
    Payload for subscribing a Moodle iCalendar export URL.
    """
    calendar_url: str


class MoodleIcalSubscribeResponse(BaseModel):
    """
    Response after successfully subscribing and encrypting the Moodle calendar URL.
    """
    status: str
    connected_at: Optional[datetime] = None
    message: str


class MoodleIcalStatusResponse(BaseModel):
    """
    Status of the student's Moodle iCal calendar subscription.
    """
    connected: bool
    connected_at: Optional[datetime] = None
    sync_status: str


class MoodleIcalSyncRequest(BaseModel):
    """
    Optional payload for triggering immediate sync with an ad-hoc calendar URL.
    """
    calendar_url: Optional[str] = None
