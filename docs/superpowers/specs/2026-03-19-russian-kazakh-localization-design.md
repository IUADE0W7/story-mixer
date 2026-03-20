# Russian & Kazakh Localization — Design Spec

**Date:** 2026-03-19
**Scope:** Main UI only (auth modal excluded)
**Approach:** Mirror existing pattern (en/uk)

---

## Context

The project has a custom i18n system with ~220 translation keys per locale, stored as typed TypeScript objects in `frontend/src/locales/`. Two locales exist: `en` (English) and `uk` (Ukrainian). The `Lang` type, `locales` record, `languageFlag()`, and `isValidLang()` in `index.ts` are the sole registration points. Language auto-detection and persistence live in `language-context.tsx`. The UI language selector is in `vibe-controller.tsx`.

---

## Changes

### 1. New locale files

**`frontend/src/locales/ru.ts`**
Russian translations for all ~220 keys, typed as `typeof en`. Same structure as `uk.ts`.

**`frontend/src/locales/kk.ts`**
Kazakh translations for all ~220 keys, typed as `typeof en`. Same structure as `uk.ts`.

### 2. `frontend/src/locales/index.ts`

- `Lang` type: `"en" | "uk" | "ru" | "kk"`
- `locales` record: add `ru` and `kk` entries
- `languageFlag()`: add `"ru" → "🇷🇺"`, `"kk" → "🇰🇿"`
- `isValidLang()`: accept `"ru"` and `"kk"`

### 3. `frontend/src/lib/language-context.tsx`

Add auto-detection in `readStoredLang()`:
- `navigator.language.startsWith("ru")` → `"ru"`
- `navigator.language.startsWith("kk")` → `"kk"`

Detection order: stored preference → Russian → Kazakh → Ukrainian → English (default).

**Why this order:** Russian is checked before Kazakh because `"ru-KZ"` (Russian as used in Kazakhstan) is a valid browser locale tag that starts with `"ru"`, not `"kk"`. A Kazakh-language user will have `"kk"` or `"kk-KZ"`. Ordering Russian first ensures `"ru-KZ"` maps to Russian, not Kazakh.

### 4. All four locale files — `vibe.language` section

Add two new keys to every locale file so the language switcher displays language names in each language.

**Edit `frontend/src/locales/en.ts`** — add inside `vibe.language`:

```ts
russian: "Russian",
kazakh: "Kazakh",
```

**Edit `frontend/src/locales/uk.ts`** — add inside `vibe.language`:

```ts
russian: "Російська",
kazakh: "Казахська",
```

**In `ru.ts` (new file)** — include inside `vibe.language`:

```ts
russian: "Русский",
kazakh: "Казахский",
```

**In `kk.ts` (new file)** — include inside `vibe.language`:

```ts
russian: "Орыс тілі",
kazakh: "Қазақша",
```

### 5. `frontend/src/components/vibe-controller.tsx`

Add Russian and Kazakh buttons/options to the language selector, following the same pattern as the existing English and Ukrainian options. Use `t("vibe.language.russian")` and `t("vibe.language.kazakh")` for labels, and `lang === "ru"` / `lang === "kk"` for active state.

### 6. Cyrillic detection banner (`cyrillicDetected`)

The existing system shows a banner when Cyrillic text is detected, prompting the user to switch to Ukrainian. With Russian added, a Russian-language user would see "Ukrainian text detected — switch story language?" — which is confusing.

**Decision:** Suppress the Cyrillic detection banner when `lang === "ru"`. Russian users have already opted into a Cyrillic language; the Ukrainian-switch prompt is irrelevant to them.

No equivalent banner is added for Kazakh (Kazakh Cyrillic detection is out of scope).

---

## Non-goals

- Auth modal localization (excluded per user decision)
- URL-based routing (`/ru/`, `/kk/` prefixes)
- Backend/API error message localization
- Dynamic `<html lang>` attribute update (pre-existing gap, out of scope)
- Cyrillic detection prompt for Kazakh

---

## Testing

- Manually switch to Russian and Kazakh in the UI — verify all labels render in the correct language
- Set `navigator.language` to `"ru"` or `"kk"` in browser devtools and reload — verify auto-detection
- Type Cyrillic text with `lang === "ru"` active — verify the Ukrainian detection banner does NOT appear
- TypeScript compile (`tsc --noEmit`) must pass — the `typeof en` constraint on new locale files catches missing keys
