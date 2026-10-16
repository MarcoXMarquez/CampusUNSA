"""Public staff queue response, with no authentication or profile secrets."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class TicketResponse(BaseModel):
    id: uuid.UUID
    tracking_code: str
    student_id: uuid.UUID
    assigned_secretary_id: uuid.UUID | None
    category: str
    subject: str
    status: Literal["OPEN", "IN_REVIEW", "RESOLVED", "CLOSED"]
    created_at: datetime
    resolved_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
