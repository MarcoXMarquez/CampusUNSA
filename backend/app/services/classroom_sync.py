"""
Classroom Synchronization Service & API Adapter.
Orchestrates:
- Google Classroom REST API requests (Courses and Coursework)
- Idempotent upsert operations into PostgreSQL
- Error isolation: 401 Unauthorized -> Flag user as NEEDS_REAUTH
- Rate limiting: 429 Too Many Requests -> Controlled HTTPException
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.user import User
from app.schemas.classroom import SyncClassroomResponse


class GoogleClassroomError(Exception):
    """Base exception for Google Classroom API errors."""
    pass


class GoogleClassroomAuthError(GoogleClassroomError):
    """Raised when Google Classroom OAuth token is expired or revoked (HTTP 401)."""
    pass


class GoogleClassroomRateLimitError(GoogleClassroomError):
    """Raised when Google Classroom API quota is exceeded (HTTP 429)."""
    pass


class ClassroomApiClient:
    """
    HTTP client for the Google Classroom REST API v1.
    """
    BASE_URL = "https://classroom.googleapis.com/v1"

    @classmethod
    def fetch_courses(cls, access_token: str) -> List[Dict[str, Any]]:
        """
        Fetches all active courses for the authenticated student.
        """
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(
                    f"{cls.BASE_URL}/courses",
                    headers=headers,
                    params={"courseStates": "ACTIVE"},
                )
                if response.status_code == 401:
                    raise GoogleClassroomAuthError("OAuth token expired or revoked")
                if response.status_code == 429:
                    raise GoogleClassroomRateLimitError("Classroom API rate limit exceeded")
                response.raise_for_status()
                data = response.json()
                return data.get("courses", [])
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                raise GoogleClassroomAuthError("OAuth token expired or revoked") from exc
            if exc.response.status_code == 429:
                raise GoogleClassroomRateLimitError("Classroom API rate limit exceeded") from exc
            raise GoogleClassroomError(f"HTTP error: {exc}") from exc
        except httpx.RequestError as exc:
            raise GoogleClassroomError(f"Network error communicating with Google: {exc}") from exc

    @classmethod
    def fetch_coursework(cls, access_token: str, course_id: str) -> List[Dict[str, Any]]:
        """
        Fetches all published coursework / assignments for a specific course.
        """
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(
                    f"{cls.BASE_URL}/courses/{course_id}/courseWork",
                    headers=headers,
                )
                if response.status_code == 401:
                    raise GoogleClassroomAuthError("OAuth token expired or revoked")
                if response.status_code == 429:
                    raise GoogleClassroomRateLimitError("Classroom API rate limit exceeded")
                response.raise_for_status()
                data = response.json()
                return data.get("courseWork", [])
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                raise GoogleClassroomAuthError("OAuth token expired or revoked") from exc
            if exc.response.status_code == 429:
                raise GoogleClassroomRateLimitError("Classroom API rate limit exceeded") from exc
            raise GoogleClassroomError(f"HTTP error: {exc}") from exc
        except httpx.RequestError as exc:
            raise GoogleClassroomError(f"Network error communicating with Google: {exc}") from exc


class ClassroomSyncService:
    """
    Domain service for synchronizing Google Classroom data into PostgreSQL.
    """

    @staticmethod
    def _parse_due_datetime(
        due_date: Optional[Dict[str, int]],
        due_time: Optional[Dict[str, int]],
    ) -> Optional[datetime]:
        """
        Converts Classroom API dueDate and dueTime maps into a timezone-aware UTC datetime.
        """
        if not due_date:
            return None

        year = due_date.get("year")
        month = due_date.get("month")
        day = due_date.get("day")

        if not (year and month and day):
            return None

        hours = due_time.get("hours", 23) if due_time else 23
        minutes = due_time.get("minutes", 59) if due_time else 59

        return datetime(year, month, day, hours, minutes, tzinfo=timezone.utc)

    @classmethod
    def sync_student_classroom(
        cls,
        db: Session,
        user: User,
        token: Optional[str] = None,
    ) -> SyncClassroomResponse:
        """
        Executes full course and assignment synchronization for a student.
        Persists and updates entities idempotently.
        """
        effective_token = token or "mock_default_token"

        try:
            courses_data = ClassroomApiClient.fetch_courses(effective_token)
        except GoogleClassroomAuthError as exc:
            user.classroom_sync_status = "NEEDS_REAUTH"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "NEEDS_REAUTH",
                    "message": "Google Classroom authorization expired or revoked. Reauthentication required.",
                },
            ) from exc
        except GoogleClassroomRateLimitError as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "Google Classroom API quota exceeded. Please retry in a few minutes.",
                },
            ) from exc

        synced_courses_count = 0
        synced_assignments_count = 0

        for course_item in courses_data:
            course_id_str = str(course_item.get("id"))
            course_name = course_item.get("name", "Untitled Course")
            section = course_item.get("section")
            alternate_link = course_item.get("alternateLink")

            # Upsert course
            course = (
                db.query(ClassroomCourse)
                .filter(
                    ClassroomCourse.user_id == user.id,
                    ClassroomCourse.classroom_course_id == course_id_str,
                )
                .first()
            )
            if not course:
                course = ClassroomCourse(
                    user_id=user.id,
                    classroom_course_id=course_id_str,
                    name=course_name,
                    section=section,
                    alternate_link=alternate_link,
                )
                db.add(course)
                db.flush()
            else:
                course.name = course_name
                course.section = section
                course.alternate_link = alternate_link
                course.updated_at = datetime.now(timezone.utc)

            synced_courses_count += 1

            # Fetch and upsert assignments for this course
            try:
                coursework_data = ClassroomApiClient.fetch_coursework(
                    effective_token,
                    course_id_str,
                )
            except GoogleClassroomAuthError as exc:
                user.classroom_sync_status = "NEEDS_REAUTH"
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        "code": "NEEDS_REAUTH",
                        "message": "Google Classroom authorization expired during coursework sync.",
                    },
                ) from exc
            except GoogleClassroomRateLimitError as exc:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={
                        "code": "RATE_LIMIT_EXCEEDED",
                        "message": "Google Classroom rate limit exceeded during coursework sync.",
                    },
                ) from exc

            for assignment_item in coursework_data:
                item_course_id = assignment_item.get("courseId")
                if item_course_id and str(item_course_id) != course_id_str:
                    continue

                assignment_id_str = str(assignment_item.get("id"))
                title = assignment_item.get("title", "Untitled Assignment")
                description = assignment_item.get("description")
                max_points = assignment_item.get("maxPoints")
                state = assignment_item.get("state", "PUBLISHED")
                assign_link = assignment_item.get("alternateLink")

                due_dt = cls._parse_due_datetime(
                    assignment_item.get("dueDate"),
                    assignment_item.get("dueTime"),
                )

                # Upsert assignment
                assignment = (
                    db.query(ClassroomAssignment)
                    .filter(
                        ClassroomAssignment.user_id == user.id,
                        ClassroomAssignment.classroom_assignment_id == assignment_id_str,
                    )
                    .first()
                )
                if not assignment:
                    assignment = ClassroomAssignment(
                        user_id=user.id,
                        course_id=course.id,
                        classroom_assignment_id=assignment_id_str,
                        title=title,
                        description=description,
                        due_date=due_dt,
                        max_points=max_points,
                        state=state,
                        alternate_link=assign_link,
                        origin="classroom",
                    )
                    db.add(assignment)
                else:
                    assignment.course_id = course.id
                    assignment.title = title
                    assignment.description = description
                    assignment.due_date = due_dt
                    assignment.max_points = max_points
                    assignment.state = state
                    assignment.alternate_link = assign_link
                    assignment.updated_at = datetime.now(timezone.utc)

                synced_assignments_count += 1

        # Mark user synchronization state as successful
        sync_timestamp = datetime.now(timezone.utc)
        user.classroom_sync_status = "SYNCED"
        user.last_classroom_sync_at = sync_timestamp
        db.commit()

        return SyncClassroomResponse(
            status="SYNCED",
            synced_courses_count=synced_courses_count,
            synced_assignments_count=synced_assignments_count,
            synced_at=sync_timestamp,
        )
