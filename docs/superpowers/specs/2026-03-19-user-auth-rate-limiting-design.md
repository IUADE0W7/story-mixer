# User Authentication & Rate Limiting Design

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Backend auth system + per-user story generation rate limiting

---

## Overview

LoreForge currently has no user identity system — the story generation API is fully open. This design adds email/password user accounts and a per-user rate limit of 10 story generation requests per hour, with a soft block that tells the user exactly when they can retry.

---

## 1. Database Schema

Two new tables, added via Alembic migrations.

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | Text | Unique, not null |
| `password_hash` | Text | bcrypt hash, not null |
| `created_at` | DateTime | Set on insert |

### `generation_requests`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → `users.id`, indexed |
| `requested_at` | DateTime | Set on insert, indexed |

A composite index on `(user_id, requested_at)` makes the sliding window count query fast. The table is append-only — one row per generation attempt, regardless of whether the story completes successfully.

**Config:** `RATE_LIMIT_PER_HOUR` env var (default: `10`).

---

## 2. Authentication

### New endpoints — `/api/v1/auth/`

**`POST /api/v1/auth/register`**
- Accepts: `{ email: str, password: str }`
- Validates email format
- Hashes password with bcrypt
- Inserts into `users`
- Returns: JWT access token

**`POST /api/v1/auth/login`**
- Accepts: `{ email: str, password: str }`
- Verifies credentials against DB
- Returns: JWT access token on success, `401` on failure

### JWT
- Payload: `{ user_id, email, exp }`
- Expiry: `JWT_EXPIRY_HOURS` env var (default: `24`)
- Signing secret: `JWT_SECRET` env var — required, no default, server refuses to start without it

### FastAPI dependency: `get_current_user`
- Reads `Authorization: Bearer <token>` header
- Validates JWT signature and expiry
- Returns the authenticated user record
- Returns `401 Unauthorized` if missing or invalid
- Injected into the story generation endpoint — unauthenticated requests fail before any rate limit check

**Out of scope:** email verification, password reset, OAuth.

---

## 3. Rate Limiting

### FastAPI dependency: `check_rate_limit(current_user)`

Injected into the story generation endpoint after `get_current_user`.

**Flow:**

1. Count rows in `generation_requests` where `user_id = current_user.id AND requested_at > now() - 1 hour`
2. **If count ≥ limit:**
   - Query the oldest row in the window
   - Compute `retry_after = oldest.requested_at + 1 hour`
   - Return `429 Too Many Requests`:
     ```json
     {
       "detail": "Rate limit exceeded",
       "retry_after": "2026-03-19T15:32:00Z"
     }
     ```
3. **If count < limit:**
   - Insert a new row into `generation_requests` with `requested_at = now()`
   - Proceed to story generation

The insert happens **before** story generation starts. A request that fails or times out still counts against the limit, preventing abuse via repeated failing requests.

### Frontend handling

The frontend reads `retry_after` from the 429 response body and displays a human-readable message, e.g.:

> "Limit reached. Try again at 15:32."

---

## 4. New Files

| Path | Purpose |
|---|---|
| `backend/app/api/v1/auth.py` | Register + login endpoints |
| `backend/app/services/auth_service.py` | Password hashing, JWT issue/verify |
| `backend/app/services/rate_limit_service.py` | Sliding window check + insert logic |
| `backend/app/domain/auth.py` | Pydantic models: `RegisterRequest`, `LoginRequest`, `TokenResponse` |
| `backend/alembic/versions/20260319_0001_add_users_table.py` | Migration: create `users` |
| `backend/alembic/versions/20260319_0002_add_generation_requests_table.py` | Migration: create `generation_requests` |

### Modified Files

| Path | Change |
|---|---|
| `backend/app/api/v1/stories.py` | Inject `get_current_user` + `check_rate_limit` dependencies |
| `backend/app/main.py` | Register `/api/v1/auth` router |
| `backend/app/config.py` | Add `JWT_SECRET`, `JWT_EXPIRY_HOURS`, `RATE_LIMIT_PER_HOUR` settings |
| `backend/app/persistence/models.py` | Add `User` and `GenerationRequest` ORM models |

---

## 5. Dependencies

New Python packages:
- `python-jose[cryptography]` — JWT sign/verify
- `passlib[bcrypt]` — password hashing
- `python-multipart` — required by FastAPI for form parsing (if not already present)

---

## 6. Testing

- Unit tests for `auth_service`: hash/verify password, issue/verify JWT, expired token rejection
- Unit tests for `rate_limit_service`: under limit passes, at limit returns 429 with correct `retry_after`
- Integration tests (marked `@pytest.mark.integration`): full register → login → generate flow; rate limit enforcement against real DB
