"""Explicit business-route registry; additions must pass the OpenAPI inventory test."""

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Scenario:
    method: str
    path: str
    role: str = "student"
    expected: int = 200
    suffix: str = ""

    @property
    def name(self) -> str:
        return f"{self.method} {self.path}{self.suffix}"


BASE_SCENARIOS = (
    Scenario("GET", "/"),
    Scenario("GET", "/api/v1/health"),
    Scenario("POST", "/api/v1/auth/google"),
    Scenario("POST", "/api/v1/auth/login"),
    Scenario("GET", "/api/v1/auth/me"),
    Scenario("POST", "/api/v1/webhooks/whatsapp"),
    Scenario("POST", "/api/v1/webhooks/whatsapp", expected=401, suffix=" [unauthenticated]"),
    Scenario("GET", "/api/v1/tickets/all", role="secretary"),
    Scenario("GET", "/api/v1/tickets/all", expected=403, suffix=" [student denied]"),
    Scenario("GET", "/api/v1/classroom/courses"),
    Scenario("GET", "/api/v1/classroom/assignments"),
    Scenario("PATCH", "/api/v1/classroom/assignments/{assignment_id}/completion", role="completion"),
    Scenario("POST", "/api/v1/classroom/sync"),
    Scenario("GET", "/api/v1/auth/google/classroom/status"),
    Scenario("POST", "/api/v1/auth/google/classroom/callback"),
    Scenario("GET", "/api/v1/dutic/courses"),
    Scenario("GET", "/api/v1/dutic/assignments"),
    Scenario("POST", "/api/v1/dutic/sync"),
    Scenario("DELETE", "/api/v1/classroom/assignments"),
    Scenario("DELETE", "/api/v1/classroom/courses"),
    Scenario("GET", "/api/v1/dutic/ical/status"),
    Scenario("POST", "/api/v1/dutic/ical/subscribe"),
    Scenario("POST", "/api/v1/dutic/ical/sync"),
    Scenario("GET", "/api/v1/courses/catalog"),
    Scenario("GET", "/api/v1/courses/enrolled"),
    Scenario("GET", "/api/v1/courses/pending-links"),
    Scenario("POST", "/api/v1/courses/sources/{source_id}/link", role="completion"),
    Scenario("PATCH", "/api/v1/courses/enrolled/{course_code}/groups", role="completion"),
    Scenario("GET", "/api/v1/courses/enrolled/{course_code}/schedule", role="completion"),
    Scenario("PUT", "/api/v1/courses/enrolled/{course_code}/schedule", role="completion"),
    Scenario("GET", "/api/v1/courses/schedule/next-class"),
    Scenario("GET", "/api/v1/courses/schedule/weekly"),
    Scenario("GET", "/api/v1/courses/assignments"),
    Scenario("POST", "/api/v1/courses/assignments", role="completion", expected=201),
    Scenario("POST", "/api/v1/auth/otp/generate"),
    Scenario("POST", "/api/v1/auth/otp/verify", expected=400),
    Scenario("GET", "/api/v1/auth/otp/status"),
    Scenario("DELETE", "/api/v1/auth/otp/link/{channel}"),
)


def scenarios_for(include_task_parser: bool) -> tuple[Scenario, ...]:
    if include_task_parser:
        return BASE_SCENARIOS + (Scenario("POST", "/api/v1/nlp/parse-task"),)
    return BASE_SCENARIOS


# US-10 is an independent PR; keep this registry compatible with either merge order.
SCENARIOS = scenarios_for(
    (Path(__file__).resolve().parents[2] / "app/api/v1/nlp.py").is_file()
)
