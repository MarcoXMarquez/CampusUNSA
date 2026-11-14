"""Add optional pavilion column to course_schedule_blocks.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-11-14 16:50:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "course_schedule_blocks",
        sa.Column("pavilion", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("course_schedule_blocks", "pavilion")
