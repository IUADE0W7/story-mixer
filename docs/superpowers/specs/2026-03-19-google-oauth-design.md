# Google OAuth Login — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Replace email/password authentication with Google Sign-In (Option A: frontend-first with Google Identity Services)

---

## Overview

Replace the existing bcrypt/password-based auth system with Google OAuth using the Google Identity Services (GIS) frontend-first flow. The frontend obtains a Google ID token credential directly in the browser; the backend verifies it and issues the existing HS256 JWT. All downstream auth (Bearer header, `get_current_user`, rate limiting) is unchanged.

---

## Data Model Changes

**Migration:** New Alembic revision that:

1. `TRUNCATE users CASCADE` — explicitly wipe all existing rows before altering columns (fresh start, no production users)
2. Drop `password_hash` column
3. Add `google_id TEXT NOT NULL` with a unique index
4. Add `display_name TEXT NULLABLE`
5. Add `avatar_url TEXT NULLABLE`

**`User` ORM model (updated columns):**

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK, UUID default |
| `email` | TEXT | NOT NULL, unique index |
| `google_id` | TEXT | NOT NULL, unique index |
| `display_name` | TEXT | NULLABLE |
| `avatar_url` | TEXT | NULLABLE |
| `created_at` | TIMESTAMPTZ | NOT NULL, server default NOW() |

**Removed columns:** `password_hash`

---

## Backend Changes

### Dependencies

Add to `pyproject.toml`:
```
google-auth>=2.0.0
```

### Config (`app/config.py`)

Add to `AppSettings`:
```python
google_client_id: str
```

Add to `backend/.env.example`:
```
GOOGLE_CLIENT_ID=
```

### Auth Service (`app/services/auth_service.py`)

**Remove:** `hash_password()`, `verify_password()`

**Add:**
```python
async def verify_google_credential(credential: str) -> dict:
    """Verify a Google ID token. Returns decoded payload on success.

    Runs the blocking google-auth HTTP call in a thread pool to avoid
    blocking the asyncio event loop (google.auth.transport.requests.Request
    uses the synchronous `requests` library).

    Raises ValueError on any verification failure (expired, wrong audience,
    bad signature, missing fields).
    """
    import asyncio
    from functools import partial
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    from google.auth.exceptions import GoogleAuthError

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

    return await asyncio.get_event_loop().run_in_executor(None, _verify)
```

Payload fields used: `sub` (→ `google_id`), `email`, `name` (→ `display_name`), `picture` (→ `avatar_url`).

**Keep:** `issue_token()`, `verify_token()`

### Domain Models (`app/domain/auth.py`)

**Remove:** `RegisterRequest`, `LoginRequest`

**Add:**
```python
class GoogleAuthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    credential: str
```

**Keep:** `TokenResponse`

### Auth Router (`app/api/v1/auth.py`)

**Remove:** `POST /register`, `POST /login`

**Add:** `POST /google`
- Accepts `GoogleAuthRequest`
- Calls `verify_google_credential(request.credential)` — catches `ValueError`, returns HTTP 401 with detail "Invalid Google credential"
- **Upsert via `INSERT ... ON CONFLICT`:** use a single `INSERT INTO users (...) VALUES (...) ON CONFLICT (google_id) DO UPDATE SET display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url RETURNING *` executed as raw SQL or via SQLAlchemy's `insert(...).on_conflict_do_update(...)`. This is atomic — no TOCTOU race.
- **Email collision:** if a row with the same `email` but a different `google_id` already exists, the `INSERT` will raise a unique constraint violation on `ix_users_email`. Catch this and return HTTP 409 "An account with this email already exists."
- Calls `issue_token(user.id, user.email)`, returns `TokenResponse`

### Unchanged

- `app/api/deps.py` — `get_current_user`, `check_rate_limit`
- `app/services/auth_service.py` — `issue_token`, `verify_token`
- `app/services/rate_limit_service.py`
- All story endpoints

---

## Frontend Changes

### Dependencies

Add to `package.json`:
```
@react-oauth/google@^0.12.0
```

### Environment

> **Note:** `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (frontend) and `GOOGLE_CLIENT_ID` (backend) must be set to the **same** OAuth 2.0 Client ID value from Google Cloud Console.

Add to `frontend/.env.example` (and `frontend/.env.local`):
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

### Root Layout (`src/app/layout.tsx`)

Wrap children in `<GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>`.

### Auth Modal (`src/components/auth-modal.tsx`)

**Remove:** Email input, password input, submit button, register/login toggle, all related state and handlers.

**Add:** `<GoogleLogin>` component from `@react-oauth/google`.

- `onSuccess`: receives `credentialResponse`, POSTs `credentialResponse.credential` to `POST /api/v1/auth/google`, stores returned `access_token` in `localStorage` (carries over from existing implementation — acceptable for this project's threat model; XSS risk is acknowledged), closes modal.
- `onError`: sets a single error string "Google sign-in failed. Please try again."

---

## Testing

### Backend

- **Remove:** `test_auth_domain.py`, `test_auth_service.py` (password/bcrypt tests), register/login integration tests
- **Add unit tests** for `verify_google_credential` (mock `google.oauth2.id_token.verify_oauth2_token`):
  - Valid token → returns payload
  - Expired/invalid token → raises `ValueError`
  - `email_verified: false` → raises `ValueError`
  - Missing `sub` or `email` → raises `ValueError`
- **Add integration tests** for `POST /api/v1/auth/google`:
  - Valid credential → 200 + JWT
  - Invalid/expired credential → 401
  - New user → row created in DB
  - Existing user (same `google_id`) → `display_name`/`avatar_url` updated, same `id`
  - Concurrent duplicate registration (same `google_id`) → idempotent, no duplicate rows
  - Email collision (same email, different `google_id`) → 409

### Frontend E2E

- Update `e2e/auth.spec.ts`: remove email/password login flow tests; add Google Sign-In button visibility check; mock the GIS credential flow for the full login → token stored → modal closed path.

---

## Configuration Required (Google Cloud Console)

Before running locally:
1. Create an OAuth 2.0 Client ID (Web application type)
2. Add `http://localhost:3000` to Authorized JavaScript Origins
3. Set `GOOGLE_CLIENT_ID` in `backend/.env` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local` — **both must be the same Client ID value**

No redirect URIs needed (Option A does not use the authorization code flow).
