"""Add a revocable academic calendar subscription to the user."""

from alembic import op
import sqlalchemy as sa

revision = "k17ab3c4d5e6"
down_revision = "j67a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("calendar_feed_hash", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("calendar_feed_start", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("calendar_feed_end", sa.Date(), nullable=True))
    op.create_unique_constraint("uq_users_calendar_feed_hash", "users", ["calendar_feed_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_users_calendar_feed_hash", "users", type_="unique")
    op.drop_column("users", "calendar_feed_end")
    op.drop_column("users", "calendar_feed_start")
    op.drop_column("users", "calendar_feed_hash")
