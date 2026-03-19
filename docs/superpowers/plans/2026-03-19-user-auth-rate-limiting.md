# User Auth & Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password user accounts and a per-user rate limit of 10 story generation requests per hour to LoreForge.

**Architecture:** Two new DB tables (`users`, `generation_requests`) managed by Alembic; an `auth_service` for bcrypt + JWT (HS256); a `rate_limit_service` for atomic sliding-window enforcement via `SELECT FOR UPDATE`; a `RateLimitExceeded` exception handled by a custom FastAPI handler; FastAPI dependencies that compose into the existing stories endpoint; a new `AuthModal` frontend component with JWT stored in localStorage.

**Tech Stack:** PyJWT, bcrypt, SQLAlchemy async, FastAPI Depends(), pytest-asyncio, httpx (test), React 19 + TypeScript, Playwright.

**Spec:** `docs/superpowers/specs/2026-03-19-user-auth-rate-limiting-design.md`

---

## File Map

**New (backend)**
- `backend/app/domain/auth.py` — Pydantic models: `RegisterRequest`, `LoginRequest`, `TokenResponse`
- `backend/app/services/auth_service.py` — `hash_password`, `verify_password`, `create_access_token`, `decode_access_token`
- `backend/app/services/rate_limit_service.py` — `check_and_record`, `RateLimitExceeded`
- `backend/app/api/deps.py` — FastAPI deps: `get_current_user`, `check_rate_limit`
- `backend/app/api/v1/auth.py` — `POST /auth/register`, `POST /auth/login`
- `backend/alembic/versions/20260319_0001_add_users_table.py`
- `backend/alembic/versions/20260319_0002_add_generation_requests_table.py`

**New (tests)**
- `backend/tests/test_auth_service.py`
- `backend/tests/test_rate_limit_service.py`
- `backend/tests/test_auth_endpoints.py`
- `backend/tests/test_auth_integration.py`

**New (frontend)**
- `frontend/src/components/auth-modal.tsx`

**Modified**
- `backend/pyproject.toml` — add `PyJWT[cryptography]`, `bcrypt` to deps; `pytest-asyncio`, `httpx` to dev deps; `asyncio_mode = "auto"` config
- `backend/app/config.py` — add `jwt_secret`, `jwt_expiry_hours`, `rate_limit_per_hour`
- `backend/app/persistence/models.py` — add `User`, `GenerationRequest` ORM models
- `backend/app/main.py` — register auth router, register `RateLimitExceeded` exception handler
- `backend/app/api/v1/stories.py` — inject `check_rate_limit` dependency
- `frontend/src/components/use-long-form-stream.tsx` — pass `Authorization` header; handle 401/429
- `frontend/src/components/vibe-controller.tsx` — show `AuthModal`; display 429 retry message

---

## Task 1: Add Python dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add packages**

Open `backend/pyproject.toml`. Add runtime packages to `dependencies`:

```toml
  "PyJWT[cryptography]>=2.10.0",
  "bcrypt>=4.3.0",
```

Add a `[tool.uv.dev-dependencies]` section (or append to it if it already exists) for test-only packages:

```toml
[tool.uv.dev-dependencies]
dev = [
  "pytest-asyncio>=0.25.0",
  "httpx>=0.28.0",
]
```

Also add pytest-asyncio config so all `async def test_*` functions are collected automatically — add this section:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 2: Sync**

```bash
cd backend && uv sync
```

Expected: packages installed without errors.

- [ ] **Step 3: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock
git commit -m "chore: add PyJWT, bcrypt deps; pytest-asyncio, httpx dev deps"
```

---

## Task 2: Config settings

**Files:**
- Create: `backend/tests/test_config_auth.py`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_config_auth.py`:

```python
"""Verify auth settings are present and enforce required jwt_secret."""
from __future__ import annotations

import pytest


def test_jwt_expiry_hours_default():
    from app.config import AppSettings
    s = AppSettings(jwt_secret="test-secret-for-testing-only-32chars!!")
    assert s.jwt_expiry_hours == 24


def test_rate_limit_per_hour_default():
    from app.config import AppSettings
    s = AppSettings(jwt_secret="test-secret-for-testing-only-32chars!!")
    assert s.rate_limit_per_hour == 10


def test_jwt_secret_required():
    from pydantic import ValidationError
    from app.config import AppSettings
    with pytest.raises(ValidationError):
        AppSettings()  # no jwt_secret in env
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_config_auth.py -v
```

Expected: `AttributeError` — `jwt_secret` does not exist yet.

- [ ] **Step 3: Add settings to `backend/app/config.py`**

Add these three fields to `AppSettings`, after `log_level`:

```python
jwt_secret: str = Field()  # no default — Pydantic raises ValidationError on startup if absent
jwt_expiry_hours: int = 24
rate_limit_per_hour: int = 10
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_config_auth.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/tests/test_config_auth.py
git commit -m "feat: add jwt_secret, jwt_expiry_hours, rate_limit_per_hour settings"
```

