"""Staff-only read access to the active secretarial ticket queue."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import has_role
from app.core.database import get_db
from app.core.permissions import Permission
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.ticket import TicketResponse

router = APIRouter()


@router.get("/all", response_model=list[TicketResponse])
def list_active_tickets(
    current_user: User = Depends(
        has_role(["secretary", "admin"], permissions=Permission.READ_ALL_TICKETS)
    ),
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> list[TicketResponse]:
    """List OPEN/IN_REVIEW tickets, oldest first, after staff authorization."""
    statement = (
        select(Ticket)
        .where(Ticket.status.in_(("OPEN", "IN_REVIEW")))
        .order_by(Ticket.created_at, Ticket.id)
        .limit(limit)
        .offset(offset)
    )
    return [TicketResponse.model_validate(ticket) for ticket in db.scalars(statement)]
