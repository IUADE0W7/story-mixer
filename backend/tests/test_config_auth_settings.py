"""Verify that auth-related settings are declared in AppSettings."""
import os

os.environ.setdefault("JWT_SECRET", "test-secret-for-testing-only")

from app.config import AppSettings


def test_jwt_secret_field_exists() -> None:
    assert "jwt_secret" in AppSettings.model_fields


def test_jwt_expiry_hours_defaults_to_24() -> None:
    from importlib import reload
    import app.config as cfg
    reload(cfg)
    assert cfg.settings.jwt_expiry_hours == 24


def test_rate_limit_per_hour_defaults_to_10() -> None:
    from importlib import reload
    import app.config as cfg
    reload(cfg)
    assert cfg.settings.rate_limit_per_hour == 10


def test_auth_rate_limit_defaults_are_declared() -> None:
    from importlib import reload
    import app.config as cfg

    reload(cfg)
    assert cfg.settings.auth_rate_limit_max_attempts == 5
    assert cfg.settings.auth_rate_limit_window_seconds == 60
