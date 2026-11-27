"""Add public lost item reports and private ownership claims."""

import sqlalchemy as sa
from alembic import op

revision = "k78a2b3c4d5e"
down_revision = "k17ab3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lost_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("reporter_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(100), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column("campus", sa.String(16), nullable=False),
        sa.Column("found_on", sa.Date(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
    )
    op.create_index("ix_lost_items_recent", "lost_items", ["found_on", "id"])
    op.create_index("ix_lost_items_reporter_id", "lost_items", ["reporter_id"])
    op.create_table(
        "lost_claims",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("lost_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("claimant_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proof", sa.Text(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("pickup", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("item_id", "claimant_id", name="uq_lost_claim_item_claimant"),
    )
    op.create_index("ix_lost_claims_claimant_id", "lost_claims", ["claimant_id"])


def downgrade() -> None:
    op.drop_table("lost_claims")
    op.drop_table("lost_items")
