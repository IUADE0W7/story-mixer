# UI Localization Design

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Frontend only (`frontend/`)

---

## Problem

The LoreForge UI has a "Story Language" selector (English / Ukrainian) that currently:
- Passes the chosen language to the backend for story generation ✓
- Translates only **5 of ~150 UI strings** via a minimal hand-rolled `i18n.ts` ✗

All other interface text — slider labels, button text, seed tags, tone descriptors, status messages, placeholders, validation errors — is hardcoded in English regardless of the selected language.

---

## Goals

1. All UI strings reflect the selected Story Language at all times.
2. Typed translation keys — missing translations are caught at compile time.
3. Language persists across sessions via `localStorage`.
4. Easy to add a third language in the future (one new locale file, no structural changes).
5. No external i18n dependencies.

---

## Approach: Namespaced typed locale files + React Context

A structured, dependency-free i18n system:
- One TypeScript locale file per language (`en.ts`, `uk.ts`).
- `uk.ts` must satisfy the same shape as `en.ts` — enforced by TypeScript.
- A `LanguageContext` provides `{ lang, setLang, t }` to all components.
- `localStorage` persists the user's choice; browser locale used as fallback.

---

## File Structure

```
frontend/src/
  locales/
    en.ts          ← master translation file (source of type shape)
    uk.ts          ← Ukrainian translations, identical shape
    index.ts       ← exports Lang, Translations, TranslationKey, locales map
  lib/
    language-context.tsx   ← LanguageProvider + useLanguage() hook
    i18n.ts                ← DELETED
```

---

## Translation Namespaces

All keys are dot-separated strings. The full key set is derived from `en.ts`.

| Namespace | Contents |
|-----------|----------|
| `vibe.briefing.*` | Story Briefing section header, description ("Define the source tales…"), and sub-labels |
| `vibe.sliders.*` | Aggression, Reader Respect, Morality, Source Fidelity labels and descriptions |
| `vibe.seeds.*` | Seed tag labels (Lone Wanderer, Dark Prophecy, etc.) |
| `vibe.tones.*` | Tone adjectives and genre flavor text. Sub-keys: `vibe.tones.aggressionAdjective.*` (e.g. `tranquil`, `visceral`), `vibe.tones.moralityModifier.*` (e.g. `nihilistic`, `righteous`), `vibe.tones.genreFlavor.*` (e.g. `hardboiled`, `dreadLaden`) |
| `vibe.bands.*` | Slider band labels: Strongly Minimized, Restrained, Balanced, Elevated, Dominant |
| `vibe.status.*` | Chapter state labels: writing…, revising, done, low quality, pending, generating |
| `vibe.buttons.*` | FORGE NARRATIVE, SWITCH, DISMISS, Download PDF, etc. |
| `vibe.fields.*` | Source Tale A/B, Genre, Chapters, Words/ch., Model, Judge Model, Temperature |
| `vibe.placeholders.*` | Input placeholder text |
| `vibe.validation.*` | Required-field error messages |
| `vibe.language.*` | Story Language section label |
| `vibe.provider.*` | Provider Configuration section and related labels |
| `vibe.channels.*` | Channel Calibration section label and description ("1 – 10 range. Granular narrative control.") |
| `vibe.intensity.*` | Slider intensity band labels: Minimal, Low, Moderate, High, Max (used in `aria-valuetext`) |
| `vibe.warnings.*` | Soft warning messages keyed by existing snake_case codes: `stern_but_respectful`, `preachy_risk`, `detached_risk`, `neutral_collapse_risk`, `extreme_tone_risk` |
| `ui.header.*` | "Story Mixer" title, "LoreForge — Calibrated Narrative" subtitle, "Studio ready" status |
| `ui.footer.*` | "LoreForge · Calibrated narrative generation · tune the vibe, brew the story" tagline |
| `ui.agentLog.*` | "Agent Interaction Log" header, help text |
| `ui.notFound.*` | 404 page: code, title, body, returnHome link |

---

## Language Context

`language-context.tsx` must be a Client Component (`"use client"`). Because Next.js 15 SSR-renders Client Components to generate the initial HTML, `localStorage` and `navigator` are not available on the server. The provider must initialise with a safe default and sync from storage after mount:

```tsx
"use client";
// src/lib/language-context.tsx

const STORAGE_KEY = "loreforge.language";

function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Safe default for SSR — actual stored value applied in useEffect
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLang(stored)) {
      setLangState(stored as Lang);
    } else if (navigator.language.startsWith("uk")) {
      setLangState("uk");
    }
  }, []);

  const setLang = (l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  };

  const t = (key: TranslationKey): string =>
    getNestedValue(locales[lang], key);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
```

This means the initial server-rendered HTML will show English strings, and the correct language is applied on the client after hydration. This is acceptable for this app because the language selector is inside the interactive VibeController anyway — no SEO-sensitive content depends on the language choice.

### Placement in layout.tsx

`layout.tsx` is a Server Component. `LanguageProvider` is added as a wrapper around `{children}`:

