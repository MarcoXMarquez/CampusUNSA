"""Pure domain calculator for weekly schedules and next-class countdowns in America/Lima."""

from datetime import datetime, timezone
from typing import Dict, List, NamedTuple, Optional, Sequence
from zoneinfo import ZoneInfo

from app.schemas.academic import (
    AcademicCourseResponse,
    CourseScheduleBlockResponse,
    NextClassResponse,
    WeeklyScheduleDayResponse,
    WeeklyScheduleResponse,
    WeeklyScheduleSessionResponse,
)
from app.services.curriculum_resolver import DEFAULT_TERM

LIMA_TIMEZONE = ZoneInfo("America/Lima")


class _IndexedSlot(NamedTuple):
    course_code: str
    course_name: str
    block: CourseScheduleBlockResponse
    start_min: int
    end_min: int


def _parse_hhmm_minutes(hhmm: str) -> Optional[int]:
    parts = hhmm.split(":")
    if len(parts) != 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
    except ValueError:
        return None
    if not (0 <= hours <= 23 and 0 <= minutes <= 59):
        return None
    return hours * 60 + minutes


def _to_lima_datetime(now: Optional[datetime]) -> datetime:
    if now is None:
        return datetime.now(LIMA_TIMEZONE)
    if now.tzinfo is None:
        return now.replace(tzinfo=timezone.utc).astimezone(LIMA_TIMEZONE)
    return now.astimezone(LIMA_TIMEZONE)


def _collect_linked_slots(courses: Sequence[AcademicCourseResponse]) -> List[_IndexedSlot]:
    slots: List[_IndexedSlot] = []
    for course in courses:
        if course.mapping_status == "PENDING_LINK":
            continue
        code = course.course_code or course.classroom_course_id
        for block in course.schedule_blocks:
            start_min = _parse_hhmm_minutes(block.start_time)
            end_min = _parse_hhmm_minutes(block.end_time)
            if start_min is None or end_min is None or end_min <= start_min:
                continue
            slots.append(
                _IndexedSlot(
                    course_code=code,
                    course_name=course.name,
                    block=block,
                    start_min=start_min,
                    end_min=end_min,
                )
            )
    return slots


def _build_next_response(
    *,
    status: str,
    slot: _IndexedSlot,
    minutes_remaining: int,
    is_tomorrow: bool,
    computed_at: datetime,
) -> NextClassResponse:
    block = slot.block
    return NextClassResponse(
        status=status,  # type: ignore[arg-type]
        course_code=slot.course_code,
        course_name=slot.course_name,
        component_type=block.component_type,
        group_code=block.group_code,
        day_of_week=block.day_of_week,
        start_time=block.start_time,
        end_time=block.end_time,
        room=block.room,
        pavilion=block.pavilion,
        minutes_remaining=max(1, minutes_remaining),
        is_tomorrow=is_tomorrow,
        computed_at=computed_at,
    )


class ScheduleCalculator:
    """Computes upcoming/in-progress class countdowns and 7-day weekly schedules."""

    @staticmethod
    def compute_next_class(
        courses: Sequence[AcademicCourseResponse],
        now: Optional[datetime] = None,
    ) -> NextClassResponse:
        """Determine active session, next session today, or next upcoming weekday session."""
        lima_now = _to_lima_datetime(now)
        slots = _collect_linked_slots(courses)
        if not slots:
            return NextClassResponse(status="EMPTY", computed_at=lima_now)

        day_of_week = lima_now.isoweekday()
        minutes_of_day = lima_now.hour * 60 + lima_now.minute

        active = [
            slot
            for slot in slots
            if slot.block.day_of_week == day_of_week
            and slot.start_min <= minutes_of_day < slot.end_min
        ]
        if active:
            active.sort(key=lambda s: (s.end_min, s.start_min, s.course_code, s.block.component_type))
            chosen = active[0]
            return _build_next_response(
                status="IN_PROGRESS",
                slot=chosen,
                minutes_remaining=chosen.end_min - minutes_of_day,
                is_tomorrow=False,
                computed_at=lima_now,
            )

        later_today = [
            slot
            for slot in slots
            if slot.block.day_of_week == day_of_week and slot.start_min > minutes_of_day
        ]
        if later_today:
            later_today.sort(key=lambda s: (s.start_min, s.end_min, s.course_code, s.block.component_type))
            chosen = later_today[0]
            return _build_next_response(
                status="UPCOMING_TODAY",
                slot=chosen,
                minutes_remaining=chosen.start_min - minutes_of_day,
                is_tomorrow=False,
                computed_at=lima_now,
            )

        def _next_day_key(slot: _IndexedSlot) -> tuple[int, int, str, str]:
            raw_delta = (slot.block.day_of_week - day_of_week) % 7
            day_delta = 7 if raw_delta == 0 else raw_delta
            minutes_away = day_delta * 1440 + (slot.start_min - minutes_of_day)
            return (minutes_away, slot.end_min, slot.course_code, slot.block.component_type)

        slots.sort(key=_next_day_key)
        chosen = slots[0]
        raw_delta = (chosen.block.day_of_week - day_of_week) % 7
        day_delta = 7 if raw_delta == 0 else raw_delta
        minutes_away = day_delta * 1440 + (chosen.start_min - minutes_of_day)
        return _build_next_response(
            status="NEXT_DAY",
            slot=chosen,
            minutes_remaining=minutes_away,
            is_tomorrow=day_delta == 1,
            computed_at=lima_now,
        )

    @staticmethod
    def build_weekly_schedule(
        courses: Sequence[AcademicCourseResponse],
        now: Optional[datetime] = None,
        term: str = DEFAULT_TERM,
    ) -> WeeklyScheduleResponse:
        """Organize all linked course blocks into a sorted Mon-Sun weekly matrix."""
        slots = _collect_linked_slots(courses)
        days_map: Dict[int, List[WeeklyScheduleSessionResponse]] = {day: [] for day in range(1, 8)}
        resolved_term = term

        slots.sort(
            key=lambda s: (
                s.block.day_of_week,
                s.start_min,
                s.end_min,
                s.course_code,
                s.block.component_type,
            )
        )
        for slot in slots:
            block = slot.block
            if block.term:
                resolved_term = block.term
            if block.day_of_week not in days_map:
                continue
            days_map[block.day_of_week].append(
                WeeklyScheduleSessionResponse(
                    id=block.id,
                    course_code=slot.course_code,
                    course_name=slot.course_name,
                    term=block.term,
                    component_type=block.component_type,
                    group_code=block.group_code,
                    day_of_week=block.day_of_week,
                    start_time=block.start_time,
                    end_time=block.end_time,
                    room=block.room,
                    pavilion=block.pavilion,
                )
            )

        return WeeklyScheduleResponse(
            term=resolved_term,
            days=[
                WeeklyScheduleDayResponse(day_of_week=day, sessions=days_map[day])
                for day in range(1, 8)
            ],
            next_class=ScheduleCalculator.compute_next_class(courses, now=now),
        )
