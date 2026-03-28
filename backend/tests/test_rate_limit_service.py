"""Unit tests for rate_limit_service sliding window logic."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret")

from app.services.rate_limit_service import check_rate_limit_and_record


def _make_session(user_found: bool, count: int, earliest: datetime | None = None, limit: int = 10) -> AsyncMock:
    """Build a mock AsyncSession for given scenario."""
    session = AsyncMock()
    session.add = MagicMock()

    # First execute: SELECT FOR UPDATE → user row
    user_row = MagicMock() if user_found else None
    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = user_row

    # Second execute: COUNT
    count_result = MagicMock()
    count_result.scalar_one.return_value = count

    side_effects = [user_result, count_result]

    if count >= limit and earliest is not None:
        # Third execute: SELECT MIN(requested_at)
        earliest_result = MagicMock()
        earliest_result.scalar_one_or_none.return_value = earliest
        side_effects.append(earliest_result)

    session.execute.side_effect = side_effects
    return session


@pytest.mark.asyncio
async def test_under_limit_inserts_row() -> None:
    session = _make_session(user_found=True, count=5)
    result = await check_rate_limit_and_record(session, "user-123", limit=10)
    assert result is None
    session.add.assert_called_once()


@pytest.mark.asyncio
async def test_at_limit_returns_retry_after_and_does_not_insert() -> None:
    earliest = datetime(2026, 3, 19, 14, 32, tzinfo=timezone.utc)
    session = _make_session(user_found=True, count=10, earliest=earliest, limit=10)
    result = await check_rate_limit_and_record(session, "user-123", limit=10)
    expected_retry_after = earliest + timedelta(hours=1)
    assert result == expected_retry_after
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_user_not_found_returns_sentinel() -> None:
    session = _make_session(user_found=False, count=0)
    result = await check_rate_limit_and_record(session, "missing-user", limit=10)
    # Sentinel value signals caller to raise 401
    assert result is False
