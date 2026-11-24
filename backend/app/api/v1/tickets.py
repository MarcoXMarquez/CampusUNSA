"""Student escalation and scoped staff ticket management."""

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import has_role
from app.core.database import get_db
from app.core.permissions import Permission
from app.models.ticket import Ticket, TicketNotification
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate, TicketDetail, TicketNotificationResponse, TicketResponse,
    TicketRouting, TicketStatus, TicketTransition,
)
from app.services.ticket_lifecycle import (
    create_ticket, describe_ticket, get_routing, get_ticket, list_staff_queue, ticket_error,
    transition_ticket, visible_tickets, withdraw_ticket,
)

router = APIRouter()
Database = Annotated[Session, Depends(get_db)]
Student = Annotated[User, Depends(has_role(["student"]))]
Staff = Annotated[User, Depends(has_role(["secretary", "admin"], permissions=Permission.READ_ALL_TICKETS))]
Viewer = Annotated[User, Depends(has_role(["student", "secretary", "admin"]))]
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]


@router.get("/all", response_model=list[TicketResponse])
def list_active_tickets(
    current_user: Staff, db: Database, limit: Limit = 100, offset: Offset = 0,
    faculty: Annotated[str | None, Query(max_length=120)] = None,
    cui: Annotated[str | None, Query(max_length=20)] = None,
    status: TicketStatus | None = None,
) -> list[Ticket]:
    return list_staff_queue(
        db, current_user, faculty=faculty, cui=cui, status=status, limit=limit, offset=offset,
    )


@router.get("/mine", response_model=list[TicketResponse])
def list_student_tickets(
    current_user: Student, db: Database, limit: Limit = 100, offset: Offset = 0,
) -> list[Ticket]:
    rows = visible_tickets(current_user).order_by(Ticket.created_at.desc(), Ticket.id)
    return list(db.scalars(rows.limit(limit).offset(offset)))


@router.get("/routing", response_model=TicketRouting)
def get_ticket_routing(current_user: Student, db: Database) -> TicketRouting:
    return get_routing(db, current_user)


@router.post("", response_model=TicketDetail, status_code=201)
def escalate(payload: TicketCreate, current_user: Student, db: Database) -> TicketDetail:
    return create_ticket(db, current_user, payload)


@router.get("/notifications", response_model=list[TicketNotificationResponse])
def get_notifications(
    current_user: Student, db: Database, limit: Limit = 100, offset: Offset = 0,
) -> list[TicketNotification]:
    return list(db.scalars(
        select(TicketNotification)
        .where(TicketNotification.student_id == current_user.id, TicketNotification.read_at.is_(None))
        .order_by(TicketNotification.created_at.desc(), TicketNotification.id)
        .limit(limit).offset(offset)
    ))


@router.patch("/notifications/{notice_id}/read", status_code=204)
def acknowledge_notification(notice_id: UUID, current_user: Student, db: Database) -> Response:
    notice = db.scalar(select(TicketNotification).where(
        TicketNotification.id == notice_id, TicketNotification.student_id == current_user.id
    ).with_for_update())
    if notice is None:
        raise ticket_error(404, "TICKET_NOTICE_NOT_FOUND", "Ticket notice not found.")
    if notice.read_at is None:
        notice.read_at = datetime.now(timezone.utc)
        db.commit()
    return Response(status_code=204)


@router.get("/{ticket_id}", response_model=TicketDetail)
def read_ticket(ticket_id: UUID, current_user: Viewer, db: Database) -> TicketDetail:
    return describe_ticket(db, get_ticket(db, current_user, ticket_id))


@router.patch("/{ticket_id}", response_model=TicketDetail)
def update_ticket(ticket_id: UUID, payload: TicketTransition, current_user: Staff, db: Database) -> TicketDetail:
    return transition_ticket(db, current_user, ticket_id, payload)


@router.delete("/{ticket_id}", status_code=204)
def close_request(ticket_id: UUID, current_user: Student, db: Database) -> Response:
    withdraw_ticket(db, current_user, ticket_id)
    return Response(status_code=204)
