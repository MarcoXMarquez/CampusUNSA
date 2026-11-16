"""
Unified curriculum, course enrollment, manual linking, and assignment endpoints:
- GET /api/v1/courses/catalog: Browse official 2017 & 2025 UNSA Systems Engineering courses
- GET /api/v1/courses/enrolled: List student's deduplicated enrollments (plus pending sources by default)
- GET /api/v1/courses/pending-links: List unmapped LMS sources awaiting course confirmation
- POST /api/v1/courses/sources/{source_id}/link: Manually link a shared source to an official course
- PATCH /api/v1/courses/enrolled/{course_code}/groups: Update student's theory/lab groups (A-F)
- GET /api/v1/courses/assignments: List normalized coursework assignments across all providers
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import _resolve_authenticated_user
from app.core.database import get_db
from app.models.user import User
from app.repositories.academic_repo import AcademicSyncRepository
from app.schemas.academic import (
    AcademicAssignmentResponse,
    AcademicCourseResponse,
    CourseCatalogResponse,
    CourseScheduleBlockResponse,
    CourseScheduleUpdateRequest,
    CreateManualAssignmentRequest,
    EnrollmentGroupUpdateRequest,
    ExternalSourceSummaryResponse,
    ManualCourseLinkRequest,
    NextClassResponse,
    PendingLinkSourceResponse,
    WeeklyScheduleResponse,
)
from app.services.academic.curriculum_resolver import DEFAULT_TERM
from app.services.academic.schedule_calculator import ScheduleCalculator

router = APIRouter()


@router.get("/catalog", response_model=List[CourseCatalogResponse])
def get_curriculum_catalog(
    curriculum_year: Optional[int] = Query(default=None),
    study_year: Optional[int] = Query(default=None),
    semester: Optional[int] = Query(default=None),
    q: Optional[str] = Query(default=None),
    _current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[CourseCatalogResponse]:
    """List official UNSA curriculum courses filtered by year, study year, semester, or search query."""
    return AcademicSyncRepository.list_catalog_responses(
        db,
        curriculum_year=curriculum_year,
        study_year=study_year,
        semester=semester,
        q=q,
    )


@router.get("/enrolled", response_model=List[AcademicCourseResponse])
def get_enrolled_courses(
    include_pending: bool = Query(default=True),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[AcademicCourseResponse]:
    """Retrieve deduplicated academic courses for the authenticated student."""
    return AcademicSyncRepository.list_courses(
        db,
        current_user.id,
        include_pending=include_pending,
    )


@router.get("/pending-links", response_model=List[PendingLinkSourceResponse])
def get_pending_course_links(
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[PendingLinkSourceResponse]:
    """Retrieve unmapped Classroom/DUTIC external sources for the authenticated student."""
    return AcademicSyncRepository.list_pending_links(db, current_user.id)


@router.post("/sources/{source_id}/link", response_model=ExternalSourceSummaryResponse)
def link_external_course_source(
    source_id: UUID,
    payload: ManualCourseLinkRequest,
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> ExternalSourceSummaryResponse:
    """Link a shared external LMS source to an official curriculum code."""
    try:
        source = AcademicSyncRepository.link_external_source(
            db,
            user=current_user,
            source_id=source_id,
            course_code=payload.course_code,
            component_type=payload.component_type,
            group_code=payload.group_code,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "SOURCE_NOT_FOUND", "message": str(exc)},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_COURSE_CODE", "message": str(exc)},
        ) from exc

    return AcademicSyncRepository.source_to_summary(source)


@router.patch("/enrolled/{course_code}/groups", response_model=AcademicCourseResponse)
def update_enrolled_course_groups(
    course_code: str,
    payload: EnrollmentGroupUpdateRequest,
    term: str = Query(default=DEFAULT_TERM),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> AcademicCourseResponse:
    """Update the caller's personal theory and/or laboratory group (A-F)."""
    updated_course = AcademicSyncRepository.update_enrollment_groups_response(
        db,
        user_id=current_user.id,
        course_code=course_code,
        theory_group=payload.theory_group,
        lab_group=payload.lab_group,
        fields_to_update=set(payload.model_fields_set),
        term=term,
    )
    if updated_course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ENROLLMENT_NOT_FOUND",
                "message": f"Student is not enrolled in course {course_code} for term {term}.",
            },
        )
    return updated_course


