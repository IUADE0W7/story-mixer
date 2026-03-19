"""Validate GoogleAuthRequest and TokenResponse domain models."""

import os

os.environ.setdefault("JWT_SECRET", "test-secret-for-testing-only")
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")

import pytest
from pydantic import ValidationError

from app.domain.auth import GoogleAuthRequest, TokenResponse


def test_google_auth_request_accepts_credential_string() -> None:
    req = GoogleAuthRequest(credential="abc.def.ghi")
    assert req.credential == "abc.def.ghi"


def test_google_auth_request_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        GoogleAuthRequest(credential="abc", extra_field="bad")


def test_google_auth_request_requires_credential() -> None:
    with pytest.raises(ValidationError):
        GoogleAuthRequest()


def test_token_response_default_token_type() -> None:
    assert TokenResponse(access_token="abc").token_type == "bearer"
