"""SQLAlchemy models used by LoreForge story persistence."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, Text, func
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


class User(Base):
    """Registered LoreForge user authenticated via Google OAuth."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(Text, nullable=False)
    google_id: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_users_email", "email", unique=True),
        Index("ix_users_google_id", "google_id", unique=True),
    )


class GenerationRequest(Base):
    """Append-only log of story generation attempts used for per-user rate limiting."""

    __tablename__ = "generation_requests"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_generation_requests_user_id_requested_at", "user_id", "requested_at"),
    )
