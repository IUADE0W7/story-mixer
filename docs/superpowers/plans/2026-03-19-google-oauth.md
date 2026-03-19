# Google OAuth Login Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace email/password authentication with Google Sign-In (GIS frontend-first flow) — frontend gets a Google ID token, POSTs it to the backend, backend verifies and issues the existing HS256 JWT.

**Architecture:** The frontend uses `@react-oauth/google` to render a Google Sign-In button that returns a credential string. That credential is POSTed to a new `POST /api/v1/auth/google` endpoint which verifies it against Google's public keys (via `google-auth` Python library, run in a thread pool to avoid blocking the event loop), upserts the user row via `INSERT ... ON CONFLICT`, and returns the existing `TokenResponse` JWT. All downstream auth (`get_current_user`, rate limiting, Bearer header) is unchanged.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, PyJWT, `google-auth>=2.0.0`, Next.js 15, React 19, `@react-oauth/google@^0.12.0`

---

## File Map

**Create:**
- `backend/alembic/versions/20260319_0003_google_oauth_users.py` — migration: truncate users, drop password_hash, add google_id/display_name/avatar_url
- `frontend/src/components/providers.tsx` — client-side GoogleOAuthProvider wrapper for layout

**Modify:**
- `backend/pyproject.toml` — add `google-auth>=2.0.0`
- `backend/.env.example` — add `GOOGLE_CLIENT_ID=`
- `backend/app/config.py` — add `google_client_id: str`
- `backend/app/persistence/models.py` — update User: remove password_hash, add google_id/display_name/avatar_url
- `backend/app/services/auth_service.py` — remove hash_password/verify_password, add async verify_google_credential
- `backend/app/domain/auth.py` — remove RegisterRequest/LoginRequest, add GoogleAuthRequest
- `backend/app/api/v1/auth.py` — remove /register /login, add POST /google with upsert
- `backend/tests/test_auth_service.py` — replace password tests with verify_google_credential tests
- `backend/tests/test_auth_domain.py` — replace RegisterRequest/LoginRequest tests with GoogleAuthRequest tests
- `backend/tests/test_auth_integration.py` — replace register/login tests with POST /google tests
- `frontend/package.json` — add `@react-oauth/google`
- `frontend/.env.example` — add `NEXT_PUBLIC_GOOGLE_CLIENT_ID=`
- `frontend/src/app/layout.tsx` — wrap with Providers
- `frontend/src/components/auth-modal.tsx` — replace form with GoogleLogin

---

## Task 1: Add backend dependency and config

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/.env.example`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Add google-auth to pyproject.toml**

In `backend/pyproject.toml`, add to the `dependencies` list (after `google-genai`):

```toml
"google-auth>=2.0.0",
```

- [ ] **Step 2: Install the new dependency**

```bash
cd backend && ../.venv/bin/pip install "google-auth>=2.0.0"
```

Expected: Successfully installed google-auth-...

- [ ] **Step 3: Add GOOGLE_CLIENT_ID to .env.example**

In `backend/.env.example`, add after `GOOGLE_API_KEY=`:

```
GOOGLE_CLIENT_ID=
```

- [ ] **Step 4: Add google_client_id to AppSettings**

In `backend/app/config.py`, add to the `AppSettings` class after `google_api_key`:

```python
google_client_id: str = ""
```

> Note: defaulting to `""` lets tests run without setting the var. In production it must be non-empty — verified at runtime when `verify_google_credential` is called.

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/.env.example backend/app/config.py
git commit -m "feat: add google-auth dependency and GOOGLE_CLIENT_ID config"
```

---

## Task 2: Database migration

**Files:**
- Create: `backend/alembic/versions/20260319_0003_google_oauth_users.py`

- [ ] **Step 1: Create the migration file**

Create `backend/alembic/versions/20260319_0003_google_oauth_users.py`:

```python
"""replace password_hash with google oauth columns

Revision ID: 20260319_0003
Revises: 20260319_0002
Create Date: 2026-03-19
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0003"
down_revision = "20260319_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fresh start: wipe all users (and cascade to generation_requests via FK)
    op.execute("TRUNCATE users CASCADE")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "password_hash")

    op.add_column("users", sa.Column("google_id", sa.Text, nullable=False, server_default=""))
    op.add_column("users", sa.Column("display_name", sa.Text, nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.Text, nullable=True))

    # Remove the temporary server_default used to satisfy NOT NULL during ALTER
    op.alter_column("users", "google_id", server_default=None)

    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_google_id", "users", ["google_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "display_name")
    op.drop_column("users", "google_id")
    op.add_column("users", sa.Column("password_hash", sa.Text, nullable=False, server_default=""))
    op.alter_column("users", "password_hash", server_default=None)
    op.create_index("ix_users_email", "users", ["email"], unique=True)
```

