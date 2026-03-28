"""Unit tests for auth_service — Google credential verification and JWT operations."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest

os.environ["JWT_SECRET"] = "test-secret-for-unit-tests-only"
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")

from app.services.auth_service import InvalidGoogleCredentialError, issue_token, verify_google_credential, verify_token

# ── verify_google_credential ──────────────────────────────────────────────────

VALID_PAYLOAD = {
    "sub": "google-user-123",
    "email": "user@gmail.com",
    "email_verified": True,
    "name": "Test User",
    "picture": "https://example.com/avatar.jpg",
}


@pytest.mark.asyncio
async def test_verify_google_credential_returns_payload() -> None:
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=VALID_PAYLOAD):
        result = await verify_google_credential("fake-credential")
    assert result["sub"] == "google-user-123"
    assert result["email"] == "user@gmail.com"


@pytest.mark.asyncio
async def test_verify_google_credential_raises_on_invalid_token() -> None:
    with patch(
        "google.oauth2.id_token.verify_oauth2_token",
        side_effect=ValueError("Token is invalid"),
    ):
        with pytest.raises(InvalidGoogleCredentialError) as exc_info:
            await verify_google_credential("bad-token")
    assert exc_info.value.reason == "Token is invalid"


@pytest.mark.asyncio
async def test_verify_google_credential_raises_on_google_auth_error() -> None:
    from google.auth.exceptions import GoogleAuthError

    with patch(
        "google.oauth2.id_token.verify_oauth2_token",
        side_effect=GoogleAuthError("auth error"),
    ):
        with pytest.raises(InvalidGoogleCredentialError) as exc_info:
            await verify_google_credential("bad-token")
    assert exc_info.value.reason == "auth error"


@pytest.mark.asyncio
async def test_verify_google_credential_raises_when_email_not_verified() -> None:
    payload = {**VALID_PAYLOAD, "email_verified": False}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        with pytest.raises(InvalidGoogleCredentialError) as exc_info:
            await verify_google_credential("fake-credential")
    assert "email is not verified" in exc_info.value.reason


@pytest.mark.asyncio
async def test_verify_google_credential_raises_when_sub_missing() -> None:
    payload = {**VALID_PAYLOAD, "sub": ""}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        with pytest.raises(InvalidGoogleCredentialError) as exc_info:
            await verify_google_credential("fake-credential")
    assert "missing subject" in exc_info.value.reason


@pytest.mark.asyncio
async def test_verify_google_credential_raises_when_email_missing() -> None:
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "email"}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        with pytest.raises(InvalidGoogleCredentialError) as exc_info:
            await verify_google_credential("fake-credential")
    assert "missing email" in exc_info.value.reason


# ── issue_token / verify_token (unchanged) ────────────────────────────────────

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