---

## Task 3: Domain models

**Files:**
- Create: `backend/tests/test_domain_auth.py`
- Create: `backend/app/domain/auth.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_domain_auth.py`:

```python
"""Pydantic validation for auth request/response models."""
from __future__ import annotations

import os
import pytest
from pydantic import ValidationError

os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-only-xxxxxxxxx")


def test_register_request_valid():
    from app.domain.auth import RegisterRequest
    r = RegisterRequest(email="user@example.com", password="strongpass1")
    assert r.email == "user@example.com"


def test_register_password_too_short():
    from app.domain.auth import RegisterRequest
    with pytest.raises(ValidationError, match="at least 8"):
        RegisterRequest(email="a@b.com", password="short")


def test_register_password_too_long():
    from app.domain.auth import RegisterRequest
    with pytest.raises(ValidationError, match="72"):
        RegisterRequest(email="a@b.com", password="x" * 73)


def test_register_password_max_boundary_ok():
    from app.domain.auth import RegisterRequest
    RegisterRequest(email="a@b.com", password="x" * 72)  # must not raise


def test_register_invalid_email():
    from app.domain.auth import RegisterRequest
    with pytest.raises(ValidationError):
        RegisterRequest(email="not-an-email", password="validpass1")


def test_token_response_shape():
    from app.domain.auth import TokenResponse
    t = TokenResponse(access_token="abc.def.ghi", token_type="bearer")
    assert t.token_type == "bearer"
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_domain_auth.py -v
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Create `backend/app/domain/auth.py`**

```python
"""Pydantic models for authentication request and response contracts."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    email: EmailStr
    password: str = Field(
        min_length=8,
        max_length=72,
        description=(
            "8–72 characters. 72 is bcrypt's effective input limit; "
            "longer passwords are actively rejected to prevent silent truncation."
        ),
    )


class LoginRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    model_config = ConfigDict(frozen=True)

    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 4: Install `email-validator` (required for `EmailStr`)**

```bash
cd backend && uv add "email-validator>=2.2.0"
```

- [ ] **Step 5: Run tests to verify pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_domain_auth.py -v
```

Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/domain/auth.py backend/tests/test_domain_auth.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: add auth domain models with password length validation"
```

---

## Task 4: ORM models

**Files:**
- Create: `backend/tests/test_orm_models.py`
- Modify: `backend/app/persistence/models.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/test_orm_models.py`:

```python
"""Verify User and GenerationRequest ORM models have expected columns."""
from __future__ import annotations

import os

os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-only-xxxxxxxxx")


def test_user_model_columns():
    from app.persistence.models import User
    cols = {c.name for c in User.__table__.columns}
    assert cols == {"id", "email", "password_hash", "created_at"}


def test_generation_request_model_columns():
    from app.persistence.models import GenerationRequest
    cols = {c.name for c in GenerationRequest.__table__.columns}
    assert cols == {"id", "user_id", "requested_at"}


def test_generation_requests_has_composite_index():
    from app.persistence.models import GenerationRequest
    index_names = {idx.name for idx in GenerationRequest.__table__.indexes}
    assert "ix_generation_requests_user_time" in index_names
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_orm_models.py -v
```

Expected: `ImportError` — `User` and `GenerationRequest` don't exist yet.

- [ ] **Step 3: Add models to `backend/app/persistence/models.py`**

Add these imports after the existing imports at the top of the file:

```python
import uuid
from sqlalchemy import ForeignKey, Index, UniqueConstraint
```

Then append the two new model classes after `StoryRecord`:

```python
class User(Base):
    """Registered user account for authentication and rate limiting."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)


class GenerationRequest(Base):
    """Append-only log of story generation attempts for rate limiting."""

    __tablename__ = "generation_requests"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        Text, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_generation_requests_user_time", "user_id", "requested_at"),
    )
```

Note: IDs are stored as `Text` (UUID strings). Do NOT add a `UUID` dialect import — `Text` is used consistently throughout this codebase (see `StoryRecord`).

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_orm_models.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/persistence/models.py backend/tests/test_orm_models.py
git commit -m "feat: add User and GenerationRequest ORM models"
```

---

## Task 5: Alembic migrations

**Files:**
- Create: `backend/alembic/versions/20260319_0001_add_users_table.py`
- Create: `backend/alembic/versions/20260319_0002_add_generation_requests_table.py`

- [ ] **Step 1: Create `20260319_0001_add_users_table.py`**

```python
"""add users table

Revision ID: 20260319_0001
Revises: 20260315_0002
Create Date: 2026-03-19 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0001"
down_revision = "20260315_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create users table with unique email index."""

    op.create_table(
        "users",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )


def downgrade() -> None:
    op.drop_table("users")
```

- [ ] **Step 2: Create `20260319_0002_add_generation_requests_table.py`**

