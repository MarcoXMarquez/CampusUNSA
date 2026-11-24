"""Secretarial tickets, append-only audit history, and resolution notices."""

import uuid
from datetime import datetime

from sqlalchemy import DDL, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, event, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')",
            name="ck_tickets_status",
        ),
        Index("ix_tickets_status_created_at", "status", "created_at"),
        UniqueConstraint("student_id", "request_id", name="uq_ticket_student_request"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    tracking_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    assigned_secretary_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    faculty: Mapped[str | None] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    resolution: Mapped[str | None] = mapped_column(Text)
    request_id: Mapped[uuid.UUID | None] = mapped_column()
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="OPEN", server_default="OPEN"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class TicketAuditEvent(Base):
    """Append-only transition history, ordered by a database-generated ordinal."""

    __tablename__ = "ticket_audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tickets.id"), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    from_status: Mapped[str | None] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TicketNotification(Base):
    """One durable resolution notice and outbound delivery job per resolved ticket."""

    __tablename__ = "ticket_notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tickets.id"), unique=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    tracking_code: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    whatsapp_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")

    __table_args__ = (
        Index("ix_ticket_notifications_pending", "whatsapp_sent_at", "next_attempt_at"),
    )


POSTGRES_AUDIT_FUNCTION = """
CREATE FUNCTION reject_ticket_audit_mutation() RETURNS trigger LANGUAGE plpgsql
AS $$ BEGIN RAISE EXCEPTION 'Ticket audit events are append-only'; END; $$
"""
POSTGRES_AUDIT_GUARD = """
CREATE TRIGGER ticket_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
ON ticket_audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_ticket_audit_mutation()
"""

# These hooks protect newly created test schemas. Deployed databases use the migration.
for statement in (POSTGRES_AUDIT_FUNCTION, POSTGRES_AUDIT_GUARD):
    event.listen(TicketAuditEvent.__table__, "after_create", DDL(statement).execute_if(dialect="postgresql"))

for mutation in ("UPDATE", "DELETE"):
    statement = (
        f"CREATE TRIGGER ticket_audit_no_{mutation.lower()} BEFORE {mutation} ON ticket_audit_events "
        "BEGIN SELECT RAISE(ABORT, 'Ticket audit events are append-only'); END"
    )
    event.listen(TicketAuditEvent.__table__, "after_create", DDL(statement).execute_if(dialect="sqlite"))
