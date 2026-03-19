"""Validate RegisterRequest password length and email format enforcement."""
import os
os.environ.setdefault("JWT_SECRET", "test-secret-for-testing-only")

import pytest
from pydantic import ValidationError

from app.domain.auth import LoginRequest, RegisterRequest, TokenResponse


def test_register_rejects_7_char_password() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.com", password="1234567")


def test_register_accepts_8_char_password() -> None:
    req = RegisterRequest(email="a@b.com", password="12345678")
    assert req.password == "12345678"


def test_register_accepts_72_char_password() -> None:
    pwd = "a" * 72
    assert RegisterRequest(email="a@b.com", password=pwd).password == pwd


def test_register_rejects_73_char_password() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="a@b.com", password="a" * 73)


def test_register_rejects_invalid_email() -> None:
    with pytest.raises(ValidationError):
        RegisterRequest(email="not-an-email", password="validpass")


def test_token_response_default_token_type() -> None:
    assert TokenResponse(access_token="abc").token_type == "bearer"
