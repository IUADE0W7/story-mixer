# Logged-User Email in Header Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the authenticated user's email in the app header alongside the existing "Studio Ready" pip.

**Architecture:** Lift `token` state from `VibeController` up to `HomePage` in `page.tsx`. Extract a `decodeEmail` pure helper to `lib/auth.ts` (minor deviation from spec — keeping it out of the page file makes it importable in Vitest without pulling in React/Next.js page machinery). Pass `token` and `onTokenChange` as props into `VibeController`.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest (test runner — same as existing `frontend/src/lib/__tests__/` tests)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/lib/auth.ts` | Create | `decodeEmail` pure helper |
| `frontend/src/lib/__tests__/auth.test.ts` | Create | Unit tests for `decodeEmail` |
| `frontend/src/app/page.tsx` | Modify | Owns token state, renders email in header |
| `frontend/src/components/vibe-controller.tsx` | Modify | Accepts token + onTokenChange props |

---

### Task 1: `decodeEmail` helper

**Files:**
- Create: `frontend/src/lib/auth.ts`
- Create: `frontend/src/lib/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/__tests__/auth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decodeEmail } from "../auth";

// A valid JWT: header.payload.signature
// Payload: { "email": "user@example.com", "user_id": "abc123" }
const VALID_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9." +
  "eyJlbWFpbCI6InVzZXJAZXhhbXBsZS5jb20iLCJ1c2VyX2lkIjoiYWJjMTIzIn0." +
  "signature";

// Payload with no padding needed (length % 4 === 0 already)
// { "email": "a@b.co" }
const UNPADDED_TOKEN =
  "eyJhbGciOiJIUzI1NiJ9." +
  "eyJlbWFpbCI6ImFAYi5jbyJ9." +
  "signature";

describe("decodeEmail", () => {
  it("extracts email from a valid JWT", () => {
    expect(decodeEmail(VALID_TOKEN)).toBe("user@example.com");
  });

  it("handles base64url payloads that need re-padding", () => {
    expect(decodeEmail(UNPADDED_TOKEN)).toBe("a@b.co");
  });

  it("returns null for a malformed token (not three segments)", () => {
    expect(decodeEmail("not.a.jwt.at.all.extra")).toBe(null);
  });

  it("returns null when payload has no email field", () => {
    // { "user_id": "abc" }
    const noEmail =
      "eyJhbGciOiJIUzI1NiJ9." +
      "eyJ1c2VyX2lkIjoiYWJjIn0." +
      "sig";
    expect(decodeEmail(noEmail)).toBe(null);
  });

  it("returns null when email field is not a string", () => {
    // { "email": 42 }
    const badEmail =
      "eyJhbGciOiJIUzI1NiJ9." +
      "eyJlbWFpbCI6NDJ9." +
      "sig";
    expect(decodeEmail(badEmail)).toBe(null);
  });

  it("returns null for empty string", () => {
    expect(decodeEmail("")).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: FAIL — `decodeEmail` not found.

- [ ] **Step 3: Implement `decodeEmail`**

Create `frontend/src/lib/auth.ts`:

```ts
/**
 * Decode the email claim from a JWT without verifying the signature.
 * Safe for display-only use — backend verifies the token on every API call.
 * Returns null on any error (malformed token, missing claim, etc.).
 */
export function decodeEmail(token: string): string | null {
  try {
    const seg = token.split(".")[1];
    if (!seg) return null;
    const padded = seg.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (seg.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const email = (payload as Record<string, unknown>).email;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/lib/__tests__/auth.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/auth.ts frontend/src/lib/__tests__/auth.test.ts
git commit -m "feat: add decodeEmail JWT helper with tests"
```

---

### Task 2: Update `VibeController` to accept token as props

**Files:**
- Modify: `frontend/src/components/vibe-controller.tsx`

The goal: remove internal `token` state and replace with `token` + `onTokenChange` props. The component must call `onTokenChange(newToken)` after a successful login, and `onTokenChange(null)` when a 401 clears the session.

- [ ] **Step 1: Read the current `VibeController` component**

Open `frontend/src/components/vibe-controller.tsx` and locate:
1. The `token` useState (around line 366)
2. The `lfStatus === "unauthenticated"` block that calls `localStorage.removeItem` (around line 393)
3. The `onAuthenticated` callback passed to `AuthModal` (around line 441)

- [ ] **Step 2: Update the props type**

Find the existing props type (likely named `VibeControllerProps` or similar). Add two new props:

```ts
token: string | null;
onTokenChange: (token: string | null) => void;
```

- [ ] **Step 3: Remove internal token state**

Delete the `useState` lines:
```ts
const [token, setToken] = useState<string | null>(() =>
  typeof window !== "undefined" ? localStorage.getItem("lf_token") : null
);
```

The component now receives `token` from props.

- [ ] **Step 4: Replace internal setToken calls with onTokenChange**

- In the `AuthModal` callback: replace `setToken(t)` with `onTokenChange(t)`
- In the 401 handler: replace `setToken(null)` (and any `localStorage.removeItem`) with `onTokenChange(null)`

  Note: `localStorage.removeItem("lf_token")` should stay in the 401 handler — the parent `HomePage` will also call `localStorage.setItem` and read from it, so the cleanup must happen somewhere. Keep it in `VibeController` where the 401 is detected.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors. (page.tsx will have errors until Task 3 — that's fine for now, or comment out the VibeController usage temporarily if needed.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/vibe-controller.tsx
git commit -m "refactor: accept token + onTokenChange as props in VibeController"
```

---

### Task 3: Lift token state to `page.tsx` and show email in header

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Add token state to `HomePage`**

At the top of `HomePage`, add:

```ts
import { decodeEmail } from "@/lib/auth";

// inside HomePage:
const [token, setToken] = useState<string | null>(() =>
  typeof window !== "undefined" ? localStorage.getItem("lf_token") : null
);

function handleTokenChange(t: string | null) {
  if (t) {
    localStorage.setItem("lf_token", t);
  } else {
    localStorage.removeItem("lf_token");
  }
  setToken(t);
}

const email = token ? decodeEmail(token) : null;
```

- [ ] **Step 2: Add email to the header**

Find the header right-side area (the `<div className="flex items-center gap-2">` around line 91 that contains the status pip). Prepend the email span before the pip:

```tsx
{email && (
  <>
    <span className="lf-section-label" style={{ color: "var(--cream-muted)" }}>
      {email}
    </span>
    <span className="lf-section-label" style={{ color: "var(--cream-faint)" }} aria-hidden="true">
      •
    </span>
  </>
)}
```

- [ ] **Step 3: Pass props to `VibeController`**

Update the `<VibeController>` usage:

```tsx
<VibeController
  values={values}
  onChange={setValues}
  token={token}
  onTokenChange={handleTokenChange}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npx vitest run
```

Expected: All tests pass (including the new `auth.test.ts`).

- [ ] **Step 6: Smoke test in browser**

1. Start the dev server: `cd frontend && npm run dev`
2. Open `http://localhost:3000`
3. The auth modal should appear (not logged in)
4. Sign in with Google
5. After login: email address appears in the top-right header, to the left of the "Studio Ready" pip
6. Refresh the page — email persists (token survives page reload via localStorage)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: show logged-in user email in header"
```
