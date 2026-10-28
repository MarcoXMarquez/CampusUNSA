"""Seed only the disposable performance database, never the developer database."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.classroom import ClassroomAssignment, ClassroomCourse
from app.models.ticket import Ticket
from app.models.user import User, UserProfile


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
    credentials: list[dict[str, str]] = []
    with SessionLocal() as db:
        if db.query(User).count():
            raise RuntimeError("Refusing to seed a nonempty performance database")
        for index in range(1000):
            name = identity(index)
            user = User(
                id=uuid4(), email=f"{name}@unsa.edu.pe", role="student", is_active=True
            )
            db.add(user)
            # Ticket has a foreign key but no ORM relationship to order its insert.
            db.flush()
            db.add(UserProfile(user_id=user.id, full_name=f"Synthetic Student {index}"))
            for origin, course_ref in (
                ("classroom", "perf-google"),
                ("moodle", "moodle-42"),
            ):
                course = ClassroomCourse(
                    id=uuid4(),
                    user_id=user.id,
                    classroom_course_id=course_ref,
                    name=f"Performance {origin.title()}",
                )
                db.add(course)
                db.add(
                    ClassroomAssignment(
                        user_id=user.id,
                        course_id=course.id,
                        classroom_assignment_id=f"{origin}-fixture",
                        title="Synthetic assignment",
                        origin=origin,
                        due_date=datetime(2030, 1, 1, tzinfo=timezone.utc),
                    )
                )
            if index < 20:
                db.add(
                    Ticket(
                        student_id=user.id,
                        tracking_code=f"PERF-{index:04d}",
                        category="QA",
                        subject="Synthetic queue fixture",
                    )
                )
            credentials.append(
                {"identity": name, "token": create_access_token({"sub": str(user.id)})}
            )
        staff = User(
            id=uuid4(),
            email="perf-secretary@unsa.edu.pe",
            role="secretary",
            is_active=True,
        )
        db.add(staff)
        db.add(UserProfile(user_id=staff.id, full_name="Synthetic Secretary"))
        db.commit()
        payload = {
            "students": credentials,
            "staff_token": create_access_token({"sub": str(staff.id)}),
        }
        Path("/load-data/users.json").write_text(json.dumps(payload), encoding="utf-8")
    print(
        "Seeded 1,000 institutional students, one QA secretary, 2,000 courses and assignments, and 20 tickets."
    )


if __name__ == "__main__":
    seed()
