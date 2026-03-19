# User Auth & Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email/password user accounts and a per-user sliding-window rate limit of 10 story generation requests per hour, with matching frontend login/register UI and 429 handling.

**Architecture:** JWT-based auth (HS256) issued on register/login and verified per request via a FastAPI dependency chain (`get_current_user` → `check_rate_limit`). Rate limiting uses a `generation_requests` append-only table with `SELECT FOR UPDATE` to prevent concurrent-request bypass. A custom `RateLimitExceeded` exception + handler produces the exact spec body shape (`{"detail": "...", "retry_after": "..."}`).

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy async + Alembic + PyJWT + bcrypt; React 19 + Next.js App Router + Tailwind + Radix UI

**Spec:** `docs/superpowers/specs/2026-03-19-user-auth-rate-limiting-design.md`

---

## File Map

### New files
| Path | Responsibility |
|------|---------------|
| `backend/app/domain/auth.py` | Pydantic I/O models: `RegisterRequest`, `LoginRequest`, `TokenResponse` |
| `backend/app/services/auth_service.py` | Password hash/verify, JWT issue/verify (pure functions, no DB) |
| `backend/app/services/rate_limit_service.py` | `check_rate_limit_and_record()` — sliding window count + insert, no transaction management |
| `backend/app/api/deps.py` | `RateLimitExceeded` exception class; `get_current_user` and `check_rate_limit` FastAPI deps |
| `backend/app/api/v1/auth.py` | `POST /api/v1/auth/register` and `POST /api/v1/auth/login` |
| `backend/alembic/versions/20260319_0001_add_users_table.py` | `users` table migration |
| `backend/alembic/versions/20260319_0002_add_generation_requests_table.py` | `generation_requests` table + composite index |
| `backend/tests/conftest.py` | Async test DB session + test app client fixtures |
| `backend/tests/test_auth_domain.py` | Unit tests: password length boundaries, email validation |
| `backend/tests/test_auth_service.py` | Unit tests: hash, verify, JWT issue/verify/expiry |
| `backend/tests/test_rate_limit_service.py` | Unit tests: under-limit inserts row, at-limit returns retry_after |
| `backend/tests/test_auth_integration.py` | Integration: register, login, full flow, rate limit, concurrent requests |
| `frontend/src/components/auth-modal.tsx` | Login/register modal; stores JWT in localStorage |

### Modified files
| Path | Change |
|------|--------|
| `backend/pyproject.toml` | Add `PyJWT[cryptography]`, `bcrypt`, `email-validator`, `pytest-asyncio`, `httpx` |
| `backend/app/config.py` | Add `jwt_secret`, `jwt_expiry_hours`, `rate_limit_per_hour` settings |
| `backend/app/persistence/models.py` | Add `User` and `GenerationRequest` ORM models |
| `backend/app/main.py` | Register auth router at `/api/v1/auth`; add `RateLimitExceeded` exception handler |
| `backend/app/api/v1/stories.py` | Add `Depends(check_rate_limit)` to `generate_long_form_story` |
| `frontend/src/components/use-long-form-stream.tsx` | Add `token` arg, `Authorization` header, surface 429/401 as new `StreamStatus` codes |
| `frontend/src/components/vibe-controller.tsx` | Show `AuthModal` when unauthenticated; display 429 retry message |

---

## Design notes for implementors

**Why `rate_limit_service.py` does not manage its own transaction:**
`check_rate_limit_and_record(db, user_id, limit)` assumes the caller has already started a transaction (and the `SELECT FOR UPDATE` lock is active). This keeps the function pure and mockable. The caller (`check_rate_limit` dep) owns the transaction boundary.

**Why `check_rate_limit` uses `session_factory()` directly instead of `Depends(get_session)`:**
FastAPI caches dependency results within a request. Both `get_current_user` and `check_rate_limit` declare `Depends(get_session)` — they would receive the SAME session instance. If `get_current_user` has already issued a query (triggering SQLAlchemy autobegin), calling `async with db.begin()` on that session raises `InvalidRequestError`. By having `check_rate_limit` call `session_factory()` directly, it gets a fresh session with no prior transaction.

**Why `RateLimitExceeded` is a custom exception (not `HTTPException`):**
FastAPI wraps `HTTPException.detail` in `{"detail": <value>}`. So `HTTPException(detail={"detail": "...", "retry_after": "..."})` produces `{"detail": {"detail": "...", "retry_after": "..."}}` — nested, not flat. A custom exception handler returns a `JSONResponse` directly, producing the exact spec body: `{"detail": "Rate limit exceeded", "retry_after": "..."}`.

---

## Task 1: Python dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add new dependencies**

  Open `backend/pyproject.toml` and add to the `dependencies` list:
  ```toml
  "PyJWT[cryptography]>=2.10.0",
  "bcrypt>=4.3.0",
  "email-validator>=2.2.0",
  "httpx>=0.28.0",
  "pytest-asyncio>=0.25.0",
  ```

