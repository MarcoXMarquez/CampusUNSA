"""Seed only the disposable performance database, never the developer database."""

import base64
from io import BytesIO
import json
import os
from datetime import date, datetime, timedelta, timezone
from secrets import token_urlsafe
from pathlib import Path
from uuid import uuid4

from PIL import Image

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import create_access_token, hash_password
from app.models.classroom import (
    ClassroomAssignment,
    CourseExternalSource,
    CourseScheduleBlock,
    UserCourseEnrollment,
    UserExternalCourse,
)
from app.models.lost_found import LostClaim, LostItem
from app.models.ticket import Ticket, TicketNotification
from app.models.user import User, UserProfile
from app.services.academic.calendar_feed import feed_digest
from app.services.academic.curriculum_resolver import CurriculumResolverService, DEFAULT_TERM
from app.services.lost_found_media import store_photos


def require_isolation() -> None:
    if (
        os.environ.get("PERF_ISOLATED") != "1"
        or settings.ENVIRONMENT != "performance"
        or settings.POSTGRES_SERVER != "perf-postgres"
        or settings.POSTGRES_DB != "campusunsa_perf"
        or settings.REDIS_HOST != "perf-redis"
    ):
        raise RuntimeError("Load fixtures require the isolated performance stack")


def identity(index: int) -> str:
    if not 0 <= index < 1000:
        raise ValueError("Synthetic student index is outside the fixture dataset")
    return f"perf-user-{index:04d}"


