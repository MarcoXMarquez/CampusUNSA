"""Add normalized origin column to classroom_courses table.

Revision ID: f9a0b1c2d3e4
Revises: e7f8a9b0c1d2
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "classroom_courses",
        sa.Column(
            "origin",
            sa.String(length=50),
            nullable=False,
            server_default="classroom",
        ),
    )
    op.execute(
        "UPDATE classroom_courses SET origin = 'moodle' "
        "WHERE classroom_course_id LIKE 'moodle-%'"
    )
    op.create_index(
        op.f("ix_classroom_courses_origin"),
        "classroom_courses",
        ["origin"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_classroom_courses_origin"), table_name="classroom_courses")
    op.drop_column("classroom_courses", "origin")
