"""Published regulations and page-bound, searchable article chunks."""

from datetime import datetime
from uuid import UUID, uuid4

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.services.regulations import EMBEDDING_DIMENSIONS


class OfficialRegulation(Base):
    __tablename__ = "official_regulations"

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    resolution: Mapped[str] = mapped_column(String(11), unique=True)
    title: Mapped[str] = mapped_column(String(180))
    category: Mapped[str] = mapped_column(String(24))
    source_url: Mapped[str] = mapped_column(String(1000))
    checksum: Mapped[str] = mapped_column(String(64))
    embedding_model: Mapped[str] = mapped_column(String(160))
    active: Mapped[bool] = mapped_column(Boolean, default=False)
    page_count: Mapped[int]
    article_count: Mapped[int]
    published_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RegulationArticle(Base):
    __tablename__ = "regulation_articles"
    __table_args__ = (UniqueConstraint("regulation_id", "ordinal", name="uq_regulation_article_order"),)

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    regulation_id: Mapped[UUID] = mapped_column(ForeignKey("official_regulations.id", ondelete="CASCADE"))
    ordinal: Mapped[int]
    number: Mapped[str] = mapped_column(String(12))
    page: Mapped[int]
    content: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(VECTOR(EMBEDDING_DIMENSIONS))
