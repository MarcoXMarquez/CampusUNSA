"""Build a private weekly schedule subscription in RFC 5545 format."""

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256

from app.schemas.academic import WeeklyScheduleSessionResponse
from app.services.academic.schedule_calculator import LIMA_TIMEZONE


def feed_digest(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def _calendar_text(value: str) -> str:
    normalized = value.replace("\r\n", "\n").replace("\r", "\n")
    return (
        normalized.replace("\\", "\\\\").replace("\n", "\\n")
        .replace(";", "\\;").replace(",", "\\,")
    )


def _fold(line: str) -> str:
    parts: list[str] = []
    length = 0
    for character in line:
        width = len(character.encode("utf-8"))
        if length + width > 75:
            parts.append("\r\n ")
            length = 1
        parts.append(character)
        length += width
    return "".join(parts)


def _utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_calendar(
    slots: Iterable[WeeklyScheduleSessionResponse], start: date, end: date, stamp: datetime,
) -> str:
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CampusUNSA//Academic Schedule//EN",
             "CALSCALE:GREGORIAN", "X-WR-CALNAME:CampusUNSA"]
    emitted: set[tuple[str, object]] = set()
    for slot in slots:
        key = (slot.term, slot.id)
        if key in emitted:
            continue
        first = start + timedelta(days=(slot.day_of_week - start.isoweekday()) % 7)
        if first > end:
            continue
        last = first + timedelta(days=(end - first).days // 7 * 7)
        first_start = datetime.combine(first, time.fromisoformat(slot.start_time), LIMA_TIMEZONE)
        first_end = datetime.combine(first, time.fromisoformat(slot.end_time), LIMA_TIMEZONE)
        last_start = datetime.combine(last, first_start.timetz())
        emitted.add(key)
        lines.extend([
            "BEGIN:VEVENT", f"UID:{slot.id}-{slot.term}@campusunsa",
            f"DTSTAMP:{_utc(stamp)}", f"DTSTART:{_utc(first_start)}",
            f"DTEND:{_utc(first_end)}", f"RRULE:FREQ=WEEKLY;UNTIL={_utc(last_start)}",
            f"SUMMARY:{_calendar_text(slot.course_name)}",
        ])
        location = ", ".join(value for value in (slot.pavilion, slot.room) if value)
        if location:
            lines.append(f"LOCATION:{_calendar_text(location)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