def seed() -> None:
    require_isolation()
    perf_password_hash = hash_password("perfpassword123", iterations=1000)
    credentials: list[dict[str, str]] = []
    faculty = "QA Engineering"
    peak = os.environ.get("PERF_PROFILE") == "peak"
    course_code = "1705275"
    with Image.new("RGB", (24, 16), "blue") as image, BytesIO() as stream:
        image.save(stream, "JPEG")
        photo = stream.getvalue()
    media_dir = Path(settings.LOST_FOUND_MEDIA_DIR)
    media_dir.mkdir(parents=True)
    os.chown(media_dir, 1000, 1000)
    with SessionLocal() as db:
        if db.query(User).count():
            raise RuntimeError("Refusing to seed a nonempty performance database")
        CurriculumResolverService.ensure_catalog_seeded(db)
        shared_sources = []
        for origin, course_ref in (
            ("classroom", "perf-google"),
            ("moodle", "moodle-42"),
        ):
            source = CourseExternalSource(
                id=uuid4(),
                term="2026B",
                origin=origin,
                external_course_id=course_ref,
                raw_name=f"Performance {origin.title()}",
            )
            db.add(source)
            shared_sources.append((origin, source))
        db.flush()

        fixture_claimant = User(email="perf-claimant@unsa.edu.pe", role="student")
        db.add(fixture_claimant)
        db.flush()
        for index in range(1000):
            name = identity(index)
            user = User(
                id=uuid4(),
                email=f"{name}@unsa.edu.pe",
                role="student",
                is_active=True,
                password_hash=perf_password_hash,
            )
            db.add(user)
            # Ticket has a foreign key but no ORM relationship to order its insert.
            db.flush()
            db.add(UserProfile(
                user_id=user.id, full_name=f"Synthetic Student {index}", faculty=faculty,
            ))
            for origin, source in shared_sources:
                db.add(
                    UserExternalCourse(
                        user_id=user.id,
                        source_id=source.id,
                    )
                )
                db.add(
                    ClassroomAssignment(
                        user_id=user.id,
                        source_id=source.id,
                        classroom_assignment_id=f"{origin}-fixture",
                        title="Synthetic assignment",
                        origin=origin,
                        due_date=datetime(2030, 1, 1, tzinfo=timezone.utc),
                    )
                )
            if peak:
                enrollment = UserCourseEnrollment(
                    id=uuid4(),
                    user_id=user.id,
                    course_code=course_code,
                    term=DEFAULT_TERM,
                    theory_group="A",
                    lab_group="B",
                )
                db.add(enrollment)
                db.flush()
                db.add(
                    ClassroomAssignment(
                        user_id=user.id,
                        course_code=course_code,
                        enrollment_id=enrollment.id,
                        classroom_assignment_id=f"manual-{name}",
                        title="Synthetic manual assignment",
                        component_type_override="TEORIA",
                        origin="manual",
                        due_date=datetime(2026, 12, 2, tzinfo=timezone.utc),
                    )
                )
            review, withdraw, resolved = (
                Ticket(
                    id=uuid4(), student_id=user.id, tracking_code=f"PERF-{index:04d}-{status_code}",
                    category="QA", subject="Synthetic queue fixture", faculty=faculty, status=status,
                    resolved_at=datetime.now(timezone.utc) if status == "RESOLVED" else None,
                )
                for status_code, status in (("REVIEW", "OPEN"), ("WITHDRAW", "OPEN"), ("NOTICE", "RESOLVED"))
            )
            resolved.resolution = "Synthetic resolution."
            db.add_all((review, withdraw, resolved))
            db.flush()
            notice = TicketNotification(
                id=uuid4(), ticket_id=resolved.id, student_id=user.id, tracking_code=resolved.tracking_code,
            )
            db.add(notice)
            open_item, review_item, return_item = (
                LostItem(
                    id=uuid4(), reporter_id=user.id, title="Synthetic lost item",
                    description="Load fixture", campus="engineering", location="QA Engineering",
                    found_on=date(2026, 1, 1), status=status,
                )
                for status in ("open", "open", "reserved")
            )
            db.add_all((open_item, review_item, return_item))
            db.flush()
            claim = LostClaim(
                id=uuid4(), item_id=review_item.id, claimant_id=fixture_claimant.id,
                proof="Synthetic private proof",
            )
            db.add_all((claim, LostClaim(
                item_id=return_item.id, claimant_id=fixture_claimant.id,
                proof="Synthetic private proof", status="approved", pickup="Synthetic handoff",
            )))
            for item in (open_item, review_item, return_item):
                store_photos(item.id, (photo, photo))
            credentials.append({
                "identity": name,
                "token": create_access_token({"sub": str(user.id)}),
                "review_ticket_id": str(review.id),
                "withdraw_ticket_id": str(withdraw.id),
                "resolved_ticket_id": str(resolved.id),
                "notice_id": str(notice.id),
                "lost_open_item": str(open_item.id),
                "lost_review_item": str(review_item.id),
                "lost_return_item": str(return_item.id),
                "lost_review_claim": str(claim.id),
            })
        for index, credential in enumerate(credentials):
            credential["lost_claimable_item"] = credentials[(index + 1) % len(credentials)]["lost_open_item"]
        staff = User(
            id=uuid4(),
            email="perf-secretary@unsa.edu.pe",
            role="secretary",
            is_active=True,
        )
        db.add(staff)
        db.add(UserProfile(user_id=staff.id, full_name="Synthetic Secretary", faculty=faculty))
        # Keep the completion fixture independent from the destructive cleanup scenarios.
        calendar_token = token_urlsafe(32)
        today = datetime.now(timezone.utc).date()
        completion_user = User(
            id=uuid4(), email="perf-completion@unsa.edu.pe", role="student", is_active=True,
            calendar_feed_hash=feed_digest(calendar_token),
            calendar_feed_start=today, calendar_feed_end=today + timedelta(days=30),
        )
        db.add(completion_user)
        db.flush()
        completion_source = CourseExternalSource(
            id=uuid4(),
            term=DEFAULT_TERM,
            origin="classroom",
            external_course_id="completion-course",
            raw_name="Completion Performance",
            course_code="1705275",
            component_type="UNICO",
            mapping_status="LINKED",
            mapping_source="PERF_SEED",
        )
        db.add(completion_source)
        db.flush()
        completion_enrollment = UserCourseEnrollment(
            id=uuid4(),
            user_id=completion_user.id,
            course_code="1705275",
            term=DEFAULT_TERM,
            theory_group="A",
            lab_group="B",
        )
        db.add(completion_enrollment)
        db.flush()
        db.add(
            CourseScheduleBlock(
                id=uuid4(),
                course_code="1705275",
                term=DEFAULT_TERM,
                component_type="TEORIA",
                group_code="A",
                day_of_week=1,
                start_time="16:40",
                end_time="18:30",
                room="Aula 302",
                updated_by_user_id=completion_user.id,
            )
        )
        db.add(
            CourseScheduleBlock(
                id=uuid4(),
                course_code="1705275",
                term=DEFAULT_TERM,
                component_type="LABORATORIO",
                group_code="B",
                day_of_week=3,
                start_time="15:50",
                end_time="17:30",
                room="Lab 4",
                updated_by_user_id=completion_user.id,
            )
        )
        db.add(
            UserExternalCourse(
                user_id=completion_user.id,
                source_id=completion_source.id,
                enrollment_id=completion_enrollment.id,
            )
        )
        completion_assignment = ClassroomAssignment(
            id=uuid4(),
            user_id=completion_user.id,
            source_id=completion_source.id,
            course_code="1705275",
            enrollment_id=completion_enrollment.id,
            classroom_assignment_id="completion-fixture",
            title="Completion fixture",
        )
        db.add(completion_assignment)
        db.commit()
        payload = {
            "students": credentials,
            "lost_photo": base64.b64encode(photo).decode(),
            "staff_token": create_access_token({"sub": str(staff.id)}),
            "calendar_token": calendar_token,
            "completion_token": create_access_token({"sub": str(completion_user.id)}),
            "completion_assignment_id": str(completion_assignment.id),
            "completion_source_id": str(completion_source.id),
            "completion_course_code": "1705275",
        }
        Path("/load-data/users.json").write_text(json.dumps(payload), encoding="utf-8")
    print(
        "Seeded 1,000 institutional students, one QA secretary, a completion identity, and isolated ticket lifecycle fixtures."
    )


if __name__ == "__main__":
    seed()
