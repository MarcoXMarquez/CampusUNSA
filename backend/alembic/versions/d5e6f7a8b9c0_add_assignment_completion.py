"""Add student-managed assignment completion for US-05.

Revision ID: d5e6f7a8b9c0
Revises: f33782ec2f36
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "f33782ec2f36"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "classroom_assignments",
        sa.Column("is_completed", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("classroom_assignments", "is_completed")