- [ ] **Step 2: Install**

  ```bash
  cd backend && ../.venv/bin/pip install "PyJWT[cryptography]>=2.10.0" "bcrypt>=4.3.0" "email-validator>=2.2.0" "httpx>=0.28.0" "pytest-asyncio>=0.25.0"
  ```
  Expected: all packages install without errors.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/pyproject.toml
  git commit -m "chore: add PyJWT, bcrypt, email-validator, httpx, pytest-asyncio deps"
  ```

---

## Task 2: Config settings

**Files:**
- Modify: `backend/app/config.py`

- [ ] **Step 1: Write a failing test**

  Create `backend/tests/test_config_auth_settings.py`:
  ```python
  """Verify that auth-related settings are declared in AppSettings."""
  import os

  os.environ.setdefault("JWT_SECRET", "test-secret-for-testing-only")

  from app.config import AppSettings


  def test_jwt_secret_field_exists() -> None:
      assert "jwt_secret" in AppSettings.model_fields


  def test_jwt_expiry_hours_defaults_to_24() -> None:
      from importlib import reload
      import app.config as cfg
      reload(cfg)
      assert cfg.settings.jwt_expiry_hours == 24


  def test_rate_limit_per_hour_defaults_to_10() -> None:
      from importlib import reload
      import app.config as cfg
      reload(cfg)
      assert cfg.settings.rate_limit_per_hour == 10
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_config_auth_settings.py -v
  ```
  Expected: FAIL — `jwt_secret` not in fields.

- [ ] **Step 3: Add settings to AppSettings**

  In `backend/app/config.py`, add to the `AppSettings` class (after `log_level`):
  ```python
  jwt_secret: str              # required — no default; Pydantic raises ValidationError on startup if absent
  jwt_expiry_hours: int = 24
  rate_limit_per_hour: int = 10
  ```

  > In Pydantic v2, a field with type annotation and no default value is required. `JWT_SECRET` env var must be present at startup.

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_config_auth_settings.py -v
  ```
  Expected: 3 PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/config.py backend/tests/test_config_auth_settings.py
  git commit -m "feat: add JWT_SECRET, JWT_EXPIRY_HOURS, RATE_LIMIT_PER_HOUR settings"
  ```

---

## Task 3: ORM models

**Files:**
- Modify: `backend/app/persistence/models.py`

- [ ] **Step 1: Write a failing test**

  Create `backend/tests/test_orm_models.py`:
  ```python
  """Verify User and GenerationRequest ORM models have expected columns and indexes."""
  from app.persistence.models import GenerationRequest, User


  def test_user_model_columns() -> None:
      cols = {c.name for c in User.__table__.columns}
      assert cols == {"id", "email", "password_hash", "created_at"}


  def test_user_email_unique_index() -> None:
      indexes = {idx.name for idx in User.__table__.indexes}
      assert any("email" in name for name in indexes)


  def test_generation_request_model_columns() -> None:
      cols = {c.name for c in GenerationRequest.__table__.columns}
      assert cols == {"id", "user_id", "requested_at"}


  def test_generation_request_composite_index() -> None:
      col_sets = [
          {c.name for c in idx.columns}
          for idx in GenerationRequest.__table__.indexes
      ]
      assert {"user_id", "requested_at"} in col_sets
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_orm_models.py -v
  ```
  Expected: FAIL — `User` not importable.

- [ ] **Step 3: Add ORM models**

  In `backend/app/persistence/models.py`, add these imports alongside the existing ones at the top:
  ```python
  import uuid
  from sqlalchemy import ForeignKey, Index
  ```

  Then add after the existing `StoryRecord` class:
  ```python
  class User(Base):
      """Registered LoreForge user with bcrypt-hashed password."""

      __tablename__ = "users"

      id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
      email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
      password_hash: Mapped[str] = mapped_column(Text, nullable=False)
      created_at: Mapped[datetime] = mapped_column(
          DateTime(timezone=True), nullable=False, server_default=func.now()
      )

      __table_args__ = (Index("ix_users_email", "email", unique=True),)


  class GenerationRequest(Base):
      """Append-only log of story generation attempts used for per-user rate limiting."""

      __tablename__ = "generation_requests"

      id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
      user_id: Mapped[str] = mapped_column(
          Text, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
      )
      requested_at: Mapped[datetime] = mapped_column(
          DateTime(timezone=True), nullable=False, server_default=func.now()
      )

      __table_args__ = (
          Index("ix_generation_requests_user_id_requested_at", "user_id", "requested_at"),
      )
  ```

  > `datetime`, `DateTime`, `Text`, `func`, `Mapped`, `mapped_column` are already imported at the top of `models.py`. Only `uuid`, `ForeignKey`, and `Index` need to be added.

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_orm_models.py -v
  ```
  Expected: 4 PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/persistence/models.py backend/tests/test_orm_models.py
  git commit -m "feat: add User and GenerationRequest ORM models"
  ```

---

## Task 4: Alembic migrations

**Files:**
- Create: `backend/alembic/versions/20260319_0001_add_users_table.py`
- Create: `backend/alembic/versions/20260319_0002_add_generation_requests_table.py`

- [ ] **Step 1: Confirm current head revision**

  ```bash
  cd backend && DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
    ../.venv/bin/alembic heads
  ```
  Expected: `20260315_0002 (head)`. The first new migration's `down_revision` must match this exactly.

- [ ] **Step 2: Create users migration**

  Create `backend/alembic/versions/20260319_0001_add_users_table.py`:
  ```python
  """add users table

  Revision ID: 20260319_0001
  Revises: 20260315_0002
  Create Date: 2026-03-19
  """
  from __future__ import annotations

  import sqlalchemy as sa
  from alembic import op

  revision = "20260319_0001"
  down_revision = "20260315_0002"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.create_table(
          "users",
          sa.Column("id", sa.Text, primary_key=True),
          sa.Column("email", sa.Text, nullable=False),
          sa.Column("password_hash", sa.Text, nullable=False),
          sa.Column(
              "created_at",
              sa.DateTime(timezone=True),
              nullable=False,
              server_default=sa.text("now()"),
          ),
      )
      op.create_index("ix_users_email", "users", ["email"], unique=True)


  def downgrade() -> None:
      op.drop_index("ix_users_email", table_name="users")
      op.drop_table("users")
  ```

- [ ] **Step 3: Create generation_requests migration**

  Create `backend/alembic/versions/20260319_0002_add_generation_requests_table.py`:
  ```python
  """add generation_requests table

  Revision ID: 20260319_0002
  Revises: 20260319_0001
  Create Date: 2026-03-19
  """
  from __future__ import annotations

  import sqlalchemy as sa
  from alembic import op

  revision = "20260319_0002"
  down_revision = "20260319_0001"
  branch_labels = None
  depends_on = None


  def upgrade() -> None:
      op.create_table(
          "generation_requests",
          sa.Column("id", sa.Text, primary_key=True),
          sa.Column(
              "user_id",
              sa.Text,
              sa.ForeignKey("users.id", ondelete="RESTRICT"),
              nullable=False,
          ),
          sa.Column(
              "requested_at",
              sa.DateTime(timezone=True),
              nullable=False,
              server_default=sa.text("now()"),
          ),
      )
      op.create_index(
          "ix_generation_requests_user_id_requested_at",
          "generation_requests",
          ["user_id", "requested_at"],
      )


  def downgrade() -> None:
      op.drop_index(
          "ix_generation_requests_user_id_requested_at",
          table_name="generation_requests",
      )
      op.drop_table("generation_requests")
  ```

- [ ] **Step 4: Run migrations**

  ```bash
  cd backend && DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
    ../.venv/bin/alembic upgrade head
  ```
  Expected: "Running upgrade ... -> 20260319_0001 ... Running upgrade ... -> 20260319_0002"

- [ ] **Step 5: Verify tables exist**

  ```bash
  PGPASSWORD=postgres psql -U mikha -d loreforge -h 127.0.0.1 -c "\dt"
  ```
  Expected: `users` and `generation_requests` listed.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/alembic/versions/20260319_0001_add_users_table.py \
          backend/alembic/versions/20260319_0002_add_generation_requests_table.py
  git commit -m "feat: Alembic migrations for users and generation_requests tables"
  ```

