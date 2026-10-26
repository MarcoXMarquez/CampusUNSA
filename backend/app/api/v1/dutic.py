"""
DUTIC Moodle API endpoints:
- POST /api/v1/dutic/sync: Ingests courses & assignments from Moodle via internal AJAX
- GET /api/v1/dutic/courses: Lists synced Moodle courses for the authenticated student
- GET /api/v1/dutic/assignments: Lists synced Moodle coursework assignments
"""

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
    SyncDuticRequest,
    SyncDuticResponse,
)
from app.services.dutic_sync import DuticSyncService

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
