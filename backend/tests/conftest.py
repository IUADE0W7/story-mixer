"""Shared pytest fixtures for integration tests."""

from __future__ import annotations

import os

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

os.environ.setdefault("JWT_SECRET", "integration-test-secret-do-not-use-in-prod")
os.environ.setdefault("GOOGLE_CLIENT_ID", "integration-test-google-client-id")

from app.main import create_app
from app.persistence.db import session_factory
from app.services.auth_rate_limit_service import reset_auth_rate_limit_state


@pytest_asyncio.fixture(autouse=True)
async def reset_auth_rate_limits():
    """Reset the in-memory auth throttle between tests."""

    reset_auth_rate_limit_state()
    yield
    reset_auth_rate_limit_state()


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    """Async HTTP client wired to the FastAPI test app via ASGI transport.
    loop_scope=session ensures this fixture shares the session event loop
    with the SQLAlchemy async engine (which binds to the first loop it uses).
    """
    async with AsyncClient(
        transport=ASGITransport(app=create_app()),
        base_url="http://test",
    ) as c:
        yield c


@pytest_asyncio.fixture(loop_scope="session")
async def db_session():
    """DB session with pre/post-test table truncation for isolation.
    loop_scope=session avoids 'attached to a different loop' errors
    since the SQLAlchemy engine binds to the session event loop.
    """
    async with session_factory() as session:
        # Pre-test cleanup
        await session.execute(text("DELETE FROM generation_requests"))
        await session.execute(text("DELETE FROM users"))
        await session.commit()
        yield session

    # Post-test cleanup in a fresh session
    async with session_factory() as cleanup:
        await cleanup.execute(text("DELETE FROM generation_requests"))
        await cleanup.execute(text("DELETE FROM users"))
        await cleanup.commit()
