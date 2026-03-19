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

### 4. All four locale files — `vibe.language` section

Add two new keys to every locale file so the language switcher displays language names in each language:

```
vibe.language.russian   — "Russian" / "Русский" / "Орыс тілі" / "Російська"
vibe.language.kazakh    — "Kazakh" / "Қазақша" / "Қазақша" / "Казахська"
```

### 5. `frontend/src/components/vibe-controller.tsx`

Add Russian and Kazakh buttons/options to the language selector, following the same pattern as the existing English and Ukrainian options. Use `t("vibe.language.russian")` and `t("vibe.language.kazakh")` for labels, and `lang === "ru"` / `lang === "kk"` for active state.

---

## Non-goals

- Auth modal localization (excluded per user decision)
- URL-based routing (`/ru/`, `/kk/` prefixes)
- Backend/API error message localization
- Dynamic `<html lang>` attribute update (pre-existing gap, out of scope)

---

## Testing

- Manually switch to Russian and Kazakh in the UI — verify all labels render in the correct language
- Set `navigator.language` to `"ru"` or `"kk"` in browser devtools and reload — verify auto-detection
- TypeScript compile (`tsc --noEmit`) must pass — the `typeof en` constraint on new locale files catches missing keys
