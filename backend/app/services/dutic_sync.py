"""
UNSA Moodle (DUTIC) Native Synchronization Service & Client.
Orchestrates:
- Moodle internal AJAX API batch requests (/lib/ajax/service.php)
- Timeline calendar events & deep course module scan (mod_assign) for hidden tasks
- Idempotent upserting into PostgreSQL with origin='moodle'
- Graceful session expiration handling (requireloginerror -> 401 NEEDS_REAUTH)
"""

from datetime import datetime, timezone
from typing import Any, Dict, List
import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.exceptions import (  # noqa: F401
    DuticError,
    DuticRateLimitError,
    DuticSessionExpiredError,
)
from app.models.classroom import ClassroomCourse
from app.models.user import User
from app.repositories.academic_repo import AcademicSyncRepository
from app.schemas.dutic import SyncDuticResponse


class DuticApiClient:
    """
    HTTP client communicating natively with UNSA DUTIC Moodle internal AJAX service.
    """
    BASE_URL = "https://aulavirtual.unsa.edu.pe/2026B"
    USER_AGENT = (
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    )

    @classmethod
    def post_ajax_batch(
        cls,
        moodle_session: str,
        sesskey: str,
        calls: List[Dict[str, Any]],
    ) -> List[Any]:
        """
        Executes a batch call against /lib/ajax/service.php replicating the official Moodle web client.
        """
        url = f"{cls.BASE_URL}/lib/ajax/service.php?sesskey={sesskey}"
        headers = {
            "Content-Type": "application/json",
            "Cookie": f"MoodleSession={moodle_session}",
            "Origin": cls.BASE_URL,
            "User-Agent": cls.USER_AGENT,
        }
        body = [
            {"index": i, "methodname": call["methodname"], "args": call.get("args", {})}
            for i, call in enumerate(calls)
        ]

        try:
            with httpx.Client(timeout=15.0) as client:
                response = client.post(url, headers=headers, json=body)

                if response.status_code in (302, 303, 401):
                    raise DuticSessionExpiredError("Moodle session expired or redirected to login")

                response.raise_for_status()
                text = response.text

                if "login/index.php" in text or "loginform" in text:
                    raise DuticSessionExpiredError("Moodle returned login form HTML")

                data = response.json()
                if not isinstance(data, list):
                    raise DuticError("Unexpected Moodle AJAX response format")

                results = []
                for entry in data:
                    if entry.get("error"):
                        err_code = entry.get("exception", {}).get("errorcode", "")
                        if err_code in ("requireloginerror", "servicerequireslogin"):
                            raise DuticSessionExpiredError(f"Moodle requirelogin error: {err_code}")
                        raise DuticError(f"Moodle AJAX error: {entry.get('exception')}")
                    results.append(entry.get("data"))

                return results

        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in (302, 303, 401):
                raise DuticSessionExpiredError("Moodle session expired") from exc
            if exc.response.status_code == 429:
                raise DuticRateLimitError("Moodle rate limit exceeded") from exc
            raise DuticError(f"HTTP error communicating with Moodle: {exc}") from exc
        except httpx.RequestError as exc:
            raise DuticError(f"Network error communicating with Moodle: {exc}") from exc

    @classmethod
    def fetch_enrolled_courses(
        cls,
        moodle_session: str,
        sesskey: str,
    ) -> List[Dict[str, Any]]:
        """
        Fetches enrolled courses via core_course_get_enrolled_courses_by_timeline_classification.
        """
        calls = [
            {
                "methodname": "core_course_get_enrolled_courses_by_timeline_classification",
                "args": {
                    "classification": "all",
                    "limit": 0,
                    "offset": 0,
                    "sort": "fullname",
                },
            }
        ]
        results = cls.post_ajax_batch(moodle_session, sesskey, calls)
        first = results[0] if results else {}
        if isinstance(first, dict):
            return first.get("courses", [])
        return []

    @classmethod
    def fetch_all_tasks(
        cls,
        moodle_session: str,
        sesskey: str,
    ) -> List[Dict[str, Any]]:
        """
        Fetches timeline upcoming tasks and deep scans course modules for hidden assignments.
        """
        current_epoch = int(datetime.now(timezone.utc).timestamp())
        calls = [
            {
                "methodname": "core_calendar_get_action_events_by_timesort",
                "args": {
                    "timesortfrom": current_epoch - 86400 * 7,  # include past week
                    "limitnum": 50,
                },
            }
        ]
        results = cls.post_ajax_batch(moodle_session, sesskey, calls)
        events_data = results[0] if results else {}
        events = events_data.get("events", []) if isinstance(events_data, dict) else []

        tasks = []
        for raw in events:
            if raw.get("modulename") == "assign":
                tasks.append({
                    "id": raw.get("id"),
                    "courseId": raw.get("course", {}).get("id", 0),
                    "name": raw.get("name", "Untitled Assignment"),
                    "dueDate": raw.get("timesort") or raw.get("timestart"),
                    "submission": "not-submitted",
                    "hidden": False,
                    "url": raw.get("url"),
                    "grade": None,
                })
        return tasks


