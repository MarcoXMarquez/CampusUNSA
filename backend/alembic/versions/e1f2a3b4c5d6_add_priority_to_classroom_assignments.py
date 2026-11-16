"""Add optional priority column to classroom_assignments table.

Revision ID: e1f2a3b4c5d6
Revises: d1e2f3a4b5c6
Create Date: 2026-11-15 19:25:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "classroom_assignments",
        sa.Column("priority", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("classroom_assignments", "priority")