```python
"""add generation_requests table

Revision ID: 20260319_0002
Revises: 20260319_0001
Create Date: 2026-03-19 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260319_0002"
down_revision = "20260319_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create generation_requests with composite index for sliding-window queries."""

    op.create_table(
        "generation_requests",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column(
            "requested_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_generation_requests_user_time",
        "generation_requests",
        ["user_id", "requested_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_generation_requests_user_time", table_name="generation_requests")
    op.drop_table("generation_requests")
```

- [ ] **Step 3: Run migrations**

```bash
cd backend && DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
  ../.venv/bin/alembic upgrade head
```

Expected: both migrations applied with no errors.

- [ ] **Step 4: Verify tables exist**

```bash
psql -U mikha -d loreforge -c "\dt"
```

Expected: `users` and `generation_requests` in the list.

- [ ] **Step 5: Commit**

```bash
git add backend/alembic/versions/20260319_0001_add_users_table.py \
        backend/alembic/versions/20260319_0002_add_generation_requests_table.py
git commit -m "feat: add Alembic migrations for users and generation_requests tables"
```

---

## Task 6: auth_service

**Files:**
- Create: `backend/tests/test_auth_service.py`
- Create: `backend/app/services/auth_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_auth_service.py`:

```python
"""Unit tests for auth_service: password hashing and JWT operations."""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import jwt as pyjwt
import pytest

os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-only-xxxxxxxxx")


def test_hash_and_verify_password():
    from app.services.auth_service import hash_password, verify_password

    hashed = hash_password("correcthorse99")
    assert verify_password("correcthorse99", hashed)
    assert not verify_password("wronghorse", hashed)


def test_hash_is_not_plaintext():
    from app.services.auth_service import hash_password

    assert hash_password("mypassword") != "mypassword"


def test_create_and_decode_token():
    from app.services.auth_service import create_access_token, decode_access_token

    token = create_access_token(user_id="user-abc", email="a@test.com")
    payload = decode_access_token(token)
    assert payload["user_id"] == "user-abc"
    assert payload["email"] == "a@test.com"
    assert "exp" in payload


def test_expired_token_raises():
    from app.config import settings
    from app.services.auth_service import decode_access_token

    expired_payload = {
        "user_id": "user-abc",
        "email": "a@test.com",
        "exp": datetime.now(UTC) - timedelta(seconds=1),
    }
    token = pyjwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")
    with pytest.raises(Exception):
        decode_access_token(token)


def test_tampered_token_raises():
    from app.services.auth_service import create_access_token, decode_access_token

    token = create_access_token(user_id="user-abc", email="a@test.com")
    tampered = token[:-4] + "xxxx"
    with pytest.raises(Exception):
        decode_access_token(tampered)
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_auth_service.py -v
```

Expected: `ModuleNotFoundError` for `auth_service`.

- [ ] **Step 3: Create `backend/app/services/auth_service.py`**

```python
"""Password hashing and JWT operations for user authentication."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import bcrypt
import jwt as pyjwt

from app.config import settings


def hash_password(plain: str) -> str:
    """Hash a plain-text password with bcrypt. Must be ≤72 chars (enforced by domain model)."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the bcrypt hash."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str, email: str) -> str:
    """Issue a signed HS256 JWT with user_id, email, and expiry."""
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.now(UTC) + timedelta(hours=settings.jwt_expiry_hours),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    """Decode and verify a JWT. Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure."""
    return pyjwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_auth_service.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/auth_service.py backend/tests/test_auth_service.py
git commit -m "feat: add auth_service with bcrypt hashing and JWT sign/verify"
```

---

## Task 7: rate_limit_service

**Files:**
- Create: `backend/tests/test_rate_limit_service.py`
- Create: `backend/app/services/rate_limit_service.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_rate_limit_service.py`:

```python
"""Unit tests for rate_limit_service sliding-window logic."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-only-xxxxxxxxx")


def _make_session(user_found: bool, window_count: int, earliest_dt: datetime | None = None):
    """Build a mock AsyncSession that returns controlled results for execute() calls."""
    session = AsyncMock()

    @asynccontextmanager
    async def mock_begin():
        yield

    session.begin = mock_begin

    user_result = MagicMock()
    user_result.scalar_one_or_none.return_value = MagicMock() if user_found else None

    count_result = MagicMock()
    count_result.scalar_one.return_value = window_count

    earliest_result = MagicMock()
    earliest_result.scalar_one.return_value = earliest_dt

    if window_count >= 10 and user_found:
        session.execute = AsyncMock(side_effect=[user_result, count_result, earliest_result])
    else:
        session.execute = AsyncMock(side_effect=[user_result, count_result])

    return session


async def test_under_limit_inserts_record():
    from app.services.rate_limit_service import check_and_record

    session = _make_session(user_found=True, window_count=5)
    await check_and_record(user_id="user-1", session=session, limit=10)
    session.add.assert_called_once()


async def test_at_limit_raises_rate_limit_exceeded():
    from app.services.rate_limit_service import RateLimitExceeded, check_and_record

    earliest = datetime(2026, 3, 19, 14, 0, 0, tzinfo=UTC)
    session = _make_session(user_found=True, window_count=10, earliest_dt=earliest)

    with pytest.raises(RateLimitExceeded) as exc_info:
        await check_and_record(user_id="user-1", session=session, limit=10)

    expected_retry = earliest + timedelta(hours=1)
    assert exc_info.value.retry_after == expected_retry
    session.add.assert_not_called()


async def test_user_not_found_raises_401():
    from fastapi import HTTPException
    from app.services.rate_limit_service import check_and_record

    session = _make_session(user_found=False, window_count=0)

    with pytest.raises(HTTPException) as exc_info:
        await check_and_record(user_id="ghost", session=session, limit=10)

    assert exc_info.value.status_code == 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_rate_limit_service.py -v
```

Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Create `backend/app/services/rate_limit_service.py`**

