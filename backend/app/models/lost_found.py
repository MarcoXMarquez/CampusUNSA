"""Public reports and participant-only ownership claims."""

from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LostItem(Base):
    __tablename__ = "lost_items"
    __table_args__ = (
        Index("ix_lost_items_recent", "found_on", "id"),
        Index("ix_lost_items_reporter_id", "reporter_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    reporter_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(String(500))
    location: Mapped[str] = mapped_column(String(160))
    campus: Mapped[str] = mapped_column(String(16))
    found_on: Mapped[date]
    status: Mapped[str] = mapped_column(String(12), default="open")


class LostClaim(Base):
    __tablename__ = "lost_claims"
    __table_args__ = (
        UniqueConstraint("item_id", "claimant_id", name="uq_lost_claim_item_claimant"),
        Index("ix_lost_claims_claimant_id", "claimant_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    item_id: Mapped[UUID] = mapped_column(ForeignKey("lost_items.id", ondelete="CASCADE"))
    claimant_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    proof: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="pending")
    pickup: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