---

## Task 5: Domain models (Pydantic)

**Files:**
- Create: `backend/app/domain/auth.py`
- Create: `backend/tests/test_auth_domain.py`

- [ ] **Step 1: Write failing tests**

  Create `backend/tests/test_auth_domain.py`:
  ```python
  """Validate RegisterRequest password length and email format enforcement."""
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
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_domain.py -v
  ```
  Expected: FAIL — `app.domain.auth` not found.

- [ ] **Step 3: Create domain/auth.py**

  Create `backend/app/domain/auth.py`:
  ```python
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
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_domain.py -v
  ```
  Expected: 6 PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/domain/auth.py backend/tests/test_auth_domain.py
  git commit -m "feat: add auth domain models with password length and email validation"
  ```

---

## Task 6: auth_service.py

**Files:**
- Create: `backend/app/services/auth_service.py`
- Create: `backend/tests/test_auth_service.py`

- [ ] **Step 1: Write failing unit tests**

  Create `backend/tests/test_auth_service.py`:
  ```python
  """Unit tests for auth_service — password hashing and JWT operations."""

  from __future__ import annotations

  import os

  import pytest

  os.environ["JWT_SECRET"] = "test-secret-for-unit-tests-only"

  from app.services.auth_service import hash_password, issue_token, verify_password, verify_token


  def test_hash_returns_bcrypt_string() -> None:
      h = hash_password("mypassword")
      assert h.startswith("$2b$") or h.startswith("$2a$")


  def test_hash_is_not_plaintext() -> None:
      assert hash_password("mypassword") != "mypassword"


  def test_verify_correct_password() -> None:
      assert verify_password("correct_horse", hash_password("correct_horse")) is True


  def test_verify_wrong_password() -> None:
      assert verify_password("wrong_horse", hash_password("correct_horse")) is False


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

      payload = {
          "user_id": "user-abc",
          "email": "x@y.com",
          "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
      }
      expired = pyjwt.encode(payload, "test-secret-for-unit-tests-only", algorithm="HS256")
      with pytest.raises(pyjwt.ExpiredSignatureError):
          verify_token(expired)
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_service.py -v
  ```
  Expected: FAIL — `app.services.auth_service` not found.

- [ ] **Step 3: Create auth_service.py**

  Create `backend/app/services/auth_service.py`:
  ```python
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
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_auth_service.py -v
  ```
  Expected: 8 PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/services/auth_service.py backend/tests/test_auth_service.py
  git commit -m "feat: add auth_service with bcrypt hashing and JWT issue/verify"
  ```

---

## Task 7: rate_limit_service.py

**Files:**
- Create: `backend/app/services/rate_limit_service.py`
- Create: `backend/tests/test_rate_limit_service.py`

This module contains the sliding-window logic. It takes an already-open session (transaction started by the caller) and a user_id. It does not raise HTTP exceptions — it returns `None` on pass and the `retry_after` datetime on limit exceeded.

- [ ] **Step 1: Write failing unit tests**

  Create `backend/tests/test_rate_limit_service.py`:
  ```python
  """Unit tests for rate_limit_service sliding window logic."""

  from __future__ import annotations

  import os
  import uuid
  from datetime import datetime, timedelta, timezone
  from unittest.mock import AsyncMock, MagicMock

  import pytest

  os.environ.setdefault("JWT_SECRET", "test-secret")

  from app.services.rate_limit_service import check_rate_limit_and_record


  def _make_session(user_found: bool, count: int, earliest: datetime | None = None) -> AsyncMock:
      """Build a mock AsyncSession for given scenario."""
      session = AsyncMock()

      # First execute: SELECT FOR UPDATE → user row
      user_row = MagicMock() if user_found else None
      user_result = MagicMock()
      user_result.scalar_one_or_none.return_value = user_row

      # Second execute: COUNT
      count_result = MagicMock()
      count_result.scalar_one.return_value = count

      side_effects = [user_result, count_result]

      if count >= 10 and earliest is not None:
          # Third execute: SELECT MIN(requested_at)
          earliest_result = MagicMock()
          earliest_result.scalar_one.return_value = earliest
          side_effects.append(earliest_result)

      session.execute.side_effect = side_effects
      return session


  @pytest.mark.asyncio
  async def test_under_limit_inserts_row() -> None:
      session = _make_session(user_found=True, count=5)
      result = await check_rate_limit_and_record(session, "user-123", limit=10)
      assert result is None
      session.add.assert_called_once()


  @pytest.mark.asyncio
  async def test_at_limit_returns_retry_after_and_does_not_insert() -> None:
      earliest = datetime(2026, 3, 19, 14, 32, tzinfo=timezone.utc)
      session = _make_session(user_found=True, count=10, earliest=earliest)
      result = await check_rate_limit_and_record(session, "user-123", limit=10)
      expected_retry_after = earliest + timedelta(hours=1)
      assert result == expected_retry_after
      session.add.assert_not_called()


  @pytest.mark.asyncio
  async def test_user_not_found_returns_sentinel() -> None:
      session = _make_session(user_found=False, count=0)
      result = await check_rate_limit_and_record(session, "missing-user", limit=10)
      # Sentinel value signals caller to raise 401
      assert result is False
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_rate_limit_service.py -v
  ```
  Expected: FAIL — `app.services.rate_limit_service` not found.

