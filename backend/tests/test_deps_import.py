"""Verify deps module exports expected symbols."""
import os

os.environ.setdefault("JWT_SECRET", "test")

def test_deps_exports_expected_symbols() -> None:
    from app.api.deps import RateLimitExceeded, check_rate_limit, get_current_user
    assert callable(get_current_user)
    assert callable(check_rate_limit)
    assert issubclass(RateLimitExceeded, Exception)
