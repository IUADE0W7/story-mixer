"""Sliding-window rate limit check and record — no transaction management, no HTTP concerns."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models import GenerationRequest, User


async def check_rate_limit_and_record(
    db: AsyncSession,
    user_id: str,
    limit: int,
) -> datetime | Literal[False] | None:
    """Check the sliding window and conditionally insert a generation_requests row.

    Assumes the caller has already begun a transaction with SELECT FOR UPDATE on the
    user row (or is about to acquire the lock as the first operation here).

    Returns:
        None          — under limit; row inserted.
        datetime      — at/over limit; retry_after = earliest_in_window + 1h; no insert.
        False         — user row not found (caller should raise 401).
    """
    result = await db.execute(
        select(User).where(User.id == user_id).with_for_update()
    )
    if result.scalar_one_or_none() is None:
        return False

    window_start = datetime.now(timezone.utc) - timedelta(hours=1)

    count = (
        await db.execute(
            select(func.count())
            .select_from(GenerationRequest)
            .where(GenerationRequest.user_id == user_id)
            .where(GenerationRequest.requested_at > window_start)
        )
    ).scalar_one()

    if count >= limit:
        earliest_at = (
            await db.execute(
                select(GenerationRequest.requested_at)
                .where(GenerationRequest.user_id == user_id)
                .where(GenerationRequest.requested_at > window_start)
                .order_by(GenerationRequest.requested_at.asc())
                .limit(1)
            )
        ).scalar_one()
        return earliest_at + timedelta(hours=1)

    db.add(
        GenerationRequest(
            id=str(uuid.uuid4()),
            user_id=user_id,
            requested_at=datetime.now(timezone.utc),
        )
    )
    return None
