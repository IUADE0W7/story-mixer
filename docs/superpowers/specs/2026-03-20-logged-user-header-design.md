# Design: Show Logged-In User Email in Header

**Date:** 2026-03-20
**Status:** Approved

## Goal

Display the authenticated user's email in the app header (top-right), alongside the existing "Studio Ready" status pip, so the user has confirmation of who they are signed in as.

## Scope

- Show email only (no avatar, no display name)
- Visible only when authenticated; header right side unchanged when logged out
- No new API calls, no new files

## Architecture

### State lift — `page.tsx`

Move `token` state from `VibeController` up to `HomePage`:

- Initialize from `localStorage.getItem("lf_token")` (same as current)
- Add a `decodeEmail(token: string): string | null` pure helper that base64-decodes the JWT payload segment and returns `.email`
- Pass `token` and `onAuthenticated` as props into `VibeController`

### Header — `page.tsx`

When `token` is set, render the decoded email to the left of the "Studio Ready" pip:

```
[email] • [pip] Studio Ready
```

- Styled with `lf-section-label` class and `color: var(--cream-muted)` — consistent with the pip label
- No sign-out button in this iteration

### `VibeController` props

Add two new props:

```ts
token: string | null
onAuthenticated: (token: string) => void
```

Remove internal `token` useState and localStorage initialization. Keep AuthModal trigger, 401 handler (`localStorage.removeItem` + call parent's setter with `null`), and stream logic unchanged.

## Data flow

```
HomePage (owns token state)
  ├── header → decodeEmail(token) → renders email
  └── VibeController(token, onAuthenticated)
        ├── AuthModal → onAuthenticated(newToken) → sets state in HomePage
        └── stream logic uses token prop
```

## JWT decoding

No library needed. The JWT middle segment is standard base64url:

```ts
function decodeEmail(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
```

## Error handling

- Malformed JWT → `decodeEmail` returns `null` → email not shown, no crash
- Token cleared on 401 → `onAuthenticated` receives `null`-equivalent → VibeController calls parent setter → email disappears, AuthModal reappears

## Files changed

| File | Change |
|------|--------|
| `frontend/src/app/page.tsx` | Add token state, decodeEmail, email in header, pass props to VibeController |
| `frontend/src/components/vibe-controller.tsx` | Accept token + onAuthenticated as props, remove internal token state |

## Out of scope

- Sign-out button
- Avatar / display name
- `/me` API endpoint
