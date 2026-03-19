# Google OAuth Login — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Replace email/password authentication with Google Sign-In (Option A: frontend-first with Google Identity Services)

---

## Overview

Replace the existing bcrypt/password-based auth system with Google OAuth using the Google Identity Services (GIS) frontend-first flow. The frontend obtains a Google ID token credential directly in the browser; the backend verifies it and issues the existing HS256 JWT. All downstream auth (Bearer header, `get_current_user`, rate limiting) is unchanged.

---

## Data Model Changes

**Migration:** New Alembic revision that drops `password_hash`, adds `google_id`, `display_name`, and `avatar_url` to the `users` table. Existing rows are wiped (fresh start — no production users).

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

Add to `.env.example`:
```
GOOGLE_CLIENT_ID=
```

### Auth Service (`app/services/auth_service.py`)

**Remove:** `hash_password()`, `verify_password()`

**Add:**
```python
def verify_google_credential(credential: str) -> dict:
    """Verify a Google ID token credential. Returns decoded payload on success.
    Raises google.auth.exceptions.GoogleAuthError on failure."""
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests
    return id_token.verify_oauth2_token(
        credential, google_requests.Request(), settings.google_client_id
    )
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
- Calls `verify_google_credential(request.credential)` — returns 401 on `GoogleAuthError`
- Upserts user: look up by `google_id`; if not found, create new row with `email`, `google_id`, `display_name`, `avatar_url`; if found, update `display_name` and `avatar_url`
- Calls `issue_token(user.id, user.email)`
- Returns `TokenResponse`

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
@react-oauth/google
```

### Environment

Add to `frontend/.env.example` (and `frontend/.env.local`):
```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

### Root Layout (`src/app/layout.tsx`)

Wrap children in `<GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>`.

### Auth Modal (`src/components/auth-modal.tsx`)

**Remove:** Email input, password input, submit button, register/login toggle, all related state and handlers.

**Add:** `<GoogleLogin>` component from `@react-oauth/google`.

- `onSuccess`: receives `credentialResponse`, POSTs `credentialResponse.credential` to `POST /api/v1/auth/google`, stores returned `access_token` in `localStorage`, closes modal.
- `onError`: sets a single error string "Google sign-in failed. Please try again."

---

## Testing

### Backend

- Remove: `test_auth_domain.py`, `test_auth_service.py` (password/register/login tests)
- Add unit tests for `verify_google_credential` (mock `google.oauth2.id_token.verify_oauth2_token`)
- Add integration tests for `POST /api/v1/auth/google`: valid credential → 200 + JWT; invalid credential → 401; new user created; existing user updated

### Frontend E2E

- Update `e2e/auth.spec.ts`: remove email/password login flow tests; add Google Sign-In button visibility check; mock the GIS credential flow for the full login → token stored → modal closed path.

---

## Configuration Required (Google Cloud Console)

Before running locally:
1. Create an OAuth 2.0 Client ID (Web application type)
2. Add `http://localhost:3000` to Authorized JavaScript Origins
3. Set `GOOGLE_CLIENT_ID` in `backend/.env` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local`

No redirect URIs needed (Option A does not use the authorization code flow).
