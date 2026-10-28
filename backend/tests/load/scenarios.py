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
    Scenario("GET", "/api/v1/auth/me"),
    Scenario("GET", "/api/v1/tickets/all", role="secretary"),
    Scenario("GET", "/api/v1/tickets/all", expected=403, suffix=" [student denied]"),
    Scenario("GET", "/api/v1/classroom/courses"),
    Scenario("GET", "/api/v1/classroom/assignments"),
    Scenario("POST", "/api/v1/classroom/sync"),
    Scenario("GET", "/api/v1/dutic/courses"),
    Scenario("GET", "/api/v1/dutic/assignments"),
    Scenario("POST", "/api/v1/dutic/sync"),
)


def scenarios_for(include_task_parser: bool) -> tuple[Scenario, ...]:
    if include_task_parser:
        return BASE_SCENARIOS + (Scenario("POST", "/api/v1/nlp/parse-task"),)
    return BASE_SCENARIOS


# US-10 is an independent PR; keep this registry compatible with either merge order.
SCENARIOS = scenarios_for(
    (Path(__file__).resolve().parents[2] / "app/api/v1/nlp.py").is_file()
)