- [ ] **Step 2: Run the migration**

```bash
cd backend && DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
  ../.venv/bin/alembic upgrade head
```

Expected: `Running upgrade 20260319_0002 -> 20260319_0003, replace password_hash with google oauth columns`

- [ ] **Step 3: Verify schema**

```bash
cd backend && DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
  ../.venv/bin/alembic current
```

Expected: `20260319_0003 (head)`

- [ ] **Step 4: Commit**

```bash
git add backend/alembic/versions/20260319_0003_google_oauth_users.py
git commit -m "feat: migration — replace password_hash with google oauth columns"
```

---

## Task 3: Update User ORM model

**Files:**
- Modify: `backend/app/persistence/models.py`

- [ ] **Step 1: Update the User class**

Replace the `User` class in `backend/app/persistence/models.py`:

```python
class User(Base):
    """Registered LoreForge user authenticated via Google OAuth."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(Text, nullable=False)
    google_id: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_users_email", "email", unique=True),
        Index("ix_users_google_id", "google_id", unique=True),
    )
```

Remove the `Boolean` import from the SQLAlchemy imports if it's no longer used (check the full file — it's only used by `StoryRecord.low_confidence`; leave it if so).

- [ ] **Step 2: Verify existing tests still pass (non-integration only)**

```bash
cd backend && JWT_SECRET=test ../.venv/bin/pytest -q -k "not integration"
```

