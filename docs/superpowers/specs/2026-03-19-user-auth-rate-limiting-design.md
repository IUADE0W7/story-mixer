# User Authentication & Rate Limiting Design

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Backend auth system + per-user story generation rate limiting

---

## Overview

LoreForge currently has no user identity system — the story generation API is fully open. This design adds email/password user accounts and a per-user rate limit of 10 story generation requests per hour, with a soft block that tells the user exactly when they can retry.

**Explicit out-of-scope items:** linking `stories` rows to users (no `user_id` FK on `stories`), account disable (`is_active` flag), email verification, password reset, OAuth, token refresh.

---

## 1. Database Schema

Two new tables, added via Alembic migrations.

### `users`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `email` | Text | Unique not null; unique index for login lookups |
| `password_hash` | Text | bcrypt hash, not null |
| `created_at` | DateTime(timezone=True) | Set on insert |

### `generation_requests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `user_id` | UUID | FK → `users.id` ON DELETE RESTRICT |
| `requested_at` | DateTime(timezone=True) | Set on insert |

`GenerationRequest` needs no Pydantic domain model — it is only used internally by `rate_limit_service`. ORM model only.

A single composite index on `(user_id, requested_at)` covers all sliding window queries. All `DateTime` columns use `timezone=True` (`TIMESTAMPTZ` in PostgreSQL) to ensure correct comparison against `now()`. The table is append-only — one row per generation attempt, regardless of whether the story completes successfully.

**Config:** `RATE_LIMIT_PER_HOUR` env var (default: `10`).

---

## 2. Authentication

### New endpoints — `/api/v1/auth/`

**`POST /api/v1/auth/register`**

- Accepts: `{ email: str, password: str }`
- Validates email format
- Validates password: minimum 8 characters, maximum 72 characters. The 72-character limit is actively enforced by the validator (not silently truncated) because bcrypt discards bytes beyond 72 — a password longer than 72 chars would match any truncated variant, which is a security defect.
- Hashes password with bcrypt
- Inserts into `users`
- Returns: `201 Created` with `TokenResponse { access_token: str, token_type: "bearer" }`
- Returns: `409 Conflict` if email already exists

**`POST /api/v1/auth/login`**

- Accepts: `{ email: str, password: str }`
- Verifies credentials against DB
- Returns: `200 OK` with `TokenResponse { access_token: str, token_type: "bearer" }` on success
- Returns: `401 Unauthorized` on failure

### JWT

- Algorithm: `HS256` (symmetric HMAC — single shared secret, no key pair needed)
- Payload: `{ user_id, email, exp }`
- Expiry: `JWT_EXPIRY_HOURS` env var (default: `24`)
- Signing secret: `JWT_SECRET` env var — declared in the Pydantic `Settings` model with no default value; Pydantic raises `ValidationError` on startup if absent

### FastAPI dependency: `get_current_user`

- Reads `Authorization: Bearer <token>` header
- Validates JWT signature and expiry
- Returns the authenticated user record
- Returns `401 Unauthorized` if missing, invalid, or expired
- If the user row cannot be found during lock acquisition (deleted after token issued), raise `401`
- Injected into the story generation endpoint — unauthenticated requests fail before any rate limit check

`check_rate_limit` declares `current_user: User = Depends(get_current_user)` in its signature, so FastAPI injects the authenticated user automatically. The route declares `Depends(check_rate_limit)` only — `get_current_user` runs implicitly as a transitive dependency.

---

## 3. Rate Limiting

### FastAPI dependency: `check_rate_limit(current_user)`

Injected into the story generation endpoint after `get_current_user`.

**Atomicity:** The count-then-insert pattern is wrapped in a single database transaction with `SELECT ... FOR UPDATE` on the user row to prevent concurrent requests from both reading count=9 and both inserting, which would allow bursts beyond the limit. If the user row is not found during lock acquisition, raise `401` (should be unreachable if `get_current_user` succeeded, but defensively handled).

**Flow:**