@router.get("/enrolled/{course_code}/schedule", response_model=List[CourseScheduleBlockResponse])
def get_enrolled_course_schedule(
    course_code: str,
    theory_group: Optional[str] = Query(default=None, pattern=r"^[A-Fa-f]$"),
    lab_group: Optional[str] = Query(default=None, pattern=r"^[A-Fa-f]$"),
    term: str = Query(default=DEFAULT_TERM),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[CourseScheduleBlockResponse]:
    """Retrieve shared weekly schedule blocks for a course filtered by theory and lab groups."""
    return AcademicSyncRepository.list_course_schedule_blocks(
        db,
        course_code=course_code,
        user_id=current_user.id,
        theory_group=theory_group,
        lab_group=lab_group,
        term=term,
    )


@router.put("/enrolled/{course_code}/schedule", response_model=AcademicCourseResponse)
def update_enrolled_course_schedule(
    course_code: str,
    payload: CourseScheduleUpdateRequest,
    term: str = Query(default=DEFAULT_TERM),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> AcademicCourseResponse:
    """Update caller groups (A-F) and shared weekly schedule blocks for an enrolled course."""
    updated_course = AcademicSyncRepository.upsert_course_schedule(
        db,
        user_id=current_user.id,
        course_code=course_code,
        payload=payload,
        term=term,
    )
    if updated_course is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ENROLLMENT_NOT_FOUND",
                "message": f"Student is not enrolled in course {course_code} for term {term}.",
            },
        )
    return updated_course


@router.get("/schedule/next-class", response_model=NextClassResponse)
def get_next_class_countdown(
    at: Optional[datetime] = Query(default=None),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> NextClassResponse:
    """Compute the student's active or next class countdown in America/Lima."""
    courses = AcademicSyncRepository.list_courses(
        db,
        current_user.id,
        include_pending=False,
    )
    return ScheduleCalculator.compute_next_class(courses, now=at)


@router.get("/schedule/weekly", response_model=WeeklyScheduleResponse)
def get_weekly_schedule_matrix(
    at: Optional[datetime] = Query(default=None),
    term: str = Query(default=DEFAULT_TERM),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> WeeklyScheduleResponse:
    """Retrieve the student's dynamic Mon-Sun weekly class schedule and countdown."""
    courses = AcademicSyncRepository.list_courses(
        db,
        current_user.id,
        include_pending=False,
    )
    return ScheduleCalculator.build_weekly_schedule(courses, now=at, term=term)


@router.get("/assignments", response_model=List[AcademicAssignmentResponse])
def get_unified_assignments(
    origin: Optional[str] = Query(default=None),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> List[AcademicAssignmentResponse]:
    """Retrieve normalized coursework assignments across Classroom and DUTIC."""
    assignments = AcademicSyncRepository.list_assignments(
        db,
        current_user.id,
        origin=origin,
    )
    return [AcademicAssignmentResponse.model_validate(item) for item in assignments]


@router.post(
    "/assignments",
    response_model=AcademicAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_manual_assignment(
    payload: CreateManualAssignmentRequest,
    term: str = Query(default=DEFAULT_TERM),
    current_user: User = Depends(_resolve_authenticated_user),
    db: Session = Depends(get_db),
) -> AcademicAssignmentResponse:
    """Create a manual task optionally tied to one of the student's enrolled courses."""
    try:
        assignment = AcademicSyncRepository.create_manual_assignment(
            db,
            user_id=current_user.id,
            title=payload.title,
            course_code=payload.course_code,
            component_type=payload.component_type,
            due_date=payload.due_date,
            priority=payload.priority,
            notes=payload.notes,
            term=term,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ENROLLMENT_NOT_FOUND", "message": str(exc)},
        ) from exc
    return AcademicAssignmentResponse.model_validate(assignment)