```python
"""Sliding-window rate limiting using SELECT FOR UPDATE for atomicity."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.persistence.models import GenerationRequest, User


class RateLimitExceeded(Exception):
    """Raised when a user exceeds their hourly generation limit."""

    def __init__(self, retry_after: datetime) -> None:
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after.isoformat()}")


async def check_and_record(user_id: str, session: AsyncSession, limit: int) -> None:
    """Atomically check the sliding window and insert a new record if under limit.

    Uses SELECT FOR UPDATE on the user row to prevent concurrent requests from
    both reading count=limit-1 and both inserting, which would exceed the limit.

    Raises:
        HTTPException(401): if the user row is not found.
        RateLimitExceeded: if the user has reached their hourly limit.
    """
    window_start = datetime.now(UTC) - timedelta(hours=1)

    async with session.begin():
        # Acquire row lock to serialize concurrent requests for this user
        lock_result = await session.execute(
            select(User).where(User.id == user_id).with_for_update()
        )
        user = lock_result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")

        # Count requests in the sliding window
        count_result = await session.execute(
            select(func.count()).select_from(GenerationRequest).where(
                GenerationRequest.user_id == user_id,
                GenerationRequest.requested_at > window_start,
            )
        )
        count = count_result.scalar_one()

        if count >= limit:
            # Find the earliest slot — when it falls out, the next slot opens
            earliest_result = await session.execute(
                select(GenerationRequest.requested_at)
                .where(
                    GenerationRequest.user_id == user_id,
                    GenerationRequest.requested_at > window_start,
                )
                .order_by(GenerationRequest.requested_at.asc())
                .limit(1)
            )
            earliest = earliest_result.scalar_one()
            raise RateLimitExceeded(retry_after=earliest + timedelta(hours=1))

        # Under limit — record this attempt before generation starts
        session.add(
            GenerationRequest(
                id=str(uuid.uuid4()),
                user_id=user_id,
                requested_at=datetime.now(UTC),
            )
        )
        # Transaction commits automatically on context manager exit
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_rate_limit_service.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rate_limit_service.py backend/tests/test_rate_limit_service.py
git commit -m "feat: add rate_limit_service with SELECT FOR UPDATE sliding window"
```

---

## Task 8: FastAPI dependencies

**Files:**
- Create: `backend/tests/test_deps.py`
- Create: `backend/app/api/deps.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_deps.py`:

```python
"""Unit tests for FastAPI deps: get_current_user failure branches."""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import jwt as pyjwt
import pytest
from fastapi import HTTPException

os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-only-xxxxxxxxx")


async def test_missing_header_raises_401():
    from app.api.deps import get_current_user

    with pytest.raises(HTTPException) as exc:
        await get_current_user(authorization=None, session=AsyncMock())
    assert exc.value.status_code == 401


async def test_malformed_header_raises_401():
    from app.api.deps import get_current_user

    with pytest.raises(HTTPException) as exc:
        await get_current_user(authorization="Token notbearer", session=AsyncMock())
    assert exc.value.status_code == 401


async def test_expired_token_raises_401():
    from app.config import settings
    from app.api.deps import get_current_user

    expired = pyjwt.encode(
        {"user_id": "x", "email": "a@b.com", "exp": datetime.now(UTC) - timedelta(seconds=1)},
        settings.jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc:
        await get_current_user(authorization=f"Bearer {expired}", session=AsyncMock())
    assert exc.value.status_code == 401


async def test_valid_token_user_not_in_db_raises_401():
    from app.api.deps import get_current_user
    from app.services.auth_service import create_access_token

    token = create_access_token(user_id="ghost", email="ghost@test.com")
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(HTTPException) as exc:
        await get_current_user(authorization=f"Bearer {token}", session=mock_session)
    assert exc.value.status_code == 401


async def test_valid_token_returns_user():
    from app.api.deps import get_current_user
    from app.persistence.models import User
    from app.services.auth_service import create_access_token

    user = User(id=str(uuid.uuid4()), email="a@test.com", password_hash="x")
    token = create_access_token(user_id=user.id, email=user.email)
    mock_session = AsyncMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = user
    mock_session.execute = AsyncMock(return_value=mock_result)

    result = await get_current_user(authorization=f"Bearer {token}", session=mock_session)
    assert result is user
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_deps.py -v
```

