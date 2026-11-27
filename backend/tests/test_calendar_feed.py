from datetime import date, datetime, timezone
from uuid import UUID

from app.schemas.academic import WeeklyScheduleSessionResponse
from app.services.academic.calendar_feed import build_calendar, feed_digest


def test_calendar_uses_lima_time_stable_ids_and_safe_text() -> None:
    slot = WeeklyScheduleSessionResponse(
        id=UUID(int=1), course_code="SO", course_name="Sistemas; Operativos\nX-BAD: true",
        term="2026B", component_type="TEORIA", group_code="A", day_of_week=1,
        start_time="08:30", end_time="10:00", room="Aula, 2", pavilion="Pabellón",
    )
    result = build_calendar(
        [slot, slot], date(2026, 11, 25), date(2026, 12, 7),
        datetime(2026, 11, 25, tzinfo=timezone.utc),
    )
    assert "DTSTART:20261130T133000Z\r\n" in result
    assert "DTEND:20261130T150000Z\r\n" in result
    assert "RRULE:FREQ=WEEKLY;UNTIL=20261207T133000Z\r\n" in result
    assert result.count("BEGIN:VEVENT") == 1
    assert "SUMMARY:Sistemas\\; Operativos\\nX-BAD: true" in result
    assert "\r\nX-BAD:" not in result
    assert "LOCATION:Pabellón\\, Aula\\, 2" in result
    assert all(len(line.encode()) <= 75 for line in result.split("\r\n"))
    assert result.endswith("\r\n")


def test_digest_does_not_keep_token_in_storage() -> None:
    assert feed_digest("secret") != "secret"
    assert feed_digest("secret") == feed_digest("secret")
    assert len(feed_digest("secret")) == 64


def test_access_logs_redact_feed_credentials() -> None:
    import logging

    from app.core.private_calendar_logs import PrivateCalendarAccessFilter

    record = logging.LogRecord(
        "uvicorn.access", logging.INFO, __file__, 0, "%s %s %s %s %s",
        ("local", "GET", "/api/v1/courses/calendar/example-secret.ics", "HTTP", 200),
        None,
    )
    assert PrivateCalendarAccessFilter().filter(record)
    assert "[redacted].ics" in record.getMessage()
    assert "example-secret" not in record.getMessage()
