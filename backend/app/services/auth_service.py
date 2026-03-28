"""Google credential verification and JWT issue/verify — no database access."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import jwt as pyjwt

from app.config import settings


class InvalidGoogleCredentialError(ValueError):
    """Raised when a Google ID token cannot be verified safely."""

    def __init__(self, reason: str) -> None:
        super().__init__("Invalid Google credential")
        self.reason = reason


async def verify_google_credential(credential: str) -> dict:
    """Verify a Google ID token credential. Returns decoded payload on success.

    Runs the blocking google-auth HTTP call in a thread pool to avoid
    blocking the asyncio event loop.

    Raises InvalidGoogleCredentialError on any verification failure (expired, wrong audience,
    bad signature, unverified email, missing claims).
    """
    from google.auth.exceptions import GoogleAuthError
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    def _verify() -> dict:
        try:
            payload = id_token.verify_oauth2_token(
                credential, google_requests.Request(), settings.google_client_id
            )
        except (GoogleAuthError, ValueError) as exc:
            raise InvalidGoogleCredentialError(str(exc)) from exc

        if not payload.get("email_verified"):
            raise InvalidGoogleCredentialError("Google account email is not verified")
        if not payload.get("sub"):
            raise InvalidGoogleCredentialError("Google token missing subject claim")
        if not payload.get("email"):
            raise InvalidGoogleCredentialError("Google token missing email claim")

        return payload

    return await asyncio.get_running_loop().run_in_executor(None, _verify)


def issue_token(user_id: str, email: str) -> str:
    """Issue a signed HS256 JWT containing user_id, email, and expiry."""
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expiry_hours)
    return pyjwt.encode(
        {"user_id": user_id, "email": email, "exp": exp},
        settings.jwt_secret,
        algorithm="HS256",
    )


def verify_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jwt.InvalidTokenError on any failure."""
    return pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
