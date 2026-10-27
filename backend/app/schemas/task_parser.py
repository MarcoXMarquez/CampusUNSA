"""Bounded task extraction contracts; returned deadlines use explicit UTC."""

import re
from datetime import datetime, timezone
from typing import Annotated, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Title = Annotated[
    str,
    StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=200),
]
CourseName = Annotated[
    str,
    StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=120),
]


class ParseTaskRequest(BaseModel):
    message: Annotated[
        str,
        StringConstraints(
            strict=True, strip_whitespace=True, min_length=1, max_length=2000
        ),
    ]
    reference_time: AwareDatetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    timezone: str = "UTC"
    courses: list[CourseName] = Field(default_factory=list, max_length=50)
    model_config = ConfigDict(extra="forbid")

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise ValueError("Use a valid IANA time zone") from error
        return value


class TaskDraft(BaseModel):
    title: Title | None
    course: CourseName | None
    due_date: AwareDatetime | None
    model_config = ConfigDict(extra="forbid")

    @field_validator("due_date", mode="before")
    @classmethod
    def reject_numeric_dates(cls, value: object) -> object:
        if isinstance(value, str) and not re.match(r"^\d{4}-\d{2}-\d{2}[Tt ]", value):
            raise ValueError("Use an ISO date and time with an explicit offset")
        if value is not None and not isinstance(value, (str, datetime)):
            raise ValueError(
                "Deadline must be an ISO timestamp with an explicit offset"
            )
        return value

    @field_validator("due_date")
    @classmethod
    def normalize_utc(cls, value: datetime | None) -> datetime | None:
        return value.astimezone(timezone.utc) if value else None


class ParseTaskResponse(BaseModel):
    status: Literal["parsed", "needs_clarification"]
    task: TaskDraft
    clarification: str | None
    source: Literal["ollama", "gemini", "fallback"]
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_result(self) -> "ParseTaskResponse":
        if self.status == "parsed" and (
            not self.task.title or not self.task.due_date or self.clarification
        ):
            raise ValueError(
                "A parsed task needs a title and deadline, without a clarification"
            )
        if self.status == "needs_clarification" and not self.clarification:
            raise ValueError("An incomplete task needs a clarification question")
        return self
