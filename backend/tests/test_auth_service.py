"""Unit tests for auth_service — password hashing and JWT operations."""

from __future__ import annotations

import os

import pytest

os.environ["JWT_SECRET"] = "test-secret-for-unit-tests-only"

from app.services.auth_service import hash_password, issue_token, verify_password, verify_token


def test_hash_returns_bcrypt_string() -> None:
    h = hash_password("mypassword")
    assert h.startswith("$2b$") or h.startswith("$2a$")


def test_hash_is_not_plaintext() -> None:
    assert hash_password("mypassword") != "mypassword"


def test_verify_correct_password() -> None:
    assert verify_password("correct_horse", hash_password("correct_horse")) is True


def test_verify_wrong_password() -> None:
    assert verify_password("wrong_horse", hash_password("correct_horse")) is False


def test_issue_token_returns_string() -> None:
    token = issue_token("user-123", "a@b.com")
    assert isinstance(token, str) and len(token) > 0


def test_verify_token_returns_correct_payload() -> None:
    token = issue_token("user-abc", "x@y.com")
    payload = verify_token(token)
    assert payload["user_id"] == "user-abc"
    assert payload["email"] == "x@y.com"


def test_verify_token_rejects_tampered_token() -> None:
    import jwt as pyjwt

    token = issue_token("user-abc", "x@y.com")
    with pytest.raises(pyjwt.InvalidTokenError):
        verify_token(token[:-4] + "XXXX")


def test_verify_token_rejects_expired_token() -> None:
    import jwt as pyjwt
    from datetime import datetime, timedelta, timezone

    from app.config import settings

    payload = {
        "user_id": "user-abc",
        "email": "x@y.com",
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
    }
    expired = pyjwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(pyjwt.ExpiredSignatureError):
        verify_token(expired)
