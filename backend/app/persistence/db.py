"""Database engine and session utilities for PostgreSQL persistence."""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings


def build_engine() -> AsyncEngine:
    """Create one async engine so all repository operations share connection policy."""

    return create_async_engine(settings.database_url, pool_pre_ping=True)


engine = build_engine()
session_factory = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Provide one transactional session per request for repository consistency."""

    async with session_factory() as session:
        yield session
