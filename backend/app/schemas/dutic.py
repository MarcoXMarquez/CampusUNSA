"""Pydantic v2 schemas for UNSA Moodle (DUTIC) synchronization."""

from typing import Optional

from pydantic import BaseModel

from app.schemas.academic import (
    AcademicAssignmentResponse,
    AcademicCourseResponse,
    AcademicSyncResponse,
    IntegrationConsentResponse,
    IntegrationStatusResponse,
)


class SyncDuticRequest(BaseModel):
    """Credentials payload for authenticating with Moodle's internal AJAX endpoint."""

    moodle_session: str
    sesskey: str


class SyncDuticResponse(AcademicSyncResponse):
    """Summary response after completing Moodle DUTIC synchronization."""


class DuticCourseResponse(AcademicCourseResponse):
    """Serialized Moodle course entity."""


class DuticAssignmentResponse(AcademicAssignmentResponse):
    """Serialized Moodle coursework assignment entity."""


class MoodleIcalSubscribeRequest(BaseModel):
    """Payload for subscribing a Moodle iCalendar export URL."""

    calendar_url: str


class MoodleIcalSubscribeResponse(IntegrationConsentResponse):
    """Response after successfully subscribing and encrypting the Moodle calendar URL."""


class MoodleIcalStatusResponse(IntegrationStatusResponse):
    """Status of the student's Moodle iCal calendar subscription."""


class MoodleIcalSyncRequest(BaseModel):
    """Optional payload for triggering immediate sync with an ad-hoc calendar URL."""

    calendar_url: Optional[str] = None
