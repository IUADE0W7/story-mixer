"""Integration tests for POST /api/v1/auth/google endpoint and rate limiting (require real DB)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models import GenerationRequest, User
from app.services.auth_service import issue_token

pytestmark = pytest.mark.integration

VALID_PAYLOAD = {
    "sub": "google-uid-001",
    "email": "alice@gmail.com",
    "email_verified": True,
    "name": "Alice Test",
    "picture": "https://example.com/alice.jpg",
}


# ── POST /api/v1/auth/google ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_google_login_returns_200_with_token(client: AsyncClient) -> None:
    with patch(
        "app.api.v1.auth.verify_google_credential",
        new=AsyncMock(return_value=VALID_PAYLOAD),
    ):
        resp = await client.post("/api/v1/auth/google", json={"credential": "fake"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_google_login_creates_new_user(client: AsyncClient, db_session: AsyncSession) -> None:
    from sqlalchemy import select

    payload = {**VALID_PAYLOAD, "sub": "google-uid-new", "email": "newuser@gmail.com"}
    with patch(
        "app.api.v1.auth.verify_google_credential",
        new=AsyncMock(return_value=payload),
    ):
        resp = await client.post("/api/v1/auth/google", json={"credential": "fake"})
    assert resp.status_code == 200

    result = await db_session.execute(select(User).where(User.google_id == "google-uid-new"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.email == "newuser@gmail.com"
    assert user.display_name == "Alice Test"


@pytest.mark.asyncio
async def test_google_login_upserts_existing_user(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """Second login with the same google_id updates profile but keeps the same user id."""
    from sqlalchemy import select

    sub = "google-uid-upsert"
    payload1 = {**VALID_PAYLOAD, "sub": sub, "email": "upsert@gmail.com", "name": "Old Name"}
    payload2 = {**VALID_PAYLOAD, "sub": sub, "email": "upsert@gmail.com", "name": "New Name"}

    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload1)):
        r1 = await client.post("/api/v1/auth/google", json={"credential": "fake"})
    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload2)):
        r2 = await client.post("/api/v1/auth/google", json={"credential": "fake"})

    assert r1.status_code == 200
    assert r2.status_code == 200

    result = await db_session.execute(select(User).where(User.google_id == sub))
    users = result.scalars().all()
    assert len(users) == 1  # no duplicate row
    assert users[0].display_name == "New Name"


@pytest.mark.asyncio
async def test_google_login_returns_401_on_invalid_credential(client: AsyncClient) -> None:
    with patch(
        "app.api.v1.auth.verify_google_credential",
        new=AsyncMock(side_effect=ValueError("Token is expired")),
    ):
        resp = await client.post("/api/v1/auth/google", json={"credential": "bad"})
    assert resp.status_code == 401
    assert "Invalid Google credential" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_google_login_returns_409_on_email_collision(client: AsyncClient) -> None:
    """Same email, different google_id → 409."""
    email = "collision@gmail.com"
    payload1 = {**VALID_PAYLOAD, "sub": "google-uid-a", "email": email}
    payload2 = {**VALID_PAYLOAD, "sub": "google-uid-b", "email": email}

    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload1)):
        await client.post("/api/v1/auth/google", json={"credential": "fake"})
    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload2)):
        resp = await client.post("/api/v1/auth/google", json={"credential": "fake"})

    assert resp.status_code == 409


# ── Auth guard ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_endpoint_requires_auth(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/stories/generate-long-form", json={})
    assert resp.status_code == 401


# ── Rate limiting ─────────────────────────────────────────────────────────────


async def _create_user_with_token(
    db_session: AsyncSession,
    email: str,
) -> tuple[User, str]:
    """Helper: insert a User row directly and return (user, token)."""
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        google_id=str(uuid.uuid4()),
    )
    db_session.add(user)
    await db_session.commit()
    return user, issue_token(user.id, user.email)


@pytest.mark.asyncio
async def test_rate_limit_blocks_after_n_requests(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """After RATE_LIMIT_PER_HOUR rows in the window the next request returns 429."""
    from app.config import settings

    user, token = await _create_user_with_token(db_session, "ratelimited@test.com")

    now = datetime.now(timezone.utc)
    for _ in range(settings.rate_limit_per_hour):
        db_session.add(
            GenerationRequest(
                id=str(uuid.uuid4()),
                user_id=user.id,
                requested_at=now - timedelta(minutes=30),
            )
        )
    await db_session.commit()

    resp = await client.post(
        "/api/v1/stories/generate-long-form",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert resp.status_code == 429
    body = resp.json()
    assert body["detail"] == "Rate limit exceeded"
    assert "retry_after" in body
    assert "Retry-After" in resp.headers


@pytest.mark.asyncio
async def test_rate_limit_retry_after_is_correct(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """retry_after must equal earliest_in_window + 1 hour (±2s tolerance)."""
    from app.config import settings

    user, token = await _create_user_with_token(db_session, "retrycheck@test.com")

    earliest = datetime.now(timezone.utc) - timedelta(minutes=45)
    for i in range(settings.rate_limit_per_hour):
        db_session.add(
            GenerationRequest(
                id=str(uuid.uuid4()),
                user_id=user.id,
                requested_at=earliest + timedelta(minutes=i),
            )
        )
    await db_session.commit()

    resp = await client.post(
        "/api/v1/stories/generate-long-form",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert resp.status_code == 429
    retry_after = datetime.fromisoformat(
        resp.json()["retry_after"].replace("Z", "+00:00")
    )
    expected = earliest + timedelta(hours=1)
    assert abs((retry_after - expected).total_seconds()) < 2


@pytest.mark.asyncio
async def test_rate_limit_concurrent_requests_cannot_bypass(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """SELECT FOR UPDATE must prevent two concurrent requests both reading count=9
    and both inserting, which would let a burst exceed the limit."""
    from app.config import settings
    from app.persistence.db import session_factory
    from sqlalchemy import func, select

    user, token = await _create_user_with_token(db_session, "concurrent@test.com")

    now = datetime.now(timezone.utc)
    for _ in range(settings.rate_limit_per_hour - 1):
        db_session.add(
            GenerationRequest(
                id=str(uuid.uuid4()),
                user_id=user.id,
                requested_at=now - timedelta(minutes=30),
            )
        )
    await db_session.commit()

    results = await asyncio.gather(
        client.post(
            "/api/v1/stories/generate-long-form",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        ),
        client.post(
            "/api/v1/stories/generate-long-form",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        ),
        return_exceptions=True,
    )

    statuses = [r.status_code for r in results if hasattr(r, "status_code")]
    assert 429 in statuses, (
        f"Expected at least one 429 in concurrent results, got {statuses}"
    )

    async with session_factory() as check_session:
        window_start = datetime.now(timezone.utc) - timedelta(hours=1)
        count = (
            await check_session.execute(
                select(func.count())
                .select_from(GenerationRequest)
                .where(GenerationRequest.user_id == user.id)
                .where(GenerationRequest.requested_at > window_start)
            )
        ).scalar_one()
        assert count == settings.rate_limit_per_hour
