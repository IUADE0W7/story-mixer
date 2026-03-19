"""SQLAlchemy models used by LoreForge story persistence."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Declarative base so all ORM models share metadata consistently."""


class StoryRecord(Base):
    """Persist generated stories with vibe and judge metadata for replay and auditing."""

    __tablename__ = "stories"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    public_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    vibe_profile: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    normalized_vibe: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    judge_report: Mapped[dict[str, object]] = mapped_column(JSONB, nullable=False)
    revision_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    low_confidence: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
