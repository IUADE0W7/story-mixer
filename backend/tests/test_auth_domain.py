"""Unit tests for auth domain models."""
import os
os.environ.setdefault("JWT_SECRET", "test-secret-for-testing-only")

import pytest
from pydantic import ValidationError

from app.domain.auth import LoginRequest, RegisterRequest, TokenResponse


def test_register_request_valid() -> None:
    r = RegisterRequest(email="user@example.com", password="longenough")
    assert r.email == "user@example.com"


def test_register_request_invalid_email() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="not-an-email", password="longenough")


def test_register_request_password_too_short() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="user@example.com", password="short")


def test_login_request_valid() -> None:
    r = LoginRequest(email="user@example.com", password="anypassword")
    assert r.password == "anypassword"


def test_token_response_has_access_token() -> None:
    r = TokenResponse(access_token="abc123", token_type="bearer")
    assert r.access_token == "abc123"
    assert r.token_type == "bearer"
