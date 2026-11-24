"""Preserve the course reported in a WhatsApp task without inventing an enrollment."""

from alembic import op
import sqlalchemy as sa

revision: str = "h1a2b3c4d5e6"
down_revision: str | None = "g1a2b3c4d5e6"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("classroom_assignments", sa.Column("reported_course", sa.String(120)))


def downgrade() -> None:
    op.drop_column("classroom_assignments", "reported_course")
