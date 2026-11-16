"""Support nullable source_id and explicit component_type on classroom_assignments for manual tasks.

Revision ID: g1a2b3c4d5e6
Revises: f1a2b3c4d5e6
Create Date: 2026-11-15 20:05:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "g1a2b3c4d5e6"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "classroom_assignments",
        sa.Column("component_type", sa.String(length=20), nullable=True),
    )
    op.alter_column(
        "classroom_assignments",
        "source_id",
        existing_type=sa.UUID(),
        nullable=True,
    )
    op.drop_constraint(
        "classroom_assignments_source_id_fkey",
        "classroom_assignments",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "classroom_assignments_source_id_fkey",
        "classroom_assignments",
        "course_external_sources",
        ["source_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM classroom_assignments WHERE source_id IS NULL"))
    op.drop_constraint(
        "classroom_assignments_source_id_fkey",
        "classroom_assignments",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "classroom_assignments_source_id_fkey",
        "classroom_assignments",
        "course_external_sources",
        ["source_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "classroom_assignments",
        "source_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
    op.drop_column("classroom_assignments", "component_type")
