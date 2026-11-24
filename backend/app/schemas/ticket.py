"""Request and response contracts for secretarial tickets."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, StringConstraints, StrictBool, Field, model_validator

TicketStatus = Literal["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]
Faculty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Subject = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=255)]
Narrative = Annotated[str, StringConstraints(strip_whitespace=True, min_length=4, max_length=4000)]
Category = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]


class TicketCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject: Subject
    description: Narrative
    confirmed: StrictBool
    request_id: UUID
    category: Category = "Administration"
    faculty: Faculty | None = None

    @model_validator(mode="after")
    def check_confirmation(self) -> "TicketCreate":
        if not self.confirmed:
            raise ValueError("Explicit confirmation is required to escalate a query")
        return self


class TicketTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: TicketStatus
    resolution: Narrative | None = None

    @model_validator(mode="after")
    def check_resolution(self) -> "TicketTransition":
        if (self.status == "RESOLVED") != (self.resolution is not None):
            raise ValueError("A written resolution is required only for the RESOLVED transition")
        return self


class TicketResponse(BaseModel):
    id: UUID
    tracking_code: str
    student_id: UUID
    assigned_secretary_id: UUID | None
    category: str
    subject: str
    status: TicketStatus
    created_at: datetime
    resolved_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class TicketAuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_status: TicketStatus | None
    to_status: TicketStatus
    created_at: datetime


class TicketDetail(TicketResponse):
    faculty: str | None
    description: str
    resolution: str | None
    audit: list[TicketAuditResponse] = Field(default_factory=list)


class TicketRouting(BaseModel):
    faculty: str | None
    alternatives: list[str]


class TicketNotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    ticket_id: UUID
    tracking_code: str
    created_at: datetime
    read_at: datetime | None
