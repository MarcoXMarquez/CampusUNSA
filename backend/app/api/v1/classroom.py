"""
Classroom API endpoints:
- POST /api/v1/classroom/sync: Trigger course & assignment synchronization
- GET /api/v1/classroom/courses: List synced courses for the authenticated student
- GET /api/v1/classroom/assignments: List synced coursework for the authenticated student
"""

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.auth import _resolve_authenticated_user
from app.core.database import get_db
from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User
from app.schemas.classroom import (
    AssignmentCompletionRequest,
    AssignmentResponse,
    CourseResponse,
    SyncClassroomRequest,
    SyncClassroomResponse,
)
from app.services.classroom_sync import ClassroomSyncService

router = APIRouter()


@router.patch("/assignments/{assignment_id}/completion", response_model=AssignmentResponse)
def set_assignment_completion(
    assignment_id: UUID,
    payload: AssignmentCompletionRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> AssignmentResponse:
    """Persist an idempotent completion change for an assignment owned by the caller."""
    assignment = (
        db.query(ClassroomAssignment)
        .filter(
            ClassroomAssignment.id == assignment_id,
            ClassroomAssignment.user_id == current_user.id,
        )
        .first()
    )
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ASSIGNMENT_NOT_FOUND", "message": "Assignment not found."},
        )
    assignment.is_completed = payload.is_completed
    db.commit()
    db.refresh(assignment)
    return AssignmentResponse.model_validate(assignment)


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


@router.delete("/assignments")
def clear_student_assignments(
    origin: Optional[str] = None,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Clears academic assignments for the authenticated student.
    Can filter by origin ('moodle', 'classroom') or clear all if unspecified.
    """
    query = db.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == current_user.id)
    if origin:
        query = query.filter(ClassroomAssignment.origin == origin)
    count = query.delete(synchronize_session=False)
    db.commit()
    return {
        "deleted_count": count,
        "origin": origin or "all",
        "message": "Assignments cleared successfully",
    }


@router.delete("/courses")
def clear_student_courses(
    origin: Optional[str] = None,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Clears academic courses for the authenticated student.
    Can filter by origin ('moodle', 'classroom') or clear all if unspecified.
    Cascades deletion to associated assignments.
    """
    query = db.query(ClassroomCourse).filter(ClassroomCourse.user_id == current_user.id)
    if origin == "moodle":
        query = query.filter(ClassroomCourse.classroom_course_id.like("moodle-%"))
    elif origin == "classroom":
        query = query.filter(~ClassroomCourse.classroom_course_id.like("moodle-%"))

    courses = query.all()
    count = len(courses)
    for course in courses:
        db.delete(course)
    db.commit()
    return {
        "deleted_count": count,
        "origin": origin or "all",
        "message": "Courses cleared successfully",
    }