- [ ] **Step 3: Create rate_limit_service.py**

  Create `backend/app/services/rate_limit_service.py`:
  ```python
  """Sliding-window rate limit check and record — no transaction management, no HTTP concerns."""

  from __future__ import annotations

  import uuid
  from datetime import datetime, timedelta, timezone
  from typing import Literal

  from sqlalchemy import func, select
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.persistence.models import GenerationRequest, User


  async def check_rate_limit_and_record(
      db: AsyncSession,
      user_id: str,
      limit: int,
  ) -> datetime | Literal[False] | None:
      """Check the sliding window and conditionally insert a generation_requests row.

      Assumes the caller has already begun a transaction with SELECT FOR UPDATE on the
      user row (or is about to acquire the lock as the first operation here).

      Returns:
          None          — under limit; row inserted.
          datetime      — at/over limit; retry_after = earliest_in_window + 1h; no insert.
          False         — user row not found (caller should raise 401).
      """
      result = await db.execute(
          select(User).where(User.id == user_id).with_for_update()
      )
      if result.scalar_one_or_none() is None:
          return False

      window_start = datetime.now(timezone.utc) - timedelta(hours=1)

      count = (
          await db.execute(
              select(func.count())
              .select_from(GenerationRequest)
              .where(GenerationRequest.user_id == user_id)
              .where(GenerationRequest.requested_at > window_start)
          )
      ).scalar_one()

      if count >= limit:
          earliest_at = (
              await db.execute(
                  select(GenerationRequest.requested_at)
                  .where(GenerationRequest.user_id == user_id)
                  .where(GenerationRequest.requested_at > window_start)
                  .order_by(GenerationRequest.requested_at.asc())
                  .limit(1)
              )
          ).scalar_one()
          return earliest_at + timedelta(hours=1)

      db.add(
          GenerationRequest(
              id=str(uuid.uuid4()),
              user_id=user_id,
              requested_at=datetime.now(timezone.utc),
          )
      )
      return None
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_rate_limit_service.py -v
  ```
  Expected: 3 PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/services/rate_limit_service.py backend/tests/test_rate_limit_service.py
  git commit -m "feat: add rate_limit_service with sliding window check and record"
  ```

---

## Task 8: FastAPI deps + custom exception

**Files:**
- Create: `backend/app/api/deps.py`

- [ ] **Step 1: Write a failing test**

  Create `backend/tests/test_deps_import.py`:
  ```python
  """Verify deps module exports expected symbols."""
  import os

  os.environ.setdefault("JWT_SECRET", "test")

  def test_deps_exports_expected_symbols() -> None:
      from app.api.deps import RateLimitExceeded, check_rate_limit, get_current_user
      assert callable(get_current_user)
      assert callable(check_rate_limit)
      assert issubclass(RateLimitExceeded, Exception)
  ```

- [ ] **Step 2: Run to confirm it fails**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_deps_import.py -v
  ```
  Expected: FAIL — `app.api.deps` not found.

