"""Conservative date evidence and deterministic deadline resolution."""

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.schemas.task_parser import ParseTaskRequest

ISO = re.compile(
    r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?\b", re.I
)
DATE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
CLOCK = re.compile(r"\b(\d{1,2}):(\d{2})\s*(am|pm)?\b", re.I)
HOUR = re.compile(r"\b(\d{1,2})\s*(am|pm)\b", re.I)
RELATIVE = re.compile(r"\b(tomorrow|manana|today|hoy)\b")
WEEKDAYS = {
    "monday": 0,
    "lunes": 0,
    "tuesday": 1,
    "martes": 1,
    "wednesday": 2,
    "miercoles": 2,
    "thursday": 3,
    "jueves": 3,
    "friday": 4,
    "viernes": 4,
    "vie": 4,
    "saturday": 5,
    "sabado": 5,
    "sunday": 6,
    "domingo": 6,
}
WEEKDAY = re.compile(
    r"\b(?:(?:next|this|el|este|proximo|prox)\s+){0,2}(" + "|".join(WEEKDAYS) + r")\b"
)
OTHER_DATE = re.compile(
    r"\b(?:\d{1,2}/\d{1,2}/\d{4}|january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b"
)


def normalize(text: str) -> str:
    return "".join(
        char
        for char in unicodedata.normalize("NFD", text.lower())
        if not unicodedata.combining(char)
    )


@dataclass(frozen=True)
class DeadlineEvidence:
    due_date: datetime | None
    has_date: bool
    has_time: bool
    spans: tuple[tuple[int, int], ...] = ()


def localize(value: datetime, zone: ZoneInfo) -> datetime:
    first = value.replace(tzinfo=zone, fold=0)
    second = value.replace(tzinfo=zone, fold=1)
    if (
        first.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) != value
        or first.utcoffset() != second.utcoffset()
    ):
        raise ValueError("Ambiguous or nonexistent local time")
    return first.astimezone(timezone.utc)


def resolve_deadline(request: ParseTaskRequest) -> DeadlineEvidence:
    message = normalize(request.message)
    zone = ZoneInfo(request.timezone)
    iso_matches = list(ISO.finditer(request.message))
    if len(iso_matches) > 1:
        raise ValueError("Multiple deadlines require clarification")
    if iso_matches:
        match = iso_matches[0]
        remainder = normalize(
            request.message[: match.start()] + " " + request.message[match.end() :]
        )
        if re.match(r"[+:\-]\d", request.message[match.end() :]):
            raise ValueError("Incomplete time or UTC offset")
        if (
            DATE.search(remainder)
            or RELATIVE.search(remainder)
            or WEEKDAY.search(remainder)
            or CLOCK.search(remainder)
            or HOUR.search(remainder)
        ):
            raise ValueError("Multiple deadlines require clarification")
        value = datetime.fromisoformat(match.group().upper().replace("Z", "+00:00"))
        aware = (
            value.astimezone(timezone.utc) if value.tzinfo else localize(value, zone)
        )
        return DeadlineEvidence(aware, True, True, (match.span(),))

    days = (
        list(DATE.finditer(message))
        + list(RELATIVE.finditer(message))
        + list(WEEKDAY.finditer(message))
    )
    clocks = list(CLOCK.finditer(message)) or list(HOUR.finditer(message))
    if len(days) > 1 or len(clocks) > 1:
        raise ValueError("Multiple dates or times require clarification")
    has_date = bool(days or OTHER_DATE.search(message))
    if not days or not clocks:
        return DeadlineEvidence(
            None, has_date, bool(clocks), tuple(match.span() for match in days + clocks)
        )
    day, clock = days[0], clocks[0]
    current = request.reference_time.astimezone(zone)
    if DATE.fullmatch(day.group()):
        date = datetime.fromisoformat(day.group()).date()
    elif RELATIVE.fullmatch(day.group()):
        date = (
            current + timedelta(days=1 if day.group() in ("tomorrow", "manana") else 0)
        ).date()
    else:
        delta = (WEEKDAYS[day.group(1)] - current.weekday()) % 7
        if delta == 0 and re.search(r"next|proximo|prox", day.group()):
            delta = 7
        date = (current + timedelta(days=delta)).date()
    if CLOCK.fullmatch(clock.group()):
        hour, minute = int(clock.group(1)), int(clock.group(2))
        period = clock.group(3)
    else:
        hour, minute, period = int(clock.group(1)), 0, clock.group(2)
    if period:
        if not 1 <= hour <= 12:
            raise ValueError("Invalid twelve-hour clock")
        hour = hour % 12 + (12 if period == "pm" else 0)
    value = datetime(date.year, date.month, date.day, hour, minute)
    return DeadlineEvidence(
        localize(value, zone), True, True, (day.span(), clock.span())
    )