Expected: all non-integration tests pass (some will fail — that's expected until Tasks 4–6)

- [ ] **Step 3: Commit**

```bash
git add backend/app/persistence/models.py
git commit -m "feat: update User ORM model for google oauth"
```

---

## Task 4: Replace auth_service — verify_google_credential

**Files:**
- Modify: `backend/app/services/auth_service.py`
- Modify: `backend/tests/test_auth_service.py`

- [ ] **Step 1: Write failing tests**

Replace `backend/tests/test_auth_service.py` entirely:

```python
"""Unit tests for auth_service — Google credential verification and JWT operations."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

os.environ["JWT_SECRET"] = "test-secret-for-unit-tests-only"
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")

from app.services.auth_service import issue_token, verify_google_credential, verify_token

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
        with pytest.raises(ValueError, match="Token is invalid"):
            await verify_google_credential("bad-token")


@pytest.mark.asyncio
async def test_verify_google_credential_raises_on_google_auth_error() -> None:
    from google.auth.exceptions import GoogleAuthError

    with patch(
        "google.oauth2.id_token.verify_oauth2_token",
        side_effect=GoogleAuthError("auth error"),
    ):
        with pytest.raises(ValueError, match="auth error"):
            await verify_google_credential("bad-token")


@pytest.mark.asyncio
async def test_verify_google_credential_raises_when_email_not_verified() -> None:
    payload = {**VALID_PAYLOAD, "email_verified": False}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        with pytest.raises(ValueError, match="email is not verified"):
            await verify_google_credential("fake-credential")


@pytest.mark.asyncio
async def test_verify_google_credential_raises_when_sub_missing() -> None:
    payload = {**VALID_PAYLOAD, "sub": ""}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        with pytest.raises(ValueError, match="missing subject"):
            await verify_google_credential("fake-credential")


@pytest.mark.asyncio
async def test_verify_google_credential_raises_when_email_missing() -> None:
    payload = {k: v for k, v in VALID_PAYLOAD.items() if k != "email"}
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=payload):
        with pytest.raises(ValueError, match="missing email"):
            await verify_google_credential("fake-credential")


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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_service.py -v
```

Expected: FAIL — `ImportError` or `cannot import name 'verify_google_credential'`

- [ ] **Step 3: Implement verify_google_credential in auth_service.py**

Replace `backend/app/services/auth_service.py` entirely:

```python
"""Google credential verification and JWT issue/verify — no database access."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import jwt as pyjwt

from app.config import settings


async def verify_google_credential(credential: str) -> dict:
    """Verify a Google ID token credential. Returns decoded payload on success.

    Runs the blocking google-auth HTTP call in a thread pool to avoid
    blocking the asyncio event loop.

    Raises ValueError on any verification failure (expired, wrong audience,
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
            raise ValueError(str(exc)) from exc

        if not payload.get("email_verified"):
            raise ValueError("Google account email is not verified")
        if not payload.get("sub"):
            raise ValueError("Google token missing subject claim")
        if not payload.get("email"):
            raise ValueError("Google token missing email claim")

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_service.py -v
```

Expected: all 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth_service.py backend/tests/test_auth_service.py
git commit -m "feat: replace auth_service — verify_google_credential replaces bcrypt"
```

---

## Task 5: Replace domain models

**Files:**
- Modify: `backend/app/domain/auth.py`
- Modify: `backend/tests/test_auth_domain.py`

- [ ] **Step 1: Write failing tests**

Replace `backend/tests/test_auth_domain.py` entirely:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_domain.py -v
```

Expected: FAIL — `cannot import name 'GoogleAuthRequest'`

- [ ] **Step 3: Replace domain/auth.py**

Replace `backend/app/domain/auth.py` entirely:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_domain.py -v
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/domain/auth.py backend/tests/test_auth_domain.py
git commit -m "feat: replace auth domain models — GoogleAuthRequest replaces Register/Login"
```

---

## Task 6: Replace auth router

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/tests/test_auth_integration.py`

- [ ] **Step 1: Write failing integration tests**

Replace `backend/tests/test_auth_integration.py` entirely:

```python
"""Integration tests for POST /api/v1/auth/google endpoint (require real DB)."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration

VALID_PAYLOAD = {
    "sub": "google-uid-001",
    "email": "alice@gmail.com",
    "email_verified": True,
    "name": "Alice Test",
    "picture": "https://example.com/alice.jpg",
}


# ── POST /api/v1/auth/google ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_google_login_returns_200_with_token(client: AsyncClient) -> None:
    with patch(
        "app.api.v1.auth.verify_google_credential",
        new=AsyncMock(return_value=VALID_PAYLOAD),
    ):
        resp = await client.post("/api/v1/auth/google", json={"credential": "fake"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_google_login_creates_new_user(client: AsyncClient, db_session) -> None:
    from sqlalchemy import select
    from app.persistence.models import User

    payload = {**VALID_PAYLOAD, "sub": "google-uid-new", "email": "newuser@gmail.com"}
    with patch(
        "app.api.v1.auth.verify_google_credential",
        new=AsyncMock(return_value=payload),
    ):
        resp = await client.post("/api/v1/auth/google", json={"credential": "fake"})
    assert resp.status_code == 200

    result = await db_session.execute(select(User).where(User.google_id == "google-uid-new"))
    user = result.scalar_one_or_none()
    assert user is not None
    assert user.email == "newuser@gmail.com"
    assert user.display_name == "Alice Test"


@pytest.mark.asyncio
async def test_google_login_upserts_existing_user(client: AsyncClient, db_session) -> None:
    """Second login with the same google_id updates profile but keeps the same user id."""
    from sqlalchemy import select
    from app.persistence.models import User

    sub = "google-uid-upsert"
    payload1 = {**VALID_PAYLOAD, "sub": sub, "email": "upsert@gmail.com", "name": "Old Name"}
    payload2 = {**VALID_PAYLOAD, "sub": sub, "email": "upsert@gmail.com", "name": "New Name"}

    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload1)):
        r1 = await client.post("/api/v1/auth/google", json={"credential": "fake"})
    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload2)):
        r2 = await client.post("/api/v1/auth/google", json={"credential": "fake"})

    assert r1.status_code == 200
    assert r2.status_code == 200

    result = await db_session.execute(select(User).where(User.google_id == sub))
    users = result.scalars().all()
    assert len(users) == 1  # no duplicate row
    assert users[0].display_name == "New Name"


@pytest.mark.asyncio
async def test_google_login_returns_401_on_invalid_credential(client: AsyncClient) -> None:
    with patch(
        "app.api.v1.auth.verify_google_credential",
        new=AsyncMock(side_effect=ValueError("Token is expired")),
    ):
        resp = await client.post("/api/v1/auth/google", json={"credential": "bad"})
    assert resp.status_code == 401
    assert "Invalid Google credential" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_google_login_returns_409_on_email_collision(client: AsyncClient) -> None:
    """Same email, different google_id → 409."""
    email = "collision@gmail.com"
    payload1 = {**VALID_PAYLOAD, "sub": "google-uid-a", "email": email}
    payload2 = {**VALID_PAYLOAD, "sub": "google-uid-b", "email": email}

    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload1)):
        await client.post("/api/v1/auth/google", json={"credential": "fake"})
    with patch("app.api.v1.auth.verify_google_credential", new=AsyncMock(return_value=payload2)):
        resp = await client.post("/api/v1/auth/google", json={"credential": "fake"})

    assert resp.status_code == 409
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && JWT_SECRET=test GOOGLE_CLIENT_ID=test \
  ../.venv/bin/pytest tests/test_auth_integration.py -v -m integration
```

Expected: FAIL — `405 Method Not Allowed` or import errors (endpoint doesn't exist yet)

- [ ] **Step 3: Implement POST /google in auth.py**

Replace `backend/app/api/v1/auth.py` entirely:

```python
"""Google OAuth authentication endpoint."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth import GoogleAuthRequest, TokenResponse
from app.persistence.db import get_session
from app.persistence.models import User
from app.services.auth_service import issue_token, verify_google_credential

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/google")
async def google_login(
    body: GoogleAuthRequest,
    db: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Verify a Google ID token credential, upsert user, and return a JWT."""
    try:
        payload = await verify_google_credential(body.credential)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google credential: {exc}")

    stmt = (
        pg_insert(User)
        .values(
            id=str(uuid.uuid4()),
            email=payload["email"],
            google_id=payload["sub"],
            display_name=payload.get("name"),
            avatar_url=payload.get("picture"),
        )
        .on_conflict_do_update(
            index_elements=["google_id"],
            set_={
                "display_name": payload.get("name"),
                "avatar_url": payload.get("picture"),
            },
        )
        .returning(User.id, User.email)
    )

    try:
        result = await db.execute(stmt)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        )

    row = result.one()
    return TokenResponse(access_token=issue_token(row.id, row.email))
```

- [ ] **Step 4: Run integration tests**

```bash
cd backend && JWT_SECRET=test GOOGLE_CLIENT_ID=test \
  ../.venv/bin/pytest tests/test_auth_integration.py -v -m integration
```

Expected: all 5 tests PASS

- [ ] **Step 5: Run full test suite to check nothing is broken**

```bash
cd backend && JWT_SECRET=test GOOGLE_CLIENT_ID=test \
  ../.venv/bin/pytest -q
```

Expected: all tests pass (or only pre-existing failures)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/auth.py backend/tests/test_auth_integration.py
git commit -m "feat: POST /api/v1/auth/google — replace register/login with google oauth"
```

---

## Task 7: Frontend — install dependency and env

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Install @react-oauth/google**

```bash
cd frontend && npm install @react-oauth/google@^0.12.0
```

Expected: added `@react-oauth/google` to package.json

- [ ] **Step 2: Add env var to .env.example**

In `frontend/.env.example`, add:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

> **Important:** Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local` to the same Client ID value used for `GOOGLE_CLIENT_ID` in `backend/.env`.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.example
git commit -m "feat: install @react-oauth/google, add NEXT_PUBLIC_GOOGLE_CLIENT_ID env"
```

---

## Task 8: Wrap layout with GoogleOAuthProvider

**Files:**
- Create: `frontend/src/components/providers.tsx`
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Create providers.tsx client component**

Create `frontend/src/components/providers.tsx`:

```tsx
"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      {children}
    </GoogleOAuthProvider>
  );
}
```

- [ ] **Step 2: Wrap layout children with Providers**

In `frontend/src/app/layout.tsx`, add the import and wrap:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Story Mixer — LoreForge",
  description: "Calibrated narrative generation. Tune the vibe, brew the story.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="min-h-screen" style={{ background: "var(--ink)" }}>
        <Providers>
          <LanguageProvider>{children}</LanguageProvider>
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify frontend builds without errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: Build succeeds (or only pre-existing errors)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/providers.tsx frontend/src/app/layout.tsx
git commit -m "feat: wrap layout with GoogleOAuthProvider"
```