- [ ] **Step 3: Create deps.py**

  Create `backend/app/api/deps.py`:
  ```python
  """FastAPI dependency providers for auth and rate limiting."""

  from __future__ import annotations

  from datetime import datetime

  import jwt as pyjwt
  from fastapi import Depends, Header, HTTPException
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.config import settings
  from app.persistence.db import get_session, session_factory
  from app.persistence.models import User
  from app.services.auth_service import verify_token
  from app.services.rate_limit_service import check_rate_limit_and_record


  class RateLimitExceeded(Exception):
      """Raised when a user exceeds their hourly generation request limit."""

      def __init__(self, retry_after: datetime) -> None:
          self.retry_after = retry_after


  async def get_current_user(
      authorization: str | None = Header(default=None),
      db: AsyncSession = Depends(get_session),
  ) -> User:
      """Resolve Bearer token to a User record. Raises 401 on any auth failure."""
      if not authorization or not authorization.startswith("Bearer "):
          raise HTTPException(status_code=401, detail="Not authenticated")

      token = authorization[7:]
      try:
          payload = verify_token(token)
      except pyjwt.ExpiredSignatureError:
          raise HTTPException(status_code=401, detail="Token expired")
      except pyjwt.InvalidTokenError:
          raise HTTPException(status_code=401, detail="Invalid token")

      user = await db.get(User, payload["user_id"])
      if user is None:
          raise HTTPException(status_code=401, detail="User not found")

      return user


  async def check_rate_limit(
      current_user: User = Depends(get_current_user),
  ) -> None:
      """Enforce per-user sliding-window rate limit; insert a generation_requests row on pass.

      Uses a fresh session (not the one from get_current_user) to avoid an
      InvalidRequestError when calling db.begin() on a session that already has an
      active transaction from get_current_user's queries.

      Raises RateLimitExceeded (handled in main.py) if the limit is reached.
      The insert happens before story generation starts — a failing request still counts.
      """
      async with session_factory() as db:
          async with db.begin():
              result = await check_rate_limit_and_record(
                  db, current_user.id, settings.rate_limit_per_hour
              )

      if result is False:
          raise HTTPException(status_code=401, detail="User not found")
      if result is not None:
          raise RateLimitExceeded(result)
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/test_deps_import.py -v
  ```
  Expected: 1 PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/api/deps.py backend/tests/test_deps_import.py
  git commit -m "feat: add get_current_user, check_rate_limit, RateLimitExceeded"
  ```

---

## Task 9: Auth API endpoints

**Files:**
- Create: `backend/app/api/v1/auth.py`

- [ ] **Step 1: Create auth.py router**

  Create `backend/app/api/v1/auth.py`:
  ```python
  """User registration and login endpoints."""

  from __future__ import annotations

  import uuid

  from fastapi import APIRouter, Depends, HTTPException
  from sqlalchemy import select
  from sqlalchemy.exc import IntegrityError
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.domain.auth import LoginRequest, RegisterRequest, TokenResponse
  from app.persistence.db import get_session
  from app.persistence.models import User
  from app.services.auth_service import hash_password, issue_token, verify_password

  router = APIRouter(prefix="/auth", tags=["auth"])


  @router.post("/register", status_code=201)
  async def register(
      body: RegisterRequest,
      db: AsyncSession = Depends(get_session),
  ) -> TokenResponse:
      """Create a new user account and return a JWT access token."""
      user = User(
          id=str(uuid.uuid4()),
          email=body.email,
          password_hash=hash_password(body.password),
      )
      db.add(user)
      try:
          await db.commit()
      except IntegrityError:
          await db.rollback()
          raise HTTPException(status_code=409, detail="Email already registered")

      return TokenResponse(access_token=issue_token(user.id, user.email))


  @router.post("/login")
  async def login(
      body: LoginRequest,
      db: AsyncSession = Depends(get_session),
  ) -> TokenResponse:
      """Verify credentials and return a JWT access token."""
      result = await db.execute(select(User).where(User.email == body.email))
      user = result.scalar_one_or_none()

      if user is None or not verify_password(body.password, user.password_hash):
          raise HTTPException(status_code=401, detail="Invalid credentials")

      return TokenResponse(access_token=issue_token(user.id, user.email))
  ```

- [ ] **Step 2: Verify import**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/python -c \
    "from app.api.v1.auth import router; print('OK')"
  ```
  Expected: `OK`

- [ ] **Step 3: Commit**

  ```bash
  git add backend/app/api/v1/auth.py
  git commit -m "feat: add register and login endpoints"
  ```

---

## Task 10: Wire backend — main.py + stories.py

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/app/api/v1/stories.py`

- [ ] **Step 1: Read both files before editing**

  Read `backend/app/main.py` and `backend/app/api/v1/stories.py` in full before making any changes.

- [ ] **Step 2: Register auth router and RateLimitExceeded handler in main.py**

  Add these imports at the top of `backend/app/main.py` (alongside existing imports):
  ```python
  from fastapi import FastAPI, Request
  from fastapi.responses import JSONResponse
  from app.api.v1.auth import router as auth_router
  from app.api.deps import RateLimitExceeded
  ```

  Inside `create_app()`, after `app.include_router(stories_router, prefix="/api/v1")`, add:
  ```python
  app.include_router(auth_router, prefix="/api/v1")

  @app.exception_handler(RateLimitExceeded)
  async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
      return JSONResponse(
          status_code=429,
          headers={"Retry-After": exc.retry_after.strftime("%a, %d %b %Y %H:%M:%S GMT")},
          content={
              "detail": "Rate limit exceeded",
              "retry_after": exc.retry_after.strftime("%Y-%m-%dT%H:%M:%SZ"),
          },
      )
  ```

  > The exception handler lives here (not in `deps.py`) because `main.py` is where the app is assembled and it avoids a circular import.

- [ ] **Step 3: Add check_rate_limit dep to stories.py**

  In `backend/app/api/v1/stories.py`, update the `fastapi` import to include `Depends`:
  ```python
  from fastapi import APIRouter, Depends, HTTPException
  ```

  Add this import after the existing `app.` imports:
  ```python
  from app.api.deps import check_rate_limit
  ```

  Update the `generate_long_form_story` function signature:
  ```python
  @router.post("/generate-long-form")
  async def generate_long_form_story(
      request: LongFormRequest,
      _rate_limit: None = Depends(check_rate_limit),
  ) -> StreamingResponse:
  ```

- [ ] **Step 4: Smoke-test the app starts**

  ```bash
  cd backend && JWT_SECRET=test-secret-minimum-length \
    DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
    ../.venv/bin/python -c "from app.main import create_app; create_app(); print('OK')"
  ```
  Expected: `OK`

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/main.py backend/app/api/v1/stories.py
  git commit -m "feat: wire auth router, rate limit dep, and RateLimitExceeded handler"
  ```

---

