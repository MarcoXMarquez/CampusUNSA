"""Add telegram_chat_id column to users table.

Revision ID: d1e2f3a4b5c6
Revises: c4d5e6f7a8b9
Create Date: 2026-11-15 18:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_users_telegram_chat_id",
        "users",
        ["telegram_chat_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_telegram_chat_id", "users", type_="unique")
    op.drop_column("users", "telegram_chat_id")
