"""Pydantic I/O models for authentication endpoints."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 72:
            # bcrypt silently discards bytes beyond 72 — a 73-char password would
            # match any 72-char prefix, which is a security defect.
            raise ValueError("Password must not exceed 72 characters")
        return v


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    email: str
    password: str


class TokenResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    access_token: str
    token_type: str = "bearer"