## Task 11: Integration tests

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth_integration.py`

- [ ] **Step 1: Create conftest.py**

  Create `backend/tests/conftest.py`:
  ```python
  """Shared pytest fixtures for integration tests."""

  from __future__ import annotations

  import asyncio
  import os

  import pytest
  import pytest_asyncio
  from httpx import ASGITransport, AsyncClient
  from sqlalchemy import text

  os.environ.setdefault("JWT_SECRET", "integration-test-secret-do-not-use-in-prod")

  from app.main import create_app
  from app.persistence.db import session_factory


  @pytest.fixture(scope="session")
  def event_loop():
      loop = asyncio.new_event_loop()
      yield loop
      loop.close()


  @pytest_asyncio.fixture
  async def db_session():
      """Session that truncates auth tables after each test for isolation."""
      async with session_factory() as session:
          yield session
          await session.execute(text("DELETE FROM generation_requests"))
          await session.execute(text("DELETE FROM users"))
          await session.commit()


  @pytest_asyncio.fixture
  async def client():
      """Async HTTP client wired to the FastAPI test app via ASGI transport."""
      async with AsyncClient(
          transport=ASGITransport(app=create_app()),
          base_url="http://test",
      ) as c:
          yield c
  ```

- [ ] **Step 2: Create integration tests**

  Create `backend/tests/test_auth_integration.py`:
  ```python
  """Integration tests for auth endpoints and rate limiting (require real DB)."""

  from __future__ import annotations

  import asyncio
  import uuid
  from datetime import datetime, timedelta, timezone

  import pytest
  from httpx import AsyncClient
  from sqlalchemy.ext.asyncio import AsyncSession

  from app.persistence.models import GenerationRequest, User
  from app.services.auth_service import hash_password, issue_token

  pytestmark = pytest.mark.integration


  # ── Register ──────────────────────────────────────────────────────────────────


  @pytest.mark.asyncio
  async def test_register_returns_201_with_token(client: AsyncClient) -> None:
      resp = await client.post(
          "/api/v1/auth/register",
          json={"email": "alice@test.com", "password": "password123"},
      )
      assert resp.status_code == 201
      data = resp.json()
      assert "access_token" in data
      assert data["token_type"] == "bearer"


  @pytest.mark.asyncio
  async def test_register_409_on_duplicate_email(client: AsyncClient) -> None:
      payload = {"email": "bob@test.com", "password": "password123"}
      await client.post("/api/v1/auth/register", json=payload)
      resp = await client.post("/api/v1/auth/register", json=payload)
      assert resp.status_code == 409


  # ── Login ─────────────────────────────────────────────────────────────────────


  @pytest.mark.asyncio
  async def test_login_returns_200_with_token(client: AsyncClient) -> None:
      email, pwd = "carol@test.com", "password123"
      await client.post("/api/v1/auth/register", json={"email": email, "password": pwd})
      resp = await client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
      assert resp.status_code == 200
      assert "access_token" in resp.json()


  @pytest.mark.asyncio
  async def test_login_401_wrong_password(client: AsyncClient) -> None:
      await client.post(
          "/api/v1/auth/register",
          json={"email": "dave@test.com", "password": "correctpass"},
      )
      resp = await client.post(
          "/api/v1/auth/login",
          json={"email": "dave@test.com", "password": "wrongpass"},
      )
      assert resp.status_code == 401


  # ── Auth guard ────────────────────────────────────────────────────────────────


  @pytest.mark.asyncio
  async def test_generate_endpoint_requires_auth(client: AsyncClient) -> None:
      resp = await client.post("/api/v1/stories/generate-long-form", json={})
      assert resp.status_code == 401


  # ── Rate limiting ─────────────────────────────────────────────────────────────


  async def _create_user_with_token(
      db_session: AsyncSession,
      email: str,
  ) -> tuple[User, str]:
      """Helper: insert a User row directly and return (user, token)."""
      user = User(
          id=str(uuid.uuid4()),
          email=email,
          password_hash=hash_password("pass12345"),
      )
      db_session.add(user)
      await db_session.commit()
      return user, issue_token(user.id, user.email)


  @pytest.mark.asyncio
  async def test_rate_limit_blocks_after_n_requests(
      client: AsyncClient, db_session: AsyncSession
  ) -> None:
      """After RATE_LIMIT_PER_HOUR rows in the window the next request returns 429."""
      from app.config import settings

      user, token = await _create_user_with_token(db_session, "ratelimited@test.com")

      now = datetime.now(timezone.utc)
      for _ in range(settings.rate_limit_per_hour):
          db_session.add(
              GenerationRequest(
                  id=str(uuid.uuid4()),
                  user_id=user.id,
                  requested_at=now - timedelta(minutes=30),
              )
          )
      await db_session.commit()

      resp = await client.post(
          "/api/v1/stories/generate-long-form",
          headers={"Authorization": f"Bearer {token}"},
          json={},
      )
      assert resp.status_code == 429
      body = resp.json()
      # Body shape from the custom RateLimitExceeded handler — flat, not nested
      assert body["detail"] == "Rate limit exceeded"
      assert "retry_after" in body
      assert "Retry-After" in resp.headers


  @pytest.mark.asyncio
  async def test_rate_limit_retry_after_is_correct(
      client: AsyncClient, db_session: AsyncSession
  ) -> None:
      """retry_after must equal earliest_in_window + 1 hour (±2s tolerance)."""
      from app.config import settings

      user, token = await _create_user_with_token(db_session, "retrycheck@test.com")

      earliest = datetime.now(timezone.utc) - timedelta(minutes=45)
      for i in range(settings.rate_limit_per_hour):
          db_session.add(
              GenerationRequest(
                  id=str(uuid.uuid4()),
                  user_id=user.id,
                  requested_at=earliest + timedelta(minutes=i),
              )
          )
      await db_session.commit()

      resp = await client.post(
          "/api/v1/stories/generate-long-form",
          headers={"Authorization": f"Bearer {token}"},
          json={},
      )
      assert resp.status_code == 429
      retry_after = datetime.fromisoformat(
          resp.json()["retry_after"].replace("Z", "+00:00")
      )
      expected = earliest + timedelta(hours=1)
      assert abs((retry_after - expected).total_seconds()) < 2


  @pytest.mark.asyncio
  async def test_rate_limit_concurrent_requests_cannot_bypass(
      client: AsyncClient, db_session: AsyncSession
  ) -> None:
      """SELECT FOR UPDATE must prevent two concurrent requests both reading count=9
      and both inserting, which would let a burst exceed the limit."""
      from app.config import settings
      from app.persistence.db import session_factory
      from sqlalchemy import select, func

      user, token = await _create_user_with_token(db_session, "concurrent@test.com")

      # Pre-fill to one below the limit
      now = datetime.now(timezone.utc)
      for _ in range(settings.rate_limit_per_hour - 1):
          db_session.add(
              GenerationRequest(
                  id=str(uuid.uuid4()),
                  user_id=user.id,
                  requested_at=now - timedelta(minutes=30),
              )
          )
      await db_session.commit()

      # Fire two requests simultaneously — only one should succeed
      results = await asyncio.gather(
          client.post(
              "/api/v1/stories/generate-long-form",
              headers={"Authorization": f"Bearer {token}"},
              json={},
          ),
          client.post(
              "/api/v1/stories/generate-long-form",
              headers={"Authorization": f"Bearer {token}"},
              json={},
          ),
          return_exceptions=True,
      )

      statuses = [r.status_code for r in results if hasattr(r, "status_code")]
      # One request should have passed auth+rate-limit (200 or 4xx from missing body),
      # the other should have been blocked (429). Not both should pass rate limit.
      # The one that passes rate limit will fail at body validation (422) — that's fine.
      assert 429 in statuses, (
          f"Expected at least one 429 in concurrent results, got {statuses}"
      )

      # Confirm only one row was inserted (count = limit, not limit+1)
      async with session_factory() as check_session:
          window_start = datetime.now(timezone.utc) - timedelta(hours=1)
          count = (
              await check_session.execute(
                  select(func.count())
                  .select_from(GenerationRequest)
                  .where(GenerationRequest.user_id == user.id)
                  .where(GenerationRequest.requested_at > window_start)
              )
          ).scalar_one()
          assert count == settings.rate_limit_per_hour
  ```

- [ ] **Step 3: Run integration tests**

  ```bash
  cd backend && JWT_SECRET=integration-test-secret-do-not-use-in-prod \
    DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
    ../.venv/bin/pytest tests/test_auth_integration.py -v -m integration
  ```
  Expected: all tests pass. The concurrent test is inherently racy — if it fails intermittently, inspect whether the FOR UPDATE lock is correctly engaged.

- [ ] **Step 4: Commit**

  ```bash
  git add backend/tests/conftest.py backend/tests/test_auth_integration.py
  git commit -m "test: add conftest and integration tests for auth and rate limiting"
  ```

---

## Task 12: Frontend — AuthModal component

**Files:**
- Create: `frontend/src/components/auth-modal.tsx`

- [ ] **Step 1: Create auth-modal.tsx**

  Create `frontend/src/components/auth-modal.tsx`:
  ```tsx
  "use client";

  import { useState } from "react";

  import { Button } from "@/components/ui/button";
  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";

  export type AuthModalProps = {
    onAuthenticated: (token: string) => void;
  };

  type Mode = "login" | "register";

  export function AuthModal({ onAuthenticated }: AuthModalProps) {
    const [mode, setMode]         = useState<Mode>("login");
    const [email, setEmail]       = useState("");
    const [password, setPassword] = useState("");
    const [error, setError]       = useState<string | null>(null);
    const [loading, setLoading]   = useState(false);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setLoading(true);

      const endpoint =
        mode === "register" ? "/api/v1/auth/register" : "/api/v1/auth/login";

      try {
        const resp = await fetch(endpoint, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ email, password }),
        });

        if (resp.status === 409) { setError("Email already registered. Try logging in."); return; }
        if (resp.status === 401) { setError("Invalid email or password."); return; }
        if (!resp.ok)            { setError("Something went wrong. Please try again."); return; }

        const data = await resp.json();
        localStorage.setItem("lf_token", data.access_token);
        onAuthenticated(data.access_token);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.7)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div
          className="w-full max-w-sm rounded-xl p-6 space-y-4"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border)" }}
        >
          <h2
            id="auth-modal-title"
            className="text-lg font-semibold"
            style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
          >
            {mode === "login" ? "Sign In" : "Create Account"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                minLength={mode === "register" ? 8 : undefined}
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: "var(--error, #f87171)" }} role="alert">
                {error}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "…" : mode === "login" ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="text-xs text-center" style={{ color: "var(--cream-muted)" }}>
            {mode === "login" ? "No account yet? " : "Already have an account? "}
            <button
              type="button"
              className="underline"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -20
  ```
  Expected: no errors for the new file.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/auth-modal.tsx
  git commit -m "feat: add AuthModal login/register component"
  ```

