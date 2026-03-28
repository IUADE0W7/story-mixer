"""FastAPI dependency providers for auth and rate limiting."""

from __future__ import annotations

import logging
from datetime import datetime

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.persistence.db import get_session, session_factory
from app.persistence.models import User
from app.services.auth_rate_limit_service import auth_rate_limiter
from app.services.auth_service import verify_token
from app.services.rate_limit_service import check_rate_limit_and_record

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Raised when a user exceeds their hourly generation request limit."""

    def __init__(self, retry_after: datetime) -> None:
        self.retry_after = retry_after


class AuthRateLimitExceeded(Exception):
    """Raised when a client exceeds the short-window auth attempt limit."""

    def __init__(self, retry_after: datetime) -> None:
        self.retry_after = retry_after


def _auth_failure(detail: str) -> HTTPException:
    """Return a normalized 401 error to avoid auth enumeration leaks."""

    return HTTPException(status_code=401, detail=detail)


async def check_auth_rate_limit(request: Request) -> None:
    """Throttle repeated login attempts per client address using a short window."""

    client_host = request.client.host if request.client is not None else "unknown"
    retry_after = auth_rate_limiter.check(
        bucket=client_host,
        limit=settings.auth_rate_limit_max_attempts,
        window_seconds=settings.auth_rate_limit_window_seconds,
    )
    if retry_after is None:
        return

    logger.warning(
        "Auth rate limit exceeded for client=%s retry_after=%s",
        client_host,
        retry_after.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    raise AuthRateLimitExceeded(retry_after)


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_session),
) -> User:
    """Resolve Bearer token to a User record. Raises 401 on any auth failure."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization[7:]
    try:
        payload = verify_token(token)
    except pyjwt.ExpiredSignatureError:
        logger.warning("Auth token expired")
        raise _auth_failure("Not authenticated")
    except pyjwt.InvalidTokenError:
        logger.warning("Auth token invalid")
        raise _auth_failure("Not authenticated")

    user = await db.get(User, payload["user_id"])
    if user is None:
        logger.warning("Auth token valid but user record was not found")
        raise _auth_failure("Not authenticated")

    logger.info("Auth token validated")
    return user


async def check_rate_limit(
    current_user: User = Depends(get_current_user),
) -> None:
    """Enforce per-user sliding-window rate limit; insert a generation_requests row on pass.

    Uses a fresh session (not the one from get_current_user) to avoid an
    InvalidRequestError when calling db.begin() on a session that already has an
    active transaction from get_current_user's queries.

    Raises RateLimitExceeded (handled in main.py) if the limit is reached.
    The insert happens before story generation starts — a failing request still counts.
    """
    async with session_factory() as db:
        async with db.begin():
            result = await check_rate_limit_and_record(
                db, current_user.id, settings.rate_limit_per_hour
            )

    if result is False:
        raise HTTPException(status_code=401, detail="User not found")
    if result is not None:
        logger.warning(
            "Generation rate limit exceeded retry_after=%s",
            result.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        raise RateLimitExceeded(result)
