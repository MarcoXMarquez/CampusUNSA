"""Update course_catalog official_name entries to accented Title Case.

Revision ID: f1a2b3c4d5e6
Revises: e1f2a3b4c5d6
Create Date: 2026-11-15 19:42:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.curriculum_catalog_data import CURRICULUM_CATALOG_ENTRIES

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e1f2a3b4c5d6"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    stmt = sa.text(
        "UPDATE course_catalog SET official_name = :official_name WHERE code = :code"
    )
    for entry in CURRICULUM_CATALOG_ENTRIES:
        bind.execute(
            stmt,
            {
                "code": entry["code"],
                "official_name": entry["official_name"],
            },
        )


def downgrade() -> None:
    bind = op.get_bind()
    stmt = sa.text(
        "UPDATE course_catalog SET official_name = normalized_name"
    )
    bind.execute(stmt)
