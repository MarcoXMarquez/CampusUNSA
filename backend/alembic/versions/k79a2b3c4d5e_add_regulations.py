"""Add official regulations and pgvector-backed article evidence."""

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import VECTOR

revision = "k79a2b3c4d5e"
down_revision = "k78a2b3c4d5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "official_regulations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("resolution", sa.String(11), unique=True, nullable=False),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("source_url", sa.String(1000), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("embedding_model", sa.String(160), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("article_count", sa.Integer(), nullable=False),
        sa.Column("published_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "regulation_articles",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("regulation_id", sa.Uuid(), sa.ForeignKey("official_regulations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("number", sa.String(12), nullable=False),
        sa.Column("page", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", VECTOR(768), nullable=False),
        sa.UniqueConstraint("regulation_id", "ordinal", name="uq_regulation_article_order"),
    )


def downgrade() -> None:
    op.drop_table("regulation_articles")
    op.drop_table("official_regulations")
