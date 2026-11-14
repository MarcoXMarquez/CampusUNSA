"""
TDD Suite for ScheduleCalculator domain service, pavilion persistence, and
weekly / next-class schedule endpoints (US-06 / REQ-10 / REQ-11).
"""

import uuid
from datetime import datetime, timezone
from typing import Dict

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.classroom import UserCourseEnrollment
from app.models.user import User
from app.schemas.academic import AcademicCourseResponse, CourseScheduleBlockResponse
from app.services.curriculum_resolver import DEFAULT_TERM, CurriculumResolverService
from app.services.schedule_calculator import ScheduleCalculator


def _make_course(
    *,
    code: str = "1705275",
    name: str = "Ingeniería de Sistemas",
    mapping_status: str = "LINKED",
    blocks: list[CourseScheduleBlockResponse] | None = None,
) -> AcademicCourseResponse:
    now = datetime(2026, 11, 1, tzinfo=timezone.utc)
    return AcademicCourseResponse(
        id=uuid.uuid4(),
        classroom_course_id=code,
        name=name,
        origin="classroom",
        course_code=code,
        curriculum_year=2017,
        theory_group="A",
        lab_group="B",
        mapping_status=mapping_status,
        schedule_blocks=blocks or [],
        created_at=now,
        updated_at=now,
    )


def _make_block(
    *,
    code: str = "1705275",
    day: int,
    start: str,
    end: str,
    component: str = "TEORIA",
    group: str = "A",
    room: str | None = "Aula 201",
    pavilion: str | None = "Pabellón Matilde Pérez",
) -> CourseScheduleBlockResponse:
    return CourseScheduleBlockResponse(
        id=uuid.uuid4(),
        course_code=code,
        term=DEFAULT_TERM,
        component_type=component,
        group_code=group,
        day_of_week=day,
        start_time=start,
        end_time=end,
        room=room,
        pavilion=pavilion,
    )


def test_schedule_calculator_returns_empty_when_no_linked_blocks() -> None:
    pending_course = _make_course(
        code="1704257",
        mapping_status="PENDING_LINK",
        blocks=[_make_block(code="1704257", day=1, start="08:00", end="10:00")],
    )
    linked_without_blocks = _make_course(code="1705275", blocks=[])

    result = ScheduleCalculator.compute_next_class(
        [pending_course, linked_without_blocks],
        now=datetime.fromisoformat("2026-11-17T09:30:00-05:00"),
    )

    assert result.status == "EMPTY"
    assert result.course_code is None
    assert result.minutes_remaining is None


def test_schedule_calculator_upcoming_today_returns_exact_countdown_and_pavilion() -> None:
    course = _make_course(
        name="Systems Engineering",
        blocks=[
            _make_block(
                day=2,
                start="10:00",
                end="11:40",
                room="Aula 201",
                pavilion="Pabellón Matilde Pérez",
            )
        ],
    )

    result = ScheduleCalculator.compute_next_class(
        [course],
        now=datetime.fromisoformat("2026-11-17T09:30:00-05:00"),
    )

    assert result.status == "UPCOMING_TODAY"
    assert result.minutes_remaining == 30
    assert result.course_name == "Systems Engineering"
    assert result.room == "Aula 201"
    assert result.pavilion == "Pabellón Matilde Pérez"
    assert result.is_tomorrow is False


def test_schedule_calculator_handles_midday_utc_to_lima_and_consecutive_slots() -> None:
    course = _make_course(
        blocks=[
            _make_block(day=3, start="10:20", end="12:00", room="Aula 101"),
            _make_block(
                day=3,
                start="12:00",
                end="13:40",
                component="LABORATORIO",
                group="B",
                room="Lab 4",
                pavilion="Pabellón Alan Turing",
            ),
        ]
    )

    # 17:00 UTC = 12:00 America/Lima -> exact boundary switches to 12:00-13:40 slot
    at_noon = ScheduleCalculator.compute_next_class(
        [course],
        now=datetime.fromisoformat("2026-11-18T17:00:00+00:00"),
    )
    assert at_noon.status == "IN_PROGRESS"
    assert at_noon.start_time == "12:00"
    assert at_noon.end_time == "13:40"
    assert at_noon.room == "Lab 4"
    assert at_noon.pavilion == "Pabellón Alan Turing"
    assert at_noon.minutes_remaining == 100


def test_schedule_calculator_breaks_overlapping_slots_by_earliest_end_time() -> None:
    long_course = _make_course(
        code="1705275",
        name="Curso Largo",
        blocks=[_make_block(code="1705275", day=1, start="09:00", end="11:30")],
    )
    short_course = _make_course(
        code="1704257",
        name="Curso Corto",
        blocks=[_make_block(code="1704257", day=1, start="09:30", end="10:30")],
    )

    result = ScheduleCalculator.compute_next_class(
        [long_course, short_course],
        now=datetime.fromisoformat("2026-11-16T09:45:00-05:00"),
    )

    assert result.status == "IN_PROGRESS"
    assert result.course_code == "1704257"
    assert result.minutes_remaining == 45


