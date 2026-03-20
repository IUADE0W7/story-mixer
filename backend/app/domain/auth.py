"""Pydantic I/O models for authentication endpoints."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class GoogleAuthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    credential: str


class TokenResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    access_token: str
    token_type: str = "bearer"