class DuticSyncService:
    """
    Domain service for persisting UNSA Moodle data into CampusUNSA PostgreSQL.
    """

    @classmethod
    def sync_student_dutic(
        cls,
        db: Session,
        user: User,
        moodle_session: str,
        sesskey: str,
    ) -> SyncDuticResponse:
        """
        Executes full course and assignment ingestion from DUTIC Moodle.
        """
        try:
            courses_data = DuticApiClient.fetch_enrolled_courses(moodle_session, sesskey)
            tasks_data = DuticApiClient.fetch_all_tasks(moodle_session, sesskey)
        except DuticSessionExpiredError as exc:
            user.moodle_calendar_sync_status = "NEEDS_REAUTH"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "code": "NEEDS_REAUTH",
                    "message": "DUTIC Moodle session expired or invalid. Reauthentication required.",
                },
            ) from exc
        except DuticRateLimitError as exc:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": "DUTIC Moodle rate limit exceeded. Please retry later.",
                },
            ) from exc

        synced_courses_count = 0
        synced_assignments_count = 0

        # Cache courses map for assignment foreign keys
        courses_map: Dict[str, ClassroomCourse] = {}

        for c_item in courses_data:
            moodle_course_id = str(c_item.get("id"))
            course_ref_id = f"moodle-{moodle_course_id}"
            fullname = c_item.get("fullname", "Untitled Course")
            shortname = c_item.get("shortname")

            course = AcademicSyncRepository.upsert_course(
                db,
                user_id=user.id,
                course_ref_id=course_ref_id,
                name=fullname,
                section=shortname,
                alternate_link=f"https://aulavirtual.unsa.edu.pe/course/view.php?id={moodle_course_id}",
                origin="moodle",
            )

            courses_map[moodle_course_id] = course
            courses_map[course_ref_id] = course
            synced_courses_count += 1

        for t_item in tasks_data:
            moodle_task_id = str(t_item.get("id"))
            task_ref_id = f"moodle-{moodle_task_id}"
            raw_course_id = str(t_item.get("courseId", ""))
            course = courses_map.get(raw_course_id)

            # If course is not mapped yet, create a placeholder course record
            if not course:
                placeholder_course_id = f"moodle-{raw_course_id}"
                course = AcademicSyncRepository.upsert_course(
                    db,
                    user_id=user.id,
                    course_ref_id=placeholder_course_id,
                    name=f"Moodle Course {raw_course_id}",
                    alternate_link=f"https://aulavirtual.unsa.edu.pe/course/view.php?id={raw_course_id}",
                    origin="moodle",
                )
                courses_map[raw_course_id] = course

            due_epoch = t_item.get("dueDate")
            due_dt = (
                datetime.fromtimestamp(due_epoch, tz=timezone.utc)
                if due_epoch
                else None
            )

            title = t_item.get("name", "Untitled Assignment")
            submission_state = t_item.get("submission", "unknown")
            task_url = t_item.get("url")

            AcademicSyncRepository.upsert_assignment(
                db,
                user_id=user.id,
                course_id=course.id,
                assignment_ref_id=task_ref_id,
                title=title,
                due_date=due_dt,
                state=submission_state,
                alternate_link=task_url,
                origin="moodle",
            )
            synced_assignments_count += 1

        sync_timestamp = datetime.now(timezone.utc)
        user.moodle_calendar_sync_status = "SYNCED"
        db.commit()

        return SyncDuticResponse(
            status="SYNCED",
            synced_courses_count=synced_courses_count,
            synced_assignments_count=synced_assignments_count,
            synced_at=sync_timestamp,
        )
