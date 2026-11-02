"""
DUTIC Moodle API endpoints:
- POST /api/v1/dutic/sync: Ingests courses & assignments from Moodle via internal AJAX
- GET /api/v1/dutic/courses: Lists synced Moodle courses for the authenticated student
- GET /api/v1/dutic/assignments: Lists synced Moodle coursework assignments
"""

from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.auth import _resolve_authenticated_user
from app.core.database import get_db
from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User
from app.schemas.dutic import (
    DuticAssignmentResponse,
    DuticCourseResponse,
    MoodleIcalStatusResponse,
    MoodleIcalSubscribeRequest,
    MoodleIcalSubscribeResponse,
    MoodleIcalSyncRequest,
    SyncDuticRequest,
    SyncDuticResponse,
)
from app.services.dutic_ical import DuticIcalService
from app.services.dutic_sync import DuticSyncService
from app.services.token_encryption import encrypt_token

router = APIRouter()


@router.post("/sync", response_model=SyncDuticResponse)
def sync_dutic(
    payload: SyncDuticRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> SyncDuticResponse:
    """
    Synchronizes active courses and coursework from UNSA DUTIC Moodle.
    Requires Bearer authentication and valid MoodleSession cookies.
    """
    return DuticSyncService.sync_student_dutic(
        db=db,
        user=current_user,
        moodle_session=payload.moodle_session,
        sesskey=payload.sesskey,
    )


@router.get("/courses", response_model=List[DuticCourseResponse])
def get_dutic_courses(
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[DuticCourseResponse]:
    """
    Retrieves all synced Moodle courses for the authenticated student.
    """
    courses = (
        db.query(ClassroomCourse)
        .filter(
            ClassroomCourse.user_id == current_user.id,
            ClassroomCourse.classroom_course_id.startswith("moodle-"),
        )
        .order_by(ClassroomCourse.name.asc())
        .all()
    )
    return courses


@router.get("/assignments", response_model=List[DuticAssignmentResponse])
def get_dutic_assignments(
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[DuticAssignmentResponse]:
    """
    Retrieves all synced Moodle coursework assignments for the authenticated student.
    """
    assignments = (
        db.query(ClassroomAssignment)
        .filter(
            ClassroomAssignment.user_id == current_user.id,
            ClassroomAssignment.origin == "moodle",
        )
        .order_by(ClassroomAssignment.due_date.asc().nullslast())
        .all()
    )
    return assignments


@router.get("/ical/status", response_model=MoodleIcalStatusResponse)
def get_moodle_ical_status(
    current_user: User = Depends(_resolve_authenticated_user),
) -> MoodleIcalStatusResponse:
    """
    Retrieves the status of the student's Moodle iCal calendar subscription.
    """
    is_connected = bool(current_user.moodle_calendar_url)
    return MoodleIcalStatusResponse(
        connected=is_connected,
        connected_at=current_user.moodle_calendar_connected_at,
        sync_status=current_user.moodle_calendar_sync_status,
    )


@router.post("/ical/subscribe", response_model=MoodleIcalSubscribeResponse)
def subscribe_moodle_ical(
    payload: MoodleIcalSubscribeRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> MoodleIcalSubscribeResponse:
    """
    Validates, encrypts, and persists the student's Moodle iCalendar export URL.
    """
    DuticIcalService.validate_calendar_url(payload.calendar_url)
    now = datetime.now(timezone.utc)
    current_user.moodle_calendar_url = encrypt_token(payload.calendar_url.strip())
    current_user.moodle_calendar_connected_at = now
    current_user.moodle_calendar_sync_status = "CONNECTED"
    db.commit()
    db.refresh(current_user)

    return MoodleIcalSubscribeResponse(
        status="CONNECTED",
        connected_at=now,
        message="Moodle iCalendar feed successfully subscribed",
    )


@router.post("/ical/sync", response_model=SyncDuticResponse)
def sync_moodle_ical(
    payload: MoodleIcalSyncRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> SyncDuticResponse:
    """
    Synchronizes assignments from the student's subscribed Moodle iCal feed into PostgreSQL.
    """
    return DuticIcalService.sync_student_moodle_ical(
        db=db,
        user=current_user,
        calendar_url=payload.calendar_url,
    )