---

## Task 13: Frontend — use-long-form-stream.tsx auth integration

**Files:**
- Modify: `frontend/src/components/use-long-form-stream.tsx`

- [ ] **Step 1: Read the current file in full**

  Read `frontend/src/components/use-long-form-stream.tsx` before editing.

- [ ] **Step 2: Add new StreamStatus variants**

  Find the `StreamStatus` type union. Add two new variants:
  ```ts
  | { code: "rate_limited"; retry_after: string }
  | { code: "unauthenticated" }
  ```

- [ ] **Step 3: Add token to GenerateLongFormArgs**

  Find the `GenerateLongFormArgs` type and add:
  ```ts
  token?: string | null;
  ```

- [ ] **Step 4: Update the fetch call to include the Authorization header**

  In the `generateLongForm` callback, find the `fetch(ENDPOINT, { ... })` call. Update the `headers` object:
  ```ts
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  ```

- [ ] **Step 5: Replace the generic !response.ok block with specific 401/429 handling**

  Find the `if (!response.ok)` block immediately after the `fetch` call and replace it:
  ```ts
  if (response.status === 401) {
    setStreamStatus({ code: "unauthenticated" });
    setIsStreaming(false);
    return;
  }
  if (response.status === 429) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const retry_after = typeof body?.retry_after === "string" ? body.retry_after : "";
    setStreamStatus({ code: "rate_limited", retry_after });
    setIsStreaming(false);
    return;
  }
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }
  ```

- [ ] **Step 6: Add token to the useCallback destructuring**

  Find the `useCallback` destructuring of args and add `token`:
  ```ts
  const { draft, providerConfig, chapterCount, chapterWordTarget, token } = /* args */;
  ```
  Follow the exact existing pattern for how args are accessed.

