"""Password hashing and JWT issue/verify — no database access."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt as pyjwt

from app.config import settings


def hash_password(password: str) -> str:
    """Return a bcrypt hash of the given plaintext password."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Return True if password matches the stored bcrypt hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


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
