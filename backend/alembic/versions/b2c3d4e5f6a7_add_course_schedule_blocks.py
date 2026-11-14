"""Add shared course_schedule_blocks table for Teoria and Laboratorio slots.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-14 16:05:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "course_schedule_blocks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("course_code", sa.String(length=20), nullable=False),
        sa.Column("term", sa.String(length=20), server_default="2026B", nullable=False),
        sa.Column("component_type", sa.String(length=20), nullable=False),
        sa.Column("group_code", sa.String(length=5), nullable=False),
        sa.Column("day_of_week", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("room", sa.String(length=120), nullable=True),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["course_code"],
            ["course_catalog.code"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "course_code",
            "term",
            "component_type",
            "group_code",
            "day_of_week",
            "start_time",
            name="uq_course_schedule_block_slot",
        ),
    )
    op.create_index(
        "idx_course_schedule_lookup",
        "course_schedule_blocks",
        ["course_code", "term", "component_type", "group_code"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_schedule_blocks_course_code"),
        "course_schedule_blocks",
        ["course_code"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_schedule_blocks_id"),
        "course_schedule_blocks",
        ["id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_course_schedule_blocks_term"),
        "course_schedule_blocks",
        ["term"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_course_schedule_blocks_term"), table_name="course_schedule_blocks")
    op.drop_index(op.f("ix_course_schedule_blocks_id"), table_name="course_schedule_blocks")
    op.drop_index(op.f("ix_course_schedule_blocks_course_code"), table_name="course_schedule_blocks")
    op.drop_index("idx_course_schedule_lookup", table_name="course_schedule_blocks")
    op.drop_table("course_schedule_blocks")