1. Begin transaction; acquire row lock: `SELECT id FROM users WHERE id = ? FOR UPDATE`
2. If no row found: raise `401`
3. Count rows in `generation_requests` where `user_id = current_user.id AND requested_at > now() - 1 hour`
4. **If count ≥ limit:**
   - Query the earliest row within the window: `SELECT requested_at ... ORDER BY requested_at ASC LIMIT 1`
   - Compute `retry_after = earliest_in_window.requested_at + 1 hour` (the slot that opens soonest)
   - Rollback transaction; return `429 Too Many Requests` with:
     - Header: `Retry-After: <retry_after formatted as RFC 7231 HTTP-date>` (e.g., `Thu, 19 Mar 2026 15:32:00 GMT`)
     - Body:

       ```json
       {
         "detail": "Rate limit exceeded",
         "retry_after": "2026-03-19T15:32:00Z"
       }
       ```

       (Body uses ISO 8601 UTC; header uses HTTP-date per RFC 7231. The frontend reads from the body.)

5. **If count < limit:**
   - Insert a new row into `generation_requests` with `requested_at = now()`
   - Commit transaction; proceed to story generation

The insert happens **before** story generation starts. A request that fails or times out still counts against the limit, preventing abuse via repeated failing requests.

### Frontend handling

The story generation stream uses `fetch` + `ReadableStream` (confirmed — `use-long-form-stream.tsx` already uses `fetch`), so the `Authorization: Bearer <token>` header is sent normally. There is no native `EventSource` usage.

When the response status is `429`, the frontend reads `retry_after` (ISO 8601 UTC string) from the JSON body, converts it to the user's local time via `new Date(retry_after).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })`, and displays:

> "Limit reached. Try again at 15:32."

When the response status is `401` (expired or missing token), the frontend clears the stored token and shows the login form.

---

## 4. New Files

| Path | Purpose |
| --- | --- |
| `backend/app/api/v1/auth.py` | Register + login endpoints |
| `backend/app/api/deps.py` | FastAPI dependencies: `get_current_user`, `check_rate_limit` |
| `backend/app/services/auth_service.py` | Password hashing, JWT issue/verify |
| `backend/app/services/rate_limit_service.py` | Sliding window check + insert logic |
| `backend/app/domain/auth.py` | Pydantic models: `RegisterRequest`, `LoginRequest`, `TokenResponse` |
| `backend/alembic/versions/20260319_0001_add_users_table.py` | Migration: create `users` |
| `backend/alembic/versions/20260319_0002_add_generation_requests_table.py` | Migration: create `generation_requests` table and composite index on `(user_id, requested_at)` |
| `frontend/src/components/auth-modal.tsx` | Login/register modal component; stores JWT in localStorage. **Trade-off:** localStorage is vulnerable to XSS; httpOnly cookies would be safer but require backend cookie handling. Accepted for this scope given the app has no third-party scripts and no sensitive PII beyond email. |

### Modified Files

| Path | Change |
| --- | --- |
| `backend/app/api/v1/stories.py` | Inject `get_current_user` + `check_rate_limit` dependencies |
| `backend/app/main.py` | Register `/api/v1/auth` router |
| `backend/app/config.py` | Add `JWT_SECRET`, `JWT_EXPIRY_HOURS`, `RATE_LIMIT_PER_HOUR` settings |
| `backend/app/persistence/models.py` | Add `User` and `GenerationRequest` ORM models |
| `backend/pyproject.toml` | Add `PyJWT[cryptography]` and `bcrypt` dependencies |
| `frontend/src/components/vibe-controller.tsx` | Show `AuthModal` when unauthenticated; display 429 retry message |
| `frontend/src/components/use-long-form-stream.tsx` | Pass `Authorization` header on fetch; surface 429 `retry_after` and 401 to caller |

---

## 5. Dependencies

New Python packages (add to `backend/pyproject.toml`):

- `PyJWT[cryptography]` — JWT sign/verify (actively maintained; `python-jose` is abandoned with known CVEs)
- `bcrypt` — password hashing (used directly; `passlib` is in minimal-maintenance mode)

---

## 6. Testing

- Unit tests for `auth_service`: hash/verify password, issue/verify JWT, expired token rejection, password length boundary (7 chars rejected, 8 chars accepted, 72 chars accepted, 73 chars rejected by validator)
- Unit tests for `rate_limit_service`: under limit passes, at limit returns 429 with correct `retry_after`
- Integration tests (marked `@pytest.mark.integration`): full register → login → generate flow; rate limit enforcement including concurrent requests against real DB with `SELECT FOR UPDATE`
- Playwright E2E: verify the "Limit reached. Try again at HH:MM" message appears when backend returns 429
- Playwright E2E: verify that a 401 response clears the session and shows the login form