```tsx
// layout.tsx (Server Component — no hooks allowed here)
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
```

`layout.tsx` has no user-visible translatable strings beyond the `<html lang>` attribute. Since the selected language is only known client-side (after localStorage hydration), updating `<html lang>` dynamically requires an additional Client Component effect — this is out of scope for this iteration. The attribute stays as `lang="en"`.

### TranslationKey type

`TranslationKey` is a recursive template literal type derived from the shape of `en.ts`:

```ts
type Leaves<T, P extends string = ""> =
  T extends string
    ? P
    : { [K in keyof T & string]: Leaves<T[K], `${P}${P extends "" ? "" : "."}${K}`> }[keyof T & string];

export type TranslationKey = Leaves<typeof en>;
```

`getNestedValue` resolves a dot-separated key against the nested locale object at runtime using `key.split(".").reduce(...)`.

---

## Component Migration

### `vibe-controller.tsx`
- Remove local `language` state and local `t()` function.
- Call `const { lang, setLang, t } = useLanguage()` at the top of the component.
- Replace all hardcoded English strings with `t("namespace.key")` calls.
- Pass `lang` (not `t`) into the story generation payload — unchanged behaviour.

### `vibe-bands.ts`

`vibe-bands.ts` has two categories of translatable content:

**1. Simple label maps** (`bandLabelMap`, `AGGRESSION_ADJECTIVE`, `MORALITY_MODIFIER`, `GENRE_FLAVOR`):
These map a value → a single string. Refactor to return a **translation key** instead of a resolved string. Callers receive the key and pass it through `t()`. Keys map to their respective namespaces: `bandLabelMap` → `vibe.bands.*`, `AGGRESSION_ADJECTIVE` → `vibe.tones.aggressionAdjective.*`, `MORALITY_MODIFIER` → `vibe.tones.moralityModifier.*`, `GENRE_FLAVOR` → `vibe.tones.genreFlavor.*`.

**2. Composed tone strings** (`buildToneLabel`):
This function assembles multiple parts (adjective + modifier + genre flavor) into a single display string like `"Tranquil Nihilistic Hardboiled Noir"`. Each part is translated individually via its own key, then the parts are assembled by the caller after translation. `buildToneLabel` returns an array of translation keys (or a structured object); the caller joins the resolved strings.

**3. Soft warning messages** (`deriveSoftWarnings`):
Returns `SoftWarning` objects with hardcoded English `message` strings. The existing `SoftWarning.code` union type uses snake_case (`stern_but_respectful`, `preachy_risk`, etc.) — translation keys use the same casing to avoid a refactor: `t("vibe.warnings.stern_but_respectful")`. Callers replace the resolved `message` field with `t(\`vibe.warnings.${warning.code}\`)`.

**4. Return type of `buildToneLabel`:**
Returns `TranslationKey[]` — an ordered array of translation keys. The caller maps each key through `t()` and joins the results with a space to produce the display string.

`GENRE_FLAVOR` (~12 genre → adjective mappings) is covered under `vibe.tones.genreFlavor.*`.

### `agent-interaction-log.tsx`, `page.tsx`

- Add `useLanguage()` call.
- Replace hardcoded strings with `t()` calls.

### `not-found.tsx`

- Contains four user-visible strings: "404", "Page not found", body text, and "Return Home" link.
- Add `ui.notFound.*` namespace with keys: `code`, `title`, `body`, `returnHome`.
- Add `"use client"` directive to access `useLanguage()`.

---

## localStorage Behaviour

| Scenario | Result |
|----------|--------|
| First visit, no stored preference, browser is `uk-UA` | Defaults to Ukrainian |
| First visit, no stored preference, browser is `en-US` | Defaults to English |
| User switches language | Choice written to `localStorage["loreforge.language"]` |
| User returns | Stored language restored |
| Invalid/corrupted value in storage | Falls back to browser locale → English |

---

## What Does NOT Change

- Language is still passed to the backend in the story generation payload (`context.language`).
- Backend LLM prompting logic is unchanged.
- The language selector UI (dropdown in VibeController) stays in place — it now calls `setLang` from context instead of local state.

---

## Migration Order

1. Create `locales/en.ts`, `locales/uk.ts`, `locales/index.ts`
2. Create `lib/language-context.tsx`
3. Wrap app in `LanguageProvider` via `layout.tsx`
4. Migrate `vibe-controller.tsx` (largest effort, ~120 strings)
5. Refactor `vibe-bands.ts` to return keys; update its consumers
6. Migrate `agent-interaction-log.tsx`, `page.tsx`, `not-found.tsx` (`layout.tsx` has no translatable strings)
7. Delete `lib/i18n.ts`

---

## Out of Scope

- URL-based locale routing (e.g. `/uk/...`)
- Server-side i18n (backend error messages, API responses)
- Languages beyond English and Ukrainian (structure supports it; content not planned)
- `layout.tsx` metadata (`<title>`, `<meta description>`) — static metadata, not user-visible UI
- Dynamic `<html lang>` attribute — requires client-side effect after hydration, deferred to future iteration
