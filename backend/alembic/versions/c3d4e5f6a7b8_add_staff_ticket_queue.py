"""Add the read-only staff ticket queue required by US-03.

Revision ID: c3d4e5f6a7b8
Revises: b8aa7a68c948
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b8aa7a68c948"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tickets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tracking_code", sa.String(32), nullable=False),
        sa.Column("student_id", sa.Uuid(), nullable=False),
        sa.Column("assigned_secretary_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED')",
            name="ck_tickets_status",
        ),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["assigned_secretary_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tracking_code"),
    )
    op.create_index("ix_tickets_student_id", "tickets", ["student_id"])
    op.create_index("ix_tickets_status_created_at", "tickets", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_tickets_status_created_at", table_name="tickets")
    op.drop_index("ix_tickets_student_id", table_name="tickets")
    op.drop_table("tickets")
