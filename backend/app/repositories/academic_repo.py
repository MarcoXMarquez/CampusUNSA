"""Unified repository for multi-origin LMS courses and coursework assignments."""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.classroom import ClassroomAssignment, ClassroomCourse


class AcademicSyncRepository:
    """Centralizes idempotent upserts, queries, and batch cleanup for LMS entities."""

    @staticmethod
    def upsert_course(
        db: Session,
        *,
        user_id: UUID,
        course_ref_id: str,
        name: str,
        origin: str,
        section: Optional[str] = None,
        alternate_link: Optional[str] = None,
    ) -> ClassroomCourse:
        """Create or update a student course keyed by (user_id, classroom_course_id)."""
        course = (
            db.query(ClassroomCourse)
            .filter(
                ClassroomCourse.user_id == user_id,
                ClassroomCourse.classroom_course_id == course_ref_id,
            )
            .first()
        )
        if not course:
            course = ClassroomCourse(
                user_id=user_id,
                classroom_course_id=course_ref_id,
                name=name,
                section=section,
                alternate_link=alternate_link,
                origin=origin,
            )
            db.add(course)
            db.flush()
            return course

        course.name = name
        course.origin = origin
        if section is not None:
            course.section = section
        if alternate_link is not None:
            course.alternate_link = alternate_link
        course.updated_at = datetime.now(timezone.utc)
        return course

    @staticmethod
    def upsert_assignment(
        db: Session,
        *,
        user_id: UUID,
        course_id: UUID,
        assignment_ref_id: str,
        title: str,
        origin: str,
        description: Optional[str] = None,
        due_date: Optional[datetime] = None,
        max_points: Optional[float] = None,
        state: str = "PUBLISHED",
        alternate_link: Optional[str] = None,
    ) -> ClassroomAssignment:
        """Create or update a coursework assignment while preserving is_completed."""
        assignment = (
            db.query(ClassroomAssignment)
            .filter(
                ClassroomAssignment.user_id == user_id,
                ClassroomAssignment.classroom_assignment_id == assignment_ref_id,
            )
            .first()
        )
        if not assignment:
            assignment = ClassroomAssignment(
                user_id=user_id,
                course_id=course_id,
                classroom_assignment_id=assignment_ref_id,
                title=title,
                description=description,
                due_date=due_date,
                max_points=max_points,
                state=state,
                alternate_link=alternate_link,
                origin=origin,
            )
            db.add(assignment)
            return assignment

        assignment.course_id = course_id
        assignment.title = title
        if description is not None:
            assignment.description = description
        assignment.due_date = due_date
        if max_points is not None:
            assignment.max_points = max_points
        assignment.state = state
        assignment.alternate_link = alternate_link
        assignment.origin = origin
        assignment.updated_at = datetime.now(timezone.utc)
        return assignment

    @staticmethod
    def list_courses(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> List[ClassroomCourse]:
        """Return courses for a student, optionally filtered by explicit origin."""
        query = db.query(ClassroomCourse).filter(ClassroomCourse.user_id == user_id)
        if origin:
            query = query.filter(ClassroomCourse.origin == origin)
        return query.order_by(ClassroomCourse.name.asc()).all()

    @staticmethod
    def list_assignments(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> List[ClassroomAssignment]:
        """Return assignments for a student, optionally filtered by origin."""
        query = db.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == user_id)
        if origin:
            query = query.filter(ClassroomAssignment.origin == origin)
        return query.order_by(ClassroomAssignment.due_date.asc().nullslast()).all()

    @staticmethod
    def set_assignment_completion(
        db: Session,
        *,
        user_id: UUID,
        assignment_id: UUID,
        is_completed: bool,
    ) -> Optional[ClassroomAssignment]:
        """Persist completion state for an assignment owned by the caller."""
        assignment = (
            db.query(ClassroomAssignment)
            .filter(
                ClassroomAssignment.id == assignment_id,
                ClassroomAssignment.user_id == user_id,
            )
            .first()
        )
        if assignment is None:
            return None
        assignment.is_completed = is_completed
        db.commit()
        db.refresh(assignment)
        return assignment

    @staticmethod
    def clear_assignments(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> int:
        """Delete assignments for a student in a single batch SQL DELETE."""
        query = db.query(ClassroomAssignment).filter(ClassroomAssignment.user_id == user_id)
        if origin:
            query = query.filter(ClassroomAssignment.origin == origin)
        count = query.delete(synchronize_session=False)
        db.commit()
        return count

    @staticmethod
    def clear_courses(
        db: Session,
        user_id: UUID,
        *,
        origin: Optional[str] = None,
    ) -> int:
        """Batch delete courses and dependent assignments in two SQL statements (no N+1)."""
        course_query = db.query(ClassroomCourse.id).filter(ClassroomCourse.user_id == user_id)
        if origin:
            course_query = course_query.filter(ClassroomCourse.origin == origin)
        course_ids = [row[0] for row in course_query.all()]
        if not course_ids:
            return 0

        db.query(ClassroomAssignment).filter(
            ClassroomAssignment.course_id.in_(course_ids)
        ).delete(synchronize_session=False)
        deleted_count = (
            db.query(ClassroomCourse)
            .filter(ClassroomCourse.id.in_(course_ids))
            .delete(synchronize_session=False)
        )
        db.commit()
        return deleted_count