- [ ] **Step 7: TypeScript check**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30
  ```
  Expected: no new errors.

- [ ] **Step 8: Commit**

  ```bash
  git add frontend/src/components/use-long-form-stream.tsx
  git commit -m "feat: add auth header, rate_limited and unauthenticated stream statuses"
  ```

---

## Task 14: Frontend — vibe-controller.tsx auth integration

**Files:**
- Modify: `frontend/src/components/vibe-controller.tsx`

- [ ] **Step 1: Read the current file in full**

  Read `frontend/src/components/vibe-controller.tsx` before editing.

- [ ] **Step 2: Add useEffect to existing react import and add AuthModal import**

  Update the `react` import line to include `useEffect` if not already there:
  ```tsx
  import { useEffect, useMemo, useState } from "react";
  ```

  Add the `AuthModal` import alongside other component imports:
  ```tsx
  import { AuthModal } from "@/components/auth-modal";
  ```

- [ ] **Step 3: Add token state**

  Inside the main component, add after the other `useState` declarations:
  ```tsx
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("lf_token") : null
  );
  ```

- [ ] **Step 4: Clear token when stream returns unauthenticated**

  Add a `useEffect` inside the component:
  ```tsx
  useEffect(() => {
    if (streamStatus.code === "unauthenticated") {
      localStorage.removeItem("lf_token");
      setToken(null);
    }
  }, [streamStatus.code]);
  ```

- [ ] **Step 5: Render AuthModal when no token**

  At the very top of the returned JSX (before the outermost wrapper, or as its first child):
  ```tsx
  {!token && (
    <AuthModal onAuthenticated={(t) => setToken(t)} />
  )}
  ```

- [ ] **Step 6: Pass token to generateLongForm**

  Find the call to `generateLongForm({ ... })` and add `token`:
  ```tsx
  generateLongForm({ draft, providerConfig, chapterCount, chapterWordTarget, token })
  ```

- [ ] **Step 7: Show rate-limit message**

  Find where stream status messages are rendered (near `streamStatus.code === "error"` or the status text area). Add:
  ```tsx
  {streamStatus.code === "rate_limited" && (() => {
    const retryTime = streamStatus.retry_after
      ? new Date(streamStatus.retry_after).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "later";
    return (
      <p className="text-sm" style={{ color: "var(--error, #f87171)" }}>
        Limit reached. Try again at {retryTime}.
      </p>
    );
  })()}
  ```

- [ ] **Step 8: TypeScript check + lint**

  ```bash
  cd frontend && npx tsc --noEmit 2>&1 | head -30 && npm run lint 2>&1 | tail -20
  ```
  Expected: no new errors.

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/components/vibe-controller.tsx
  git commit -m "feat: integrate auth modal and rate-limit message into VibeController"
  ```

---

## Task 15: E2E Playwright tests

**Files:**
- Create: `frontend/e2e/auth.spec.ts`

- [ ] **Step 1: Write Playwright tests**

  Create `frontend/e2e/auth.spec.ts`:
  ```ts
  import { test, expect } from "@playwright/test";

  test.describe("Auth modal", () => {
    test("shows login form when no token is stored", async ({ page }) => {
      await page.goto("/");
      await page.evaluate(() => localStorage.removeItem("lf_token"));
      await page.reload();

      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByLabelText("Email")).toBeVisible();
      await expect(page.getByLabelText("Password")).toBeVisible();
    });
  });

  test.describe("Rate limit message", () => {
    test("shows 'Limit reached' message on 429 response", async ({ page }) => {
      await page.route("**/api/v1/stories/generate-long-form", async (route) => {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          headers: { "Retry-After": "Thu, 19 Mar 2026 15:32:00 GMT" },
          body: JSON.stringify({
            detail: "Rate limit exceeded",
            retry_after: "2026-03-19T15:32:00Z",
          }),
        });
      });

      await page.goto("/");
      await page.evaluate(() => localStorage.setItem("lf_token", "fake.jwt.token"));
      await page.reload();

      // Adjust selector to the actual generate button text in VibeController
      const generateBtn = page.getByRole("button", { name: /generate/i }).first();
      await generateBtn.click();

      await expect(
        page.getByText(/Limit reached\. Try again at/i)
      ).toBeVisible({ timeout: 5000 });
    });

    test("clears token and shows login form on 401 response", async ({ page }) => {
      await page.route("**/api/v1/stories/generate-long-form", async (route) => {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({ detail: "Token expired" }),
        });
      });

      await page.goto("/");
      await page.evaluate(() => localStorage.setItem("lf_token", "expired.jwt.token"));
      await page.reload();

      const generateBtn = page.getByRole("button", { name: /generate/i }).first();
      await generateBtn.click();

      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    });
  });
  ```

- [ ] **Step 2: Run E2E tests**

  ```bash
  cd frontend && npm run e2e -- auth.spec.ts
  ```
  Expected: tests pass. If the generate button selector does not match, run with `npm run e2e:headed` to inspect the DOM and update the selector.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/e2e/auth.spec.ts
  git commit -m "test: E2E tests for auth modal and 429/401 handling"
  ```

---

## Task 16: Smoke verification

- [ ] **Step 1: Run all backend unit tests (no DB required)**

  ```bash
  cd backend && JWT_SECRET=test ../.venv/bin/pytest tests/ -v \
    --ignore=tests/test_auth_integration.py \
    --ignore=tests/test_real_provider_smoke.py
  ```
  Expected: all tests pass.

- [ ] **Step 2: Run backend integration tests (real DB required)**

  ```bash
  cd backend && JWT_SECRET=integration-test-secret-do-not-use-in-prod \
    DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
    ../.venv/bin/pytest tests/test_auth_integration.py -v -m integration
  ```
  Expected: all tests pass.

- [ ] **Step 3: Frontend lint + type check**

  ```bash
  cd frontend && npm run lint && npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Verify auth guard is active**

  ```bash
  make smoke-stream 2>&1 | grep -E "401|Unauthorized"
  ```
  Expected: 401 response — confirms the generation endpoint now requires authentication.
