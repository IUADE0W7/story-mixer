"""Integration tests for auth endpoints and rate limiting (require real DB)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models import GenerationRequest, User
from app.services.auth_service import hash_password, issue_token

pytestmark = pytest.mark.integration


# ── Register ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_register_returns_201_with_token(client: AsyncClient) -> None:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": "alice@test.com", "password": "password123"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_register_409_on_duplicate_email(client: AsyncClient) -> None:
    payload = {"email": "bob@test.com", "password": "password123"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


# ── Login ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_returns_200_with_token(client: AsyncClient) -> None:
    email, pwd = "carol@test.com", "password123"
    await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_401_wrong_password(client: AsyncClient) -> None:
    await client.post(
        "/api/v1/auth/register",
        json={"email": "dave@test.com", "password": "correctpass"},
    )
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "dave@test.com", "password": "wrongpass"},
    )
    assert resp.status_code == 401


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
        password_hash=hash_password("pass12345"),
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
    # Body shape from the custom RateLimitExceeded handler — flat, not nested
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

    # Pre-fill to one below the limit
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

    # Fire two requests simultaneously — only one should succeed
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
    # One request should have passed auth+rate-limit (200 or 4xx from missing body),
    # the other should have been blocked (429). Not both should pass rate limit.
    # The one that passes rate limit will fail at body validation (422) — that's fine.
    assert 429 in statuses, (
        f"Expected at least one 429 in concurrent results, got {statuses}"
    )

    # Confirm only one row was inserted (count = limit, not limit+1)
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
