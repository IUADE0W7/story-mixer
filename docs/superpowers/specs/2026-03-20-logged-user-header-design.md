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

- Initialize with a lazy `useState` initializer that guards against SSR:
  ```ts
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("lf_token") : null
  );
  ```
- Add a `decodeEmail(token: string): string | null` module-level pure helper (defined outside the component body so it is not re-created on each render) that base64-decodes the JWT payload segment and returns `.email`
- Pass `token` and `onTokenChange` as props into `VibeController`

### Header — `page.tsx`

When `token` is set, render the decoded email to the left of the "Studio Ready" pip:

```
[email] <aria-hidden>•</aria-hidden> [pip] Studio Ready
```

- Styled with `lf-section-label` class and `color: var(--cream-muted)` — consistent with the pip label
- The bullet separator `•` carries `aria-hidden="true"` so screen readers skip it
- No sign-out button in this iteration

### `VibeController` props

Add two new props:

```ts
token: string | null
onTokenChange: (token: string | null) => void
```

The prop is named `onTokenChange` (not `onAuthenticated`) to accurately reflect that it is called with both a new token (on login) and `null` (on 401 logout). Remove internal `token` useState and localStorage initialization. Keep AuthModal trigger, 401 handler (`localStorage.removeItem` + `onTokenChange(null)`), and stream logic unchanged.

## Data flow

```
HomePage (owns token state)
  ├── header → decodeEmail(token) → renders email
  └── VibeController(token, onTokenChange)
        ├── AuthModal → onTokenChange(newToken) → sets state in HomePage
        └── 401 handler → onTokenChange(null) → clears state in HomePage
        └── stream logic uses token prop
```

## JWT decoding

Module-level helper, no library needed. The JWT middle segment is standard base64url — re-padded before passing to `atob` to handle JWTs that omit trailing `=` characters:

```ts
function decodeEmail(token: string): string | null {
  try {
    const seg = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = seg + "=".repeat((4 - (seg.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}
```

## Error handling

- Malformed JWT → `decodeEmail` returns `null` → email not shown, no crash
- Token cleared on 401 → VibeController calls `onTokenChange(null)` → `token` in HomePage becomes `null` → email disappears, AuthModal reappears

## Files changed

| File | Change |
|------|--------|
| `frontend/src/app/page.tsx` | Add token state (with SSR guard), module-level `decodeEmail`, email in header, pass `token` + `onTokenChange` props to VibeController |
| `frontend/src/components/vibe-controller.tsx` | Accept `token` + `onTokenChange` as props, remove internal token state and localStorage read, call `onTokenChange(null)` on 401 |

## Out of scope

- Sign-out button
- Avatar / display name
- `/me` API endpoint
- Token expiry detection (expired-but-present token will show email until the first API call returns 401)
