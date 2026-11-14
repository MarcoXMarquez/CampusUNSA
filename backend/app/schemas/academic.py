"""Shared Pydantic v2 schemas for multi-provider LMS courses, curriculum catalog, and assignments."""

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

VALID_GROUPS_MSG = "Group code must be a single letter between A and F"


def _normalize_group_letter(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().upper()
    if cleaned == "":
        return None
    if cleaned not in {"A", "B", "C", "D", "E", "F"}:
        raise ValueError(VALID_GROUPS_MSG)
    return cleaned


class ExternalSourceSummaryResponse(BaseModel):
    """External Classroom or DUTIC source attached to an enrolled course."""

    source_id: uuid.UUID
    origin: str
    external_course_id: str
    raw_name: str
    raw_section: Optional[str] = None
    component_type: str = "UNICO"
    alternate_link: Optional[str] = None
    mapping_status: str = "LINKED"


class AcademicCourseResponse(BaseModel):
    """Unified academic course item compatible with existing LMS consumers and HoyView."""

    id: uuid.UUID
    classroom_course_id: str
    name: str
    section: Optional[str] = None
    alternate_link: Optional[str] = None
    origin: str = "classroom"
    course_code: Optional[str] = None
    curriculum_year: Optional[int] = None
    theory_group: Optional[str] = None
    lab_group: Optional[str] = None
    mapping_status: str = "LINKED"
    sources: List[ExternalSourceSummaryResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AcademicAssignmentResponse(BaseModel):
    """Normalized academic coursework assignment entity across LMS origins."""

    id: uuid.UUID
    course_id: uuid.UUID
    source_id: uuid.UUID
    course_code: Optional[str] = None
    enrollment_id: Optional[uuid.UUID] = None
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


class CourseCatalogResponse(BaseModel):
    """Official UNSA curriculum catalog entry (2017 or 2025)."""

    code: str
    curriculum_year: int
    official_name: str
    normalized_name: str
    category: str
    study_year: int
    semester: int
    department: str
    credits: int
    prerequisites: List[str]
    min_credits_required: int
    theory_hours: float
    practice_hours: float
    lab_hours: float

    model_config = ConfigDict(from_attributes=True)


class PendingLinkSourceResponse(BaseModel):
    """External Classroom/DUTIC course awaiting canonical catalog mapping."""

    source_id: uuid.UUID
    term: str
    origin: str
    external_course_id: str
    raw_name: str
    raw_section: Optional[str] = None
    alternate_link: Optional[str] = None
    component_type: str
    detected_group: Optional[str] = None
    task_count: int = 0


class ManualCourseLinkRequest(BaseModel):
    """Payload to manually link a shared external source to an official catalog course."""

    course_code: str
    component_type: Literal["TEORIA", "LABORATORIO", "UNICO"] = "UNICO"
    group_code: Optional[str] = None

    @field_validator("group_code")
    @classmethod
    def validate_group(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_group_letter(value)


class EnrollmentGroupUpdateRequest(BaseModel):
    """Payload to update a student's personal theory and/or lab groups (A-F)."""

    theory_group: Optional[str] = None
    lab_group: Optional[str] = None

    @field_validator("theory_group", "lab_group")
    @classmethod
    def validate_groups(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_group_letter(value)


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