Expected: `ModuleNotFoundError` — `app.api.deps` doesn't exist yet.

- [ ] **Step 3: Create `backend/app/api/deps.py`**

```python
"""FastAPI injectable dependencies for authentication and rate limiting."""

from __future__ import annotations

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.persistence.db import get_session
from app.persistence.models import User
from app.services.auth_service import decode_access_token
from app.services.rate_limit_service import check_and_record


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Validate Bearer JWT and return the authenticated user. Raises 401 on any failure."""

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = decode_access_token(token)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await session.execute(select(User).where(User.id == payload["user_id"]))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def check_rate_limit(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    """Enforce per-user sliding-window rate limit.

    Note: `session` here is a SEPARATE AsyncSession from the one injected into
    `get_current_user`. FastAPI creates one session per Depends(get_session) call.
    This is intentional: `check_and_record` opens its own transaction with
    SELECT FOR UPDATE, which must not share a session with the auth lookup.
    """
    await check_and_record(
        user_id=current_user.id,
        session=session,
        limit=settings.rate_limit_per_hour,
    )
```

- [ ] **Step 4: Run tests to verify pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_deps.py -v
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/deps.py backend/tests/test_deps.py
git commit -m "feat: add get_current_user and check_rate_limit FastAPI dependencies"
```

---

## Task 9: Auth endpoints

**Files:**
- Create: `backend/tests/test_auth_endpoints.py`
- Create: `backend/app/api/v1/auth.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_auth_endpoints.py`:

```python
"""Tests for auth endpoints using ASGI test client with mocked DB session."""

from __future__ import annotations

import os
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("JWT_SECRET", "test-secret-for-unit-tests-only-xxxxxxxxx")


@pytest.fixture
def app():
    from app.main import create_app
    return create_app()


def _mock_session_factory(scalar_result):
    """Return an async session override where execute() returns the given scalar result."""
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = scalar_result

    mock_session = AsyncMock()
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    mock_session.commit = AsyncMock()

    async def override():
        yield mock_session

    return override, mock_session


async def test_register_returns_201_with_token(app):
    from app.persistence.db import get_session

    override, _ = _mock_session_factory(scalar_result=None)  # email not taken
    app.dependency_overrides[get_session] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/register",
            json={"email": "new@example.com", "password": "strongpass1"},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 201
    body = resp.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


async def test_register_duplicate_email_returns_409(app):
    from app.persistence.db import get_session

    existing_user = MagicMock()
    override, _ = _mock_session_factory(scalar_result=existing_user)
    app.dependency_overrides[get_session] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/register",
            json={"email": "taken@example.com", "password": "strongpass1"},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 409


async def test_login_valid_credentials_returns_token(app):
    from app.persistence.db import get_session
    from app.persistence.models import User
    from app.services.auth_service import hash_password

    user = User(
        id=str(uuid.uuid4()),
        email="user@example.com",
        password_hash=hash_password("correctpassword"),
    )
    override, _ = _mock_session_factory(scalar_result=user)
    app.dependency_overrides[get_session] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "correctpassword"},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert "access_token" in resp.json()


async def test_login_wrong_password_returns_401(app):
    from app.persistence.db import get_session
    from app.persistence.models import User
    from app.services.auth_service import hash_password

    user = User(
        id=str(uuid.uuid4()),
        email="user@example.com",
        password_hash=hash_password("correctpassword"),
    )
    override, _ = _mock_session_factory(scalar_result=user)
    app.dependency_overrides[get_session] = override

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "wrongpassword"},
        )

    app.dependency_overrides.clear()
    assert resp.status_code == 401
```

- [ ] **Step 2: Run to verify failure**

```bash
cd backend && ../.venv/bin/pytest tests/test_auth_endpoints.py -v
```

Expected: all four tests fail with assertion errors — `create_app()` doesn't include the auth router yet, so every call returns 404 instead of the expected 201/409/200/401.

- [ ] **Step 3: Create `backend/app/api/v1/auth.py`**

```python
"""Authentication endpoints: register and login."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.auth import LoginRequest, RegisterRequest, TokenResponse
from app.persistence.db import get_session
from app.persistence.models import User
from app.services.auth_service import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=201)
async def register(
    request: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Register a new user and return a JWT access token."""

    result = await session.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        id=str(uuid.uuid4()),
        email=request.email,
        password_hash=hash_password(request.password),
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        # Concurrent registration with the same email hit the unique constraint
        await session.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")

    return TokenResponse(access_token=create_access_token(user.id, user.email))


