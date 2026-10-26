"""
Classroom API endpoints:
- POST /api/v1/classroom/sync: Trigger course & assignment synchronization
- GET /api/v1/classroom/courses: List synced courses for the authenticated student
- GET /api/v1/classroom/assignments: List synced coursework for the authenticated student
"""

from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.auth import _resolve_authenticated_user
from app.core.database import get_db
from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User
from app.schemas.classroom import (
    AssignmentResponse,
    CourseResponse,
    SyncClassroomRequest,
    SyncClassroomResponse,
)
from app.services.classroom_sync import ClassroomSyncService

router = APIRouter()


@router.post("/sync", response_model=SyncClassroomResponse)
def sync_classroom(
    payload: SyncClassroomRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> SyncClassroomResponse:
    """
    Synchronizes active courses and coursework from Google Classroom.
    Requires an authenticated student.
    """
    return ClassroomSyncService.sync_student_classroom(
        db=db,
        user=current_user,
        token=payload.refresh_token,
    )


@router.get("/courses", response_model=List[CourseResponse])
def get_student_courses(
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[CourseResponse]:
    """
    Retrieves all synced Google Classroom courses for the authenticated student.
    """
    courses = (
        db.query(ClassroomCourse)
        .filter(ClassroomCourse.user_id == current_user.id)
        .order_by(ClassroomCourse.name.asc())
        .all()
    )
    return courses


@router.get("/assignments", response_model=List[AssignmentResponse])
def get_student_assignments(
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[AssignmentResponse]:
    """
    Retrieves all synced coursework assignments for the authenticated student.
    """
    assignments = (
        db.query(ClassroomAssignment)
        .filter(ClassroomAssignment.user_id == current_user.id)
        .order_by(ClassroomAssignment.due_date.asc().nullslast())
        .all()
    )
    return assignments
