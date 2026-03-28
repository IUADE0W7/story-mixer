"""In-memory auth throttling for repeated login attempts."""

from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone


class AuthRateLimiter:
    """Apply a short sliding-window limit to unauthenticated auth attempts."""

    def __init__(self) -> None:
        self._attempts: dict[str, deque[datetime]] = defaultdict(deque)

    def check(self, bucket: str, limit: int, window_seconds: int) -> datetime | None:
        """Return retry_after when the bucket is rate-limited, else record the attempt."""

        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=window_seconds)
        attempts = self._attempts[bucket]

        while attempts and attempts[0] <= window_start:
            attempts.popleft()

        if len(attempts) >= limit:
            return attempts[0] + timedelta(seconds=window_seconds)

        attempts.append(now)
        return None

    def reset(self) -> None:
        """Clear all in-memory state. Intended for tests."""

        self._attempts.clear()


auth_rate_limiter = AuthRateLimiter()


def reset_auth_rate_limit_state() -> None:
    """Reset auth rate limiting state between tests."""

    auth_rate_limiter.reset()
