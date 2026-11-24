"""Add scoped secretarial ticket lifecycle, audit history, and resolution outbox."""

from alembic import op
import sqlalchemy as sa

revision: str = "i13a2b3c4d5e"
down_revision: str | None = "g1a2b3c4d5e6"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("tickets", sa.Column("faculty", sa.String(120)))
    op.add_column("tickets", sa.Column("description", sa.Text(), server_default="", nullable=False))
    op.add_column("tickets", sa.Column("resolution", sa.Text()))
    op.add_column("tickets", sa.Column("request_id", sa.Uuid()))
    op.create_unique_constraint("uq_ticket_student_request", "tickets", ["student_id", "request_id"])
    op.create_table(
        "ticket_audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("ticket_id", sa.Uuid(), sa.ForeignKey("tickets.id"), nullable=False),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("from_status", sa.String(20)),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ticket_audit_events_ticket_id", "ticket_audit_events", ["ticket_id"])
    op.execute("""
        CREATE FUNCTION reject_ticket_audit_mutation() RETURNS trigger LANGUAGE plpgsql
        AS $$ BEGIN RAISE EXCEPTION 'Ticket audit events are append-only'; END; $$
    """)
    op.execute("""
        CREATE TRIGGER ticket_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
        ON ticket_audit_events FOR EACH STATEMENT EXECUTE FUNCTION reject_ticket_audit_mutation()
    """)
    op.create_table(
        "ticket_notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("ticket_id", sa.Uuid(), sa.ForeignKey("tickets.id"), nullable=False, unique=True),
        sa.Column("student_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tracking_code", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("whatsapp_sent_at", sa.DateTime(timezone=True)),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_ticket_notifications_student_id", "ticket_notifications", ["student_id"])
    op.create_index(
        "ix_ticket_notifications_pending", "ticket_notifications", ["whatsapp_sent_at", "next_attempt_at"]
    )


def downgrade() -> None:
    op.drop_table("ticket_notifications")
    op.drop_table("ticket_audit_events")
    op.execute("DROP FUNCTION reject_ticket_audit_mutation()")
    op.drop_constraint("uq_ticket_student_request", "tickets", type_="unique")
    for column in ("request_id", "resolution", "description", "faculty"):
        op.drop_column("tickets", column)