def test_schedule_calculator_tomorrow_weekend_and_same_weekday_wrap() -> None:
    course = _make_course(
        blocks=[
            _make_block(day=1, start="08:00", end="09:40", room="Aula 102"),
            _make_block(day=3, start="08:00", end="09:40", room="Aula 202"),
        ]
    )

    # Tuesday night -> tomorrow is Wednesday (is_tomorrow=True)
    tuesday_night = ScheduleCalculator.compute_next_class(
        [course],
        now=datetime.fromisoformat("2026-11-17T20:00:00-05:00"),
    )
    assert tuesday_night.status == "NEXT_DAY"
    assert tuesday_night.is_tomorrow is True
    assert tuesday_night.day_of_week == 3
    assert tuesday_night.start_time == "08:00"

    # Sunday night -> tomorrow wraps across week boundary to Monday (is_tomorrow=True)
    sunday_night = ScheduleCalculator.compute_next_class(
        [course],
        now=datetime.fromisoformat("2026-11-22T21:00:00-05:00"),
    )
    assert sunday_night.status == "NEXT_DAY"
    assert sunday_night.is_tomorrow is True
    assert sunday_night.day_of_week == 1

    # Thursday afternoon -> Monday next week (is_tomorrow=False)
    thursday_evening = ScheduleCalculator.compute_next_class(
        [course],
        now=datetime.fromisoformat("2026-11-19T18:00:00-05:00"),
    )
    assert thursday_evening.status == "NEXT_DAY"
    assert thursday_evening.is_tomorrow is False
    assert thursday_evening.day_of_week == 1


def test_schedule_calculator_build_weekly_schedule_groups_and_sorts_days() -> None:
    course = _make_course(
        blocks=[
            _make_block(day=1, start="14:00", end="15:40", room="Lab 2"),
            _make_block(day=1, start="08:40", end="10:20", room="Aula 204"),
            _make_block(day=5, start="10:00", end="11:40", room="Aula 301"),
        ]
    )

    weekly = ScheduleCalculator.build_weekly_schedule(
        [course],
        now=datetime.fromisoformat("2026-11-16T08:00:00-05:00"),
    )

    assert len(weekly.days) == 7
    assert [s.start_time for s in weekly.days[0].sessions] == ["08:40", "14:00"]
    assert [s.start_time for s in weekly.days[4].sessions] == ["10:00"]
    assert weekly.next_class.status == "UPCOMING_TODAY"
    assert weekly.next_class.minutes_remaining == 40


@pytest.fixture
def schedule_calc_db_session() -> Session:
    """Isolated SQLite database seeded with UNSA catalog for endpoint tests."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        CurriculumResolverService.ensure_catalog_seeded(session)
        session.commit()
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def _create_enrolled_student(db: Session) -> tuple[User, Dict[str, str]]:
    student = User(
        id=uuid.uuid4(),
        email="weekly.student@unsa.edu.pe",
        cui="20202026",
        role="student",
        is_active=True,
    )
    db.add(student)
    db.flush()
    db.add(
        UserCourseEnrollment(
            user_id=student.id,
            course_code="1705275",
            term=DEFAULT_TERM,
            theory_group="A",
            lab_group="B",
        )
    )
    db.commit()
    db.refresh(student)
    token = create_access_token(data={"sub": str(student.id), "role": "student"})
    return student, {"Authorization": f"Bearer {token}"}


def test_schedule_endpoints_persist_pavilion_and_compute_next_and_weekly(
    schedule_calc_db_session: Session,
) -> None:
    inspector = inspect(schedule_calc_db_session.bind)
    columns = {col["name"] for col in inspector.get_columns("course_schedule_blocks")}
    assert "pavilion" in columns

    _, headers = _create_enrolled_student(schedule_calc_db_session)

    app.dependency_overrides[get_db] = lambda: schedule_calc_db_session
    try:
        with TestClient(app) as client:
            put_res = client.put(
                "/api/v1/courses/enrolled/1705275/schedule",
                headers=headers,
                json={
                    "theory_group": "A",
                    "lab_group": "B",
                    "blocks": [
                        {
                            "component_type": "TEORIA",
                            "group_code": "A",
                            "day_of_week": 2,
                            "start_time": "10:00",
                            "end_time": "11:40",
                            "room": "Aula 201",
                            "pavilion": "  Pabellón Matilde Pérez  ",
                        }
                    ],
                },
            )
            assert put_res.status_code == 200
            saved_block = put_res.json()["schedule_blocks"][0]
            assert saved_block["pavilion"] == "Pabellón Matilde Pérez"

            next_res = client.get(
                "/api/v1/courses/schedule/next-class",
                params={"at": "2026-11-17T09:30:00-05:00"},
                headers=headers,
            )
            assert next_res.status_code == 200
            next_data = next_res.json()
            assert next_data["status"] == "UPCOMING_TODAY"
            assert next_data["minutes_remaining"] == 30
            assert next_data["room"] == "Aula 201"
            assert next_data["pavilion"] == "Pabellón Matilde Pérez"

            weekly_res = client.get(
                "/api/v1/courses/schedule/weekly",
                params={"at": "2026-11-17T09:30:00-05:00"},
                headers=headers,
            )
            assert weekly_res.status_code == 200
            weekly_data = weekly_res.json()
            assert len(weekly_data["days"]) == 7
            assert weekly_data["days"][1]["sessions"][0]["pavilion"] == "Pabellón Matilde Pérez"
    finally:
        app.dependency_overrides.clear()