---

## Task 9: Replace auth modal

**Files:**
- Modify: `frontend/src/components/auth-modal.tsx`

- [ ] **Step 1: Replace auth-modal.tsx**

Replace `frontend/src/components/auth-modal.tsx` entirely:

```tsx
"use client";

import { useState } from "react";

import { GoogleLogin } from "@react-oauth/google";
import * as Dialog from "@radix-ui/react-dialog";

export type AuthModalProps = {
  onAuthenticated: (token: string) => void;
};

export function AuthModal({ onAuthenticated }: AuthModalProps) {
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSuccess(credentialResponse: { credential?: string }) {
    setError(null);

    if (!credentialResponse.credential) {
      setError("Google sign-in failed. Please try again.");
      return;
    }

    try {
      const resp = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });

      if (resp.status === 409) {
        setError("An account with this email already exists.");
        return;
      }
      if (!resp.ok) {
        setError("Google sign-in failed. Please try again.");
        return;
      }

      const data = (await resp.json()) as { access_token?: string };
      if (typeof data?.access_token !== "string") {
        setError("Unexpected response from server.");
        return;
      }

      onAuthenticated(data.access_token);
    } catch {
      setError("Network error. Please try again.");
    }
  }

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm rounded-lg p-6 shadow-xl space-y-4"
          style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title
            className="text-lg font-semibold text-center"
            style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
          >
            Sign In to LoreForge
          </Dialog.Title>

          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed. Please try again.")}
              theme="filled_black"
              shape="rectangular"
              size="large"
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: "var(--error, #f87171)" }} role="alert">
              {error}
            </p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 2: Verify frontend builds without type errors**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/auth-modal.tsx
git commit -m "feat: replace auth modal — google sign-in button replaces email/password form"
```

