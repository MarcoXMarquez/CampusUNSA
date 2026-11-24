"""Ticket ownership, faculty scoping, lifecycle, and atomic audit writes."""

from collections.abc import Iterable
from datetime import datetime, timezone
from secrets import choice
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.models.ticket import Ticket, TicketAuditEvent, TicketNotification
from app.models.user import User, UserProfile
from app.schemas.ticket import (
    TicketAuditResponse, TicketCreate, TicketDetail, TicketRouting, TicketStatus, TicketTransition,
)

NEXT_STATUS = {"OPEN": "IN_REVIEW", "IN_REVIEW": "RESOLVED", "RESOLVED": "CLOSED"}
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
LIMA = ZoneInfo("America/Lima")


def ticket_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status, detail={"code": code, "message": message})


def profile_faculty(user: User) -> str | None:
    faculty = user.profile.faculty.strip() if user.profile and user.profile.faculty else ""
    return faculty or None


def visible_tickets(actor: User) -> Select[tuple[Ticket]]:
    """Restrict ticket access before applying any client-supplied filters."""
    statement = select(Ticket)
    if actor.role == "admin":
        return statement
    if actor.role == "student":
        return statement.where(Ticket.student_id == actor.id)
    faculty = profile_faculty(actor)
    if actor.role != "secretary" or not faculty:
        return statement.where(False)
    legacy_faculty = select(UserProfile.faculty).where(
        UserProfile.user_id == Ticket.student_id
    ).scalar_subquery()
    return statement.where(func.lower(func.trim(func.coalesce(Ticket.faculty, legacy_faculty))) == faculty.lower())


def list_staff_queue(
    db: Session, actor: User, *, faculty: str | None, cui: str | None,
    status: TicketStatus | None, limit: int, offset: int,
) -> list[Ticket]:
    statement = visible_tickets(actor)
    if status:
        statement = statement.where(Ticket.status == status)
    else:
        statement = statement.where(Ticket.status.in_(("OPEN", "IN_REVIEW")))
    if faculty:
        legacy_faculty = select(UserProfile.faculty).where(
            UserProfile.user_id == Ticket.student_id
        ).scalar_subquery()
        statement = statement.where(
            func.lower(func.trim(func.coalesce(Ticket.faculty, legacy_faculty))) == faculty.strip().lower()
        )
    if cui:
        statement = statement.where(Ticket.student_id.in_(select(User.id).where(User.cui == cui.strip())))
    return list(db.scalars(statement.order_by(Ticket.created_at, Ticket.id).limit(limit).offset(offset)))


def get_ticket(db: Session, actor: User, ticket_id: UUID, *, lock: bool = False) -> Ticket:
    statement = visible_tickets(actor).where(Ticket.id == ticket_id)
    if lock:
        statement = statement.with_for_update(of=Ticket)
    ticket = db.scalar(statement)
    if ticket is None:
        raise ticket_error(404, "TICKET_NOT_FOUND", "Ticket not found.")
    return ticket


def get_routing(db: Session, student: User) -> TicketRouting:
    faculty = profile_faculty(student)
    if faculty:
        return TicketRouting(faculty=faculty, alternatives=[])
    names = db.scalars(
        select(UserProfile.faculty)
        .join(User, User.id == UserProfile.user_id)
        .where(User.role == "secretary", User.is_active.is_(True), UserProfile.faculty.is_not(None))
        .distinct()
        .order_by(UserProfile.faculty)
    )
    alternatives = {name.strip().lower(): name.strip() for name in names if name and name.strip()}
    return TicketRouting(faculty=None, alternatives=sorted(alternatives.values(), key=str.casefold))


def describe_ticket(db: Session, ticket: Ticket) -> TicketDetail:
    events = db.scalars(select(TicketAuditEvent).where(
        TicketAuditEvent.ticket_id == ticket.id
    ).order_by(TicketAuditEvent.id))
    return with_audit(ticket, events)


def with_audit(ticket: Ticket, events: Iterable[TicketAuditEvent]) -> TicketDetail:
    return TicketDetail.model_validate(ticket).model_copy(update={
        "audit": [TicketAuditResponse.model_validate(event) for event in events],
    })


def record_transition(db: Session, ticket: Ticket, actor: User, previous: str | None) -> TicketAuditEvent:
    event = TicketAuditEvent(
        ticket_id=ticket.id, actor_id=actor.id, from_status=previous, to_status=ticket.status,
    )
    db.add(event)
    return event


def create_ticket(db: Session, student: User, payload: TicketCreate) -> TicketDetail:
    by_request = select(Ticket).where(
        Ticket.student_id == student.id, Ticket.request_id == payload.request_id,
    )
    existing = db.scalar(by_request)
    if existing is not None:
        return describe_ticket(db, existing)

    routing = get_routing(db, student)
    faculty = routing.faculty
    if faculty is None and payload.faculty:
        faculty = next((name for name in routing.alternatives if name.lower() == payload.faculty.lower()), None)
    if faculty is None:
        raise ticket_error(422, "TICKET_FACULTY_REQUIRED", "Select an available faculty.")
    if payload.faculty and payload.faculty.lower() != faculty.lower():
        raise ticket_error(422, "TICKET_FACULTY_MISMATCH", "The requested faculty is unavailable for this account.")

    year = datetime.now(LIMA).year
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else postgres_insert
    for _ in range(8):
        code = f"TICK-{year}-" + "".join(choice(CODE_ALPHABET) for _ in range(4))
        ticket = db.scalar(insert(Ticket).values(
            student_id=student.id, request_id=payload.request_id, tracking_code=code,
            category=payload.category, subject=payload.subject, description=payload.description,
            status="OPEN", faculty=faculty,
        ).on_conflict_do_nothing().returning(Ticket))
        if ticket is None:
            # A concurrent submission may have claimed the request key or the code.
            existing = db.scalar(by_request)
            if existing is not None:
                return describe_ticket(db, existing)
            continue
        event = record_transition(db, ticket, student, None)
        db.flush()
        detail = with_audit(ticket, [event])
        db.commit()
        return detail
    raise ticket_error(503, "TICKET_CODE_UNAVAILABLE", "Could not allocate a ticket code. Retry the request.")


def transition_ticket(db: Session, staff: User, ticket_id: UUID, change: TicketTransition) -> TicketDetail:
    ticket = get_ticket(db, staff, ticket_id, lock=True)
    previous = ticket.status
    if NEXT_STATUS.get(previous) != change.status:
        raise ticket_error(409, "TICKET_INVALID_TRANSITION", "This ticket status transition is not allowed.")
    ticket.status = change.status
    if change.status == "IN_REVIEW":
        ticket.assigned_secretary_id = staff.id
    elif change.status == "RESOLVED":
        ticket.resolved_at = datetime.now(timezone.utc)
        ticket.resolution = change.resolution
        db.add(TicketNotification(
            ticket_id=ticket.id, student_id=ticket.student_id, tracking_code=ticket.tracking_code,
        ))
    record_transition(db, ticket, staff, previous)
    db.flush()
    detail = describe_ticket(db, ticket)
    db.commit()
    return detail


def withdraw_ticket(db: Session, student: User, ticket_id: UUID) -> None:
    ticket = get_ticket(db, student, ticket_id, lock=True)
    if ticket.status == "CLOSED" and ticket.resolved_at is None:
        return
    if ticket.status != "OPEN":
        raise ticket_error(409, "TICKET_CANNOT_WITHDRAW", "Only a ticket awaiting review can be withdrawn.")
    ticket.status = "CLOSED"
    record_transition(db, ticket, student, "OPEN")
    db.commit()