@router.post("/login")
async def login(
    request: LoginRequest,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Verify credentials and return a JWT access token."""

    result = await session.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(access_token=create_access_token(user.id, user.email))
```

**Note on green phase:** The four endpoint tests in `test_auth_endpoints.py` cannot pass until the auth router is registered in Task 10. Their green-phase verification is Step 3 of Task 10 (`pytest tests/ -v`). Commit now and confirm green in Task 10.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/auth.py backend/tests/test_auth_endpoints.py
git commit -m "feat: add register and login endpoints"
```

---

## Task 10: Wire the app

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/v1/stories.py`

- [ ] **Step 1: Register auth router and `RateLimitExceeded` handler in `backend/app/main.py`**

Add to imports at the top:

```python
from email.utils import formatdate

from fastapi.responses import JSONResponse

from app.api.v1.auth import router as auth_router
from app.services.rate_limit_service import RateLimitExceeded
```

In `create_app()`, after `app.include_router(stories_router, prefix="/api/v1")`, add:

```python
    app.include_router(auth_router, prefix="/api/v1")

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        retry_iso = exc.retry_after.isoformat()
        retry_http = formatdate(exc.retry_after.timestamp(), usegmt=True)
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded", "retry_after": retry_iso},
            headers={"Retry-After": retry_http},
        )
```

Note: `Request` is already imported from `fastapi` in `main.py`.

- [ ] **Step 2: Inject `check_rate_limit` into stories endpoint**

In `backend/app/api/v1/stories.py`, add import:

```python
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import check_rate_limit
```

Change the `generate_long_form_story` signature to:

```python
@router.post("/generate-long-form")
async def generate_long_form_story(
    request: LongFormRequest,
    _: None = Depends(check_rate_limit),
) -> StreamingResponse:
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && ../.venv/bin/pytest tests/ -v --ignore=tests/test_auth_integration.py
```

Expected: all tests pass, including `test_auth_endpoints.py`.

- [ ] **Step 4: Smoke test the running server**

```bash
# Terminal 1 — start server
cd backend && JWT_SECRET='dev-secret-min-32-chars-xxxxxxxxxxxx' \
  DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
  ../.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 — register then login
curl -s -X POST http://127.0.0.1:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpassword1"}' | python3 -m json.tool

curl -s -X POST http://127.0.0.1:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"testpassword1"}' | python3 -m json.tool
```

Expected: both return `{"access_token": "...", "token_type": "bearer"}`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/main.py backend/app/api/v1/stories.py
git commit -m "feat: wire auth router and rate limit guard into story generation"
```

---

## Task 11: Integration tests

**Files:**
- Create: `backend/tests/test_auth_integration.py`

These tests require a running PostgreSQL with migrations applied. Run with the `integration` marker.

- [ ] **Step 1: Create `backend/tests/test_auth_integration.py`**

```python
"""Integration tests: full register → login → generate flow against a real DB.

Run with:
    DATABASE_URL='postgresql+asyncpg://...' JWT_SECRET='...' \
    USE_STUB_LLM=true pytest -m integration tests/test_auth_integration.py -v
"""

from __future__ import annotations

import os
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.integration

os.environ.setdefault("JWT_SECRET", os.environ.get("JWT_SECRET", "integration-test-secret-min-32ch!!"))
os.environ.setdefault("USE_STUB_LLM", "true")


@pytest.fixture
async def client():
    from app.main import create_app
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def test_register_and_login_flow(client):
    email = f"integ-{uuid.uuid4()}@test.com"

    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "integpassword1"},
    )
    assert reg.status_code == 201
    assert "access_token" in reg.json()

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "integpassword1"},
    )
    assert login.status_code == 200
    assert "access_token" in login.json()


async def test_unauthenticated_generate_returns_401(client):
    resp = await client.post(
        "/api/v1/stories/generate-long-form",
        json={
            "context": {"user_prompt": "A story"},
            "vibe": {"aggression": 50, "reader_respect": 50, "morality": 50, "source_fidelity": 50},
            "provider": {"provider": "ollama", "model": "gpt-oss:20b"},
        },
    )
    assert resp.status_code == 401


async def test_rate_limit_enforced(client):
    """Register a fresh user, exhaust their limit, verify 429 on the next request."""
    email = f"ratelimit-{uuid.uuid4()}@test.com"

    reg = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpassword1"},
    )
    token = reg.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "context": {"user_prompt": "A story"},
        "vibe": {"aggression": 50, "reader_respect": 50, "morality": 50, "source_fidelity": 50},
        "provider": {"provider": "ollama", "model": "gpt-oss:20b"},
        "chapter_count": 2,
    }

    limit = int(os.environ.get("RATE_LIMIT_PER_HOUR", "10"))
    for _ in range(limit):
        resp = await client.post(
            "/api/v1/stories/generate-long-form", headers=headers, json=payload
        )
        assert resp.status_code != 429

    resp = await client.post(
        "/api/v1/stories/generate-long-form", headers=headers, json=payload
    )
    assert resp.status_code == 429
    body = resp.json()
    assert "retry_after" in body
    assert "Retry-After" in resp.headers
```

- [ ] **Step 2: Commit**

```bash
git add backend/tests/test_auth_integration.py
git commit -m "test: add auth integration tests (register, login, rate limit)"
```

---

## Task 12: Frontend — AuthModal component

**Files:**
- Create: `frontend/src/components/auth-modal.tsx`

- [ ] **Step 1: Create `frontend/src/components/auth-modal.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuthModalProps {
  onAuthenticated: (token: string) => void;
}

type Mode = "login" | "register";

export function AuthModal({ onAuthenticated }: AuthModalProps) {
  const [mode, setMode]         = useState<Mode>("login");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    const endpoint = mode === "login"
      ? "/api/v1/auth/login"
      : "/api/v1/auth/register";

    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (resp.status === 409) { setError("Email already registered."); return; }
      if (resp.status === 401) { setError("Invalid email or password."); return; }
      if (!resp.ok) { setError("Something went wrong. Please try again."); return; }

      const { access_token } = await resp.json() as { access_token: string };
      localStorage.setItem("lf_token", access_token);
      onAuthenticated(access_token);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-zinc-900 p-8 shadow-2xl">
        <h2 className="mb-6 text-xl font-semibold text-white">
          {mode === "login" ? "Sign in" : "Create account"}
        </h2>

        <div className="space-y-4">
          <div>
            <Label htmlFor="auth-email" className="text-zinc-300">Email</Label>
            <Input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1"
              disabled={loading}
            />
          </div>

          <div>
            <Label htmlFor="auth-password" className="text-zinc-300">Password</Label>
            <Input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === "register" ? "8–72 characters" : ""}
              className="mt-1"
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button
            onClick={submit}
            disabled={loading || !email || !password}
            className="w-full"
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>
        </div>

        <p className="mt-4 text-center text-sm text-zinc-500">
          {mode === "login" ? (
            <>No account?{" "}
              <button
                onClick={() => { setMode("register"); setError(null); }}
                className="text-zinc-300 underline hover:text-white"
              >Register</button></>
          ) : (
            <>Already registered?{" "}
              <button
                onClick={() => { setMode("login"); setError(null); }}
                className="text-zinc-300 underline hover:text-white"
              >Sign in</button></>
          )}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `auth-modal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/auth-modal.tsx
git commit -m "feat: add AuthModal component for login/register"
```

---

## Task 13: Frontend — update use-long-form-stream.tsx

**Files:**
- Modify: `frontend/src/components/use-long-form-stream.tsx`

- [ ] **Step 1: Add `rate_limited` and `unauthorized` to `StreamStatus`**

Find and replace the `StreamStatus` type:

```typescript
// BEFORE
export type StreamStatus =
  | { code: "ready" }
  | { code: "connecting" }
  | { code: "outline_ready" }
  | { code: "writing_chapter"; chapter: number }
  | { code: "revising_chapter"; chapter: number; attempt: number }
  | { code: "complete" }
  | { code: "error" }
  | { code: "backend"; message: string };

// AFTER
export type StreamStatus =
  | { code: "ready" }
  | { code: "connecting" }
  | { code: "outline_ready" }
  | { code: "writing_chapter"; chapter: number }
  | { code: "revising_chapter"; chapter: number; attempt: number }
  | { code: "complete" }
  | { code: "error" }
  | { code: "backend"; message: string }
  | { code: "rate_limited"; retryAfter: string }
  | { code: "unauthorized" };
```

- [ ] **Step 2: Add `token` to `GenerateLongFormArgs`**

Find and replace the interface:

```typescript
// BEFORE
interface GenerateLongFormArgs {
  draft: StoryDraftInput;
  providerConfig: ProviderConfig;
  chapterCount: number;
  chapterWordTarget: number;
}

// AFTER
interface GenerateLongFormArgs {
  draft: StoryDraftInput;
  providerConfig: ProviderConfig;
  chapterCount: number;
  chapterWordTarget: number;
  token: string;
}
```

- [ ] **Step 3: Thread `token` into `generateLongForm`**

In `generateLongForm`, add `token` to the destructure:

```typescript
// BEFORE
  const generateLongForm = useCallback(async ({
    draft,
    providerConfig,
    chapterCount,
    chapterWordTarget,
  }: GenerateLongFormArgs): Promise<void> => {

// AFTER
  const generateLongForm = useCallback(async ({
    draft,
    providerConfig,
    chapterCount,
    chapterWordTarget,
    token,
  }: GenerateLongFormArgs): Promise<void> => {
```

- [ ] **Step 4: Pass `Authorization` header and handle 401/429**

Find and replace the fetch call and its immediate error check:

```typescript
// BEFORE
      const response = await fetch(ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

// AFTER
      const response = await fetch(ENDPOINT, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body:    JSON.stringify(payload),
        signal:  controller.signal,
      });

      if (response.status === 401) {
        setStreamStatus({ code: "unauthorized" });
        return;
      }

      if (response.status === 429) {
        const body = await response.json() as { retry_after?: string };
        setStreamStatus({ code: "rate_limited", retryAfter: body.retry_after ?? "" });
        return;
      }

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/use-long-form-stream.tsx
git commit -m "feat: pass Authorization header and handle 401/429 in stream hook"
```

---

## Task 14: Frontend — update vibe-controller.tsx

**Files:**
- Modify: `frontend/src/components/vibe-controller.tsx`

- [ ] **Step 1: Check existing imports at the top of the file**

Open `frontend/src/components/vibe-controller.tsx` and check which of these are already imported. Add any that are missing:

```typescript
import { useEffect, useState } from "react";   // useState likely present; add useEffect if missing
import { AuthModal } from "@/components/auth-modal";
```

- [ ] **Step 2: Add token state inside the `VibeController` function body**

Inside the component, before the first existing `useState` call, add:

```typescript
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("lf_token");
    if (stored) setToken(stored);
  }, []);

  const handleAuthenticated = (newToken: string) => setToken(newToken);

  const handleLogout = () => {
    localStorage.removeItem("lf_token");
    setToken(null);
  };
```

- [ ] **Step 3: Show `AuthModal` when unauthenticated**

At the very top of the component's returned JSX (just inside the outermost `<div>` or fragment), add:

```tsx
    {!token && <AuthModal onAuthenticated={handleAuthenticated} />}
```

- [ ] **Step 4: Pass `token` to `generateLongForm`**

Find the call to `generateLongForm(...)` and add `token: token ?? ""` to the args object passed in.

- [ ] **Step 5: Display rate limit and unauthorized messages**

Find the area where `streamStatus` drives UI feedback (look for `streamError` display or `streamStatus.code === "error"`). Add adjacent to that:

```tsx
    {streamStatus.code === "rate_limited" && (
      <p className="text-sm text-amber-400">
        Limit reached. Try again at{" "}
        {new Date(streamStatus.retryAfter).toLocaleTimeString([], {
          hour:   "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
        .
      </p>
    )}
    {streamStatus.code === "unauthorized" && (
      <p className="text-sm text-red-400">
        Session expired.{" "}
        <button onClick={handleLogout} className="underline">
          Sign in again
        </button>
      </p>
    )}
```

- [ ] **Step 6: Verify TypeScript compiles and lint passes**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/vibe-controller.tsx
git commit -m "feat: add auth gate and rate limit display to VibeController"
```

---

## Task 15: Frontend E2E tests

**Files:**
- Modify: `frontend/e2e/long-story-generation.spec.ts`

- [ ] **Step 1: Add `data-testid` attributes if missing**

Check `vibe-controller.tsx` for `data-testid="story-prompt"` on the story Textarea and `data-testid="generate-button"` on the generate Button. Add them if absent — the E2E tests rely on them.

- [ ] **Step 2: Add rate limit and unauthorized describe block**

Append a new `describe` block to `frontend/e2e/long-story-generation.spec.ts`:

```typescript
describe("auth and rate limiting", () => {
  test("shows rate limit message when backend returns 429", async ({ page }) => {
    await page.goto("/");
    // Pre-seed localStorage so AuthModal does not appear
    await page.evaluate(() => localStorage.setItem("lf_token", "fake.jwt.token"));
    await page.reload();

    // Intercept story generation with a 429 response
    const retryAfter = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    await page.route("**/api/v1/stories/generate-long-form", async route => {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Rate limit exceeded", retry_after: retryAfter }),
      });
    });

    await page.fill('[data-testid="story-prompt"]', "A lone wanderer");
    await page.click('[data-testid="generate-button"]');

    await expect(page.getByText(/Limit reached\. Try again at/)).toBeVisible();
  });

  test("shows session expired prompt when backend returns 401", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("lf_token", "expired.jwt.token"));
    await page.reload();

    await page.route("**/api/v1/stories/generate-long-form", async route => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Token has expired" }),
      });
    });

    await page.fill('[data-testid="story-prompt"]', "A lone wanderer");
    await page.click('[data-testid="generate-button"]');

    await expect(page.getByText(/Session expired/)).toBeVisible();
  });
});
```

- [ ] **Step 3: Run E2E tests**

```bash
cd frontend && npm run e2e
```

Expected: new tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/e2e/long-story-generation.spec.ts
git commit -m "test: add E2E tests for 429 rate limit and 401 session expiry"
```

---

## Final verification

```bash
# All backend unit tests (no integration)
cd backend && ../.venv/bin/pytest tests/ -v --ignore=tests/test_auth_integration.py

# Frontend lint + type check
cd frontend && npm run lint && npx tsc --noEmit

# Frontend E2E
cd frontend && npm run e2e
```