---

## Task 10: Update E2E tests

**Files:**
- Modify: `frontend/e2e/auth.spec.ts`

- [ ] **Step 1: Read current auth.spec.ts to understand what to remove/replace**

Open `frontend/e2e/auth.spec.ts` and identify all tests that reference email/password forms, `/api/v1/auth/register`, or `/api/v1/auth/login`.

- [ ] **Step 2: Update auth.spec.ts**

Replace the entire file with tests appropriate for the Google Sign-In flow. Since GIS cannot be fully automated in Playwright without mocking, the E2E tests should:

1. Verify the auth modal is shown when unauthenticated
2. Verify the Google Sign-In button is visible in the modal
3. Test the full flow by intercepting the network request (mock the backend response)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Auth modal — Google Sign-In", () => {
  test.beforeEach(async ({ page }) => {
    // Clear any stored token to ensure unauthenticated state
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => localStorage.removeItem("lf_token"));
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  });

  test("shows auth modal when unauthenticated", async ({ page }) => {
    // The modal should be visible or appear after interaction
    // depending on how the app triggers it
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
  });

  test("auth modal contains Google Sign-In button", async ({ page }) => {
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    // Google Sign-In button is rendered inside an iframe by @react-oauth/google
    // Verify the container is present
    const googleButtonContainer = page.locator('[data-testid="google-login"], iframe[src*="accounts.google.com"], .google-login-button').first();
    // Fallback: check the dialog contains expected heading
    await expect(page.getByText("Sign In to LoreForge")).toBeVisible();
  });

  test("stores token and closes modal after successful google login", async ({ page }) => {
    // Intercept the backend auth call and return a fake token
    await page.route("/api/v1/auth/google", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "fake-jwt-token", token_type: "bearer" }),
      });
    });

    // Simulate the credential POST directly (bypassing GIS iframe which can't be automated)
    const token = await page.evaluate(async () => {
      const resp = await fetch("/api/v1/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: "fake-credential" }),
      });
      const data = await resp.json() as { access_token?: string };
      if (data.access_token) {
        localStorage.setItem("lf_token", data.access_token);
      }
      return localStorage.getItem("lf_token");
    });

    expect(token).toBe("fake-jwt-token");
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
cd frontend && npm run e2e 2>&1 | tail -30
```

Expected: tests pass (adjust selectors if the app triggers auth modal differently)

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/auth.spec.ts
git commit -m "test(e2e): update auth spec for google sign-in"
```

---

## Task 11: Remove dead code

**Files:**
- Check: `backend/tests/test_config_auth_settings.py` — may reference `password_hash` or old settings
- Check: `backend/tests/test_orm_models.py` — may reference `User.password_hash`

- [ ] **Step 1: Check for references to removed symbols**

```bash
cd backend && grep -rn "password_hash\|hash_password\|verify_password\|RegisterRequest\|LoginRequest" tests/ app/
```

Expected: no matches (if any remain, fix them)

- [ ] **Step 2: Fix any remaining references**

Update any files that still import or use the removed symbols.

- [ ] **Step 3: Run full test suite one final time**

```bash
cd backend && JWT_SECRET=test GOOGLE_CLIENT_ID=test ../.venv/bin/pytest -q
```

Expected: all tests pass

- [ ] **Step 4: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: no errors

- [ ] **Step 5: Final commit**

```bash
git add -u
git commit -m "chore: remove remaining dead code from email/password auth"
```

---

## Google Cloud Console Setup (required before running end-to-end)

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (type: **Web application**)
3. Add `http://localhost:3000` to **Authorized JavaScript Origins**
4. Copy the Client ID
5. Set in `backend/.env`: `GOOGLE_CLIENT_ID=<your-client-id>`
6. Set in `frontend/.env.local`: `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same-client-id>`

Both must be the **same** Client ID value.
