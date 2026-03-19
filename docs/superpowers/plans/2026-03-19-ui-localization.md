# UI Localization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin hand-rolled `i18n.ts` with a typed, namespaced translation system backed by `localStorage` persistence so every visible UI string respects the selected Story Language.

**Architecture:** A `LanguageProvider` (React Context) wraps the app in `layout.tsx`, reads/writes `localStorage` key `loreforge.language`, and exposes `{ lang, setLang, t }`. All components call `useLanguage()` directly — no prop-drilling. Locale files (`en.ts`, `uk.ts`) are nested objects; `TranslationKey` is derived structurally from `en.ts` so TypeScript enforces completeness of `uk.ts`.

**Tech Stack:** Next.js 15 App Router, React 19 Context, TypeScript strict, Vitest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/locales/en.ts` | Master English translations (source of type truth) |
| Create | `frontend/src/locales/uk.ts` | Ukrainian translations, same shape as `en.ts` |
| Create | `frontend/src/locales/index.ts` | `Lang`, `Translations`, `TranslationKey`, `locales` map, `languageFlag()` |
| Create | `frontend/src/lib/language-context.tsx` | `LanguageProvider` + `useLanguage()` hook |
| Create | `frontend/src/lib/__tests__/language-context.test.ts` | Unit tests for context logic |
| Create | `frontend/src/lib/__tests__/locales.test.ts` | Completeness + shape tests |
| Modify | `frontend/src/app/layout.tsx` | Wrap `children` in `LanguageProvider` |
| Modify | `frontend/src/lib/vibe-bands.ts` | Remove `message` field from `SoftWarning`; `bandLabelMap`/`toneLabelMap` stay but callers resolve via `t()` |
| Modify | `frontend/src/components/vibe-controller.tsx` | Use `useLanguage()`; replace all hardcoded strings with `t()` |
| Modify | `frontend/src/components/agent-interaction-log.tsx` | Use `useLanguage()` for title + empty state |
| Modify | `frontend/src/app/page.tsx` | Use `useLanguage()` for header/footer strings |
| Modify | `frontend/src/app/not-found.tsx` | Add `"use client"`, use `useLanguage()` |
| Delete | `frontend/src/lib/i18n.ts` | Replaced entirely |

---

## Task 1: Create locale files

**Files:**
- Create: `frontend/src/locales/en.ts`
- Create: `frontend/src/locales/uk.ts`
- Create: `frontend/src/locales/index.ts`

- [ ] **Step 1.1: Write `en.ts`**

```typescript
// frontend/src/locales/en.ts
const en = {
  vibe: {
    briefing: {
      sectionLabel: "Story Briefing",
      description: "Define the source tales to blend and craft the opening scene.",
      sourceTaleA: "Source Tale A",
      sourceTaleB: "Source Tale B",
      narrativeTone: "Narrative Tone",
      narrativeFallback: "Narrative",
    },
    language: {
      sectionLabel: "Story Language",
      english: "English",
      ukrainian: "Ukrainian",
      cyrillicDetected: "🇺🇦 Ukrainian text detected — switch story language?",
    },
    brief: {
      sectionLabel: "Story Brief",
      placeholder: "Describe the opening scene, protagonist, setting, and the kind of tension you want.",
    },
    seeds: {
      loneWanderer: "Lone Wanderer",
      darkProphecy: "Dark Prophecy",
      hiddenMonster: "Hidden Monster",
      unlikelyAllies: "Unlikely Allies",
      forbiddenArchive: "Forbidden Archive",
      lastBloodline: "Last Bloodline",
      theBetrayal: "The Betrayal",
      shatteredCity: "Shattered City",
    },
    fields: {
      genre: "Genre",
      chapters: "Chapters",
      wordsPerChapter: "Words/ch.",
      provider: "Provider",
      model: "Model",
      judgeModel: "Judge Model",
      temperature: "Temperature",
    },
    placeholders: {
      sourceTaleA: "e.g. Moby Dick",
      sourceTaleB: "e.g. Blade Runner",
      selectGenre: "Select genre…",
    },
    validation: {
      originalStoryA: "Original Story A",
      originalStoryB: "Original Story B",
      genre: "Genre",
      pleaseFillIn: "Please fill in:",
    },
    sliders: {
      aggression: {
        label: "Aggression",
        description: "Narrative intensity and verbal force.",
      },
      readerRespect: {
        label: "Reader Respect",
        description: "Trust in the reader's intelligence.",
      },
      morality: {
        label: "Morality",
        description: "Ethical framing and judgment intensity.",
      },
      sourceFidelity: {
        label: "Source Fidelity",
        description: "Original source vs. invented narrative.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Tranquil",
        restrained: "Measured",
        balanced: "Charged",
        elevated: "Grim",
        dominant: "Visceral",
      },
      moralityModifier: {
        strongly_minimized: "Nihilistic",
        restrained: "Gray",
        balanced: "",
        elevated: "Earnest",
        dominant: "Righteous",
      },
      genreFlavor: {
        noir: "Hardboiled",
        horror: "Dread-Laden",
        thriller: "High-Stakes",
        fantasy: "Mythic",
        scienceFiction: "Cerebral",
        romance: "Intimate",
        historicalFiction: "Period",
        fairyTale: "Enchanted",
        mystery: "Cryptic",
        adventure: "Kinetic",
        mythology: "Epic",
        speculativeFiction: "Speculative",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Gentle",
          restrained: "Measured",
          balanced: "Tense",
          elevated: "Forceful",
          dominant: "Combustive",
        },
        readerRespect: {
          strongly_minimized: "Provocative",
          restrained: "Spare",
          balanced: "Balanced",
          elevated: "Trusting",
          dominant: "Expert-facing",
        },
        morality: {
          strongly_minimized: "Amoral",
          restrained: "Ambiguous",
          balanced: "Textured",
          elevated: "Principled",
          dominant: "Righteous",
        },
        sourceFidelity: {
          strongly_minimized: "Pure Invention",
          restrained: "Loose Inspiration",
          balanced: "Blended",
          elevated: "Faithful",
          dominant: "Canonical",
        },
      },
    },
    bands: {
      strongly_minimized: "Strongly Minimized",
      restrained: "Restrained",
      balanced: "Balanced",
      elevated: "Elevated",
      dominant: "Dominant",
    },
    intensity: {
      strongly_minimized: "Minimal",
      restrained: "Low",
      balanced: "Moderate",
      elevated: "High",
      dominant: "Max",
    },
    status: {
      pending: "pending",
      writing: "writing…",
      revising: "revising",
      done: "done",
      lowQuality: "low quality",
      readyToGenerate: "Ready to generate",
      pressForgeNarrative: "Press Forge Narrative to start the agentic pipeline.",
    },
    buttons: {
      forgeNarrative: "FORGE NARRATIVE",
      brewingNarrative: "BREWING NARRATIVE",
      switch: "SWITCH",
      dismiss: "DISMISS",
      downloadPdf: "Download PDF",
    },
    channels: {
      sectionLabel: "Channel Calibration",
      description: "1 – 10 range. Granular narrative control.",
    },
    provider: {
      sectionLabel: "Provider Configuration",
    },
    progress: {
      sectionLabel: "Long-form Progress",
      tableOfContents: "Table of Contents",
    },
    warnings: {
      stern_but_respectful:
        "High aggression plus high reader respect targets stern professionalism, not abusive tone.",
      preachy_risk: "High morality with low reader respect can drift into lecturing prose.",
      detached_risk: "Low morality with high reader respect can read clinically detached.",
      neutral_collapse_risk:
        "Balanced settings across all sliders may produce generic prose without stylistic anchors.",
      extreme_tone_risk:
        "Extreme settings are valid but should be judged for coherence and policy safety.",
    },
    hints: {
      setGenreToBegin: "Set genre and calibrate channels to begin",
    },
    pdf: {
      exportFailed: "PDF export failed — try again",
    },
  },
  ui: {
    header: {
      title: "Story Mixer",
      subtitle: "LoreForge — Calibrated Narrative",
      studioReady: "Studio ready",
    },
    footer: {
      tagline: "LoreForge · Calibrated narrative generation · tune the vibe, brew the story",
    },
    agentLog: {
      title: "Agent Interaction Log",
      empty: "No interactions recorded yet — start generation to see the agent pipeline.",
    },
    notFound: {
      title: "Page not found",
      body: "The page you requested does not exist or may have been moved.",
      returnHome: "Return Home",
    },
  },
} as const;

export default en;
```

- [ ] **Step 1.2: Write `uk.ts`**

```typescript
// frontend/src/locales/uk.ts
import type en from "./en";

const uk: typeof en = {
  vibe: {
    briefing: {
      sectionLabel: "Інструкції до історії",
      description: "Визначте першоджерела для змішування та задайте початкову сцену.",
      sourceTaleA: "Першоджерело A",
      sourceTaleB: "Першоджерело B",
      narrativeTone: "Тон нарративу",
      narrativeFallback: "Нарратив",
    },
    language: {
      sectionLabel: "Мова історії",
      english: "Англійська",
      ukrainian: "Українська",
      cyrillicDetected: "🇺🇦 Виявлено кириличний текст — змінити мову?",
    },
    brief: {
      sectionLabel: "Короткий опис",
      placeholder: "Опишіть початкову сцену, головного героя, місце дії та тип напруги.",
    },
    seeds: {
      loneWanderer: "Самотній мандрівник",
      darkProphecy: "Темне пророцтво",
      hiddenMonster: "Прихований монстр",
      unlikelyAllies: "Несподівані союзники",
      forbiddenArchive: "Заборонений архів",
      lastBloodline: "Остання лінія крові",
      theBetrayal: "Зрада",
      shatteredCity: "Зруйноване місто",
    },
    fields: {
      genre: "Жанр",
      chapters: "Розділи",
      wordsPerChapter: "Слів/розд.",
      provider: "Провайдер",
      model: "Модель",
      judgeModel: "Модель-суддя",
      temperature: "Температура",
    },
    placeholders: {
      sourceTaleA: "напр. Мобі Дік",
      sourceTaleB: "напр. Той, що біжить по лезу",
      selectGenre: "Оберіть жанр…",
    },
    validation: {
      originalStoryA: "Оригінальна історія A",
      originalStoryB: "Оригінальна історія B",
      genre: "Жанр",
      pleaseFillIn: "Будь ласка, заповніть:",
    },
    sliders: {
      aggression: {
        label: "Агресія",
        description: "Інтенсивність нарративу та вербальна сила.",
      },
      readerRespect: {
        label: "Повага до читача",
        description: "Довіра до інтелекту читача.",
      },
      morality: {
        label: "Мораль",
        description: "Етична рамка та інтенсивність судження.",
      },
      sourceFidelity: {
        label: "Вірність джерелу",
        description: "Оригінальне джерело проти вигаданого нарративу.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Спокійний",
        restrained: "Виважений",
        balanced: "Напружений",
        elevated: "Похмурий",
        dominant: "Вісцеральний",
      },
      moralityModifier: {
        strongly_minimized: "Нігілістичний",
        restrained: "Сірий",
        balanced: "",
        elevated: "Щирий",
        dominant: "Праведний",
      },
      genreFlavor: {
        noir: "Крутий",
        horror: "Страхітливий",
        thriller: "Напружений",
        fantasy: "Міфічний",
        scienceFiction: "Церебральний",
        romance: "Інтимний",
        historicalFiction: "Епохальний",
        fairyTale: "Зачарований",
        mystery: "Загадковий",
        adventure: "Кінетичний",
        mythology: "Епічний",
        speculativeFiction: "Спекулятивний",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Лагідний",
          restrained: "Виважений",
          balanced: "Напружений",
          elevated: "Потужний",
          dominant: "Вибуховий",
        },
        readerRespect: {
          strongly_minimized: "Провокаційний",
          restrained: "Стислий",
          balanced: "Збалансований",
          elevated: "Довірливий",
          dominant: "Для експертів",
        },
        morality: {
          strongly_minimized: "Аморальний",
          restrained: "Неоднозначний",
          balanced: "Текстурований",
          elevated: "Принциповий",
          dominant: "Праведний",
        },
        sourceFidelity: {
          strongly_minimized: "Чиста вигадка",
          restrained: "Вільне натхнення",
          balanced: "Змішаний",
          elevated: "Вірний",
          dominant: "Канонічний",
        },
      },
    },
    bands: {
      strongly_minimized: "Мінімізований",
      restrained: "Стриманий",
      balanced: "Збалансований",
      elevated: "Підвищений",
      dominant: "Домінантний",
    },
    intensity: {
      strongly_minimized: "Мінімум",
      restrained: "Низька",
      balanced: "Помірна",
      elevated: "Висока",
      dominant: "Максимум",
    },
    status: {
      pending: "очікування",
      writing: "написання…",
      revising: "редагування",
      done: "готово",
      lowQuality: "низька якість",
      readyToGenerate: "Готово до генерації",
      pressForgeNarrative: "Натисніть «Кувати нарратив» для запуску агентного конвеєра.",
    },
    buttons: {
      forgeNarrative: "КУВАТИ НАРРАТИВ",
      brewingNarrative: "ВАРИМО НАРРАТИВ",
      switch: "ЗМІНИТИ",
      dismiss: "ІГНОРУВАТИ",
      downloadPdf: "Завантажити PDF",
    },
    channels: {
      sectionLabel: "Калібрування каналів",
      description: "Діапазон 1–10. Гранульований контроль нарративу.",
    },
    provider: {
      sectionLabel: "Налаштування провайдера",
    },
    progress: {
      sectionLabel: "Прогрес довгої форми",
      tableOfContents: "Зміст",
    },
    warnings: {
      stern_but_respectful:
        "Висока агресія з високою повагою до читача дає суворий професіоналізм, а не образливий тон.",
      preachy_risk: "Висока мораль з низькою повагою до читача може перетворитися на повчальну прозу.",
      detached_risk:
        "Низька мораль з високою повагою до читача може звучати клінічно відстороненою.",
      neutral_collapse_risk:
        "Збалансовані налаштування всіх повзунків можуть призвести до загальної прози без стилістичних якорів.",
      extreme_tone_risk:
        "Екстремальні налаштування допустимі, але слід оцінювати їх на зв'язність та безпечність.",
    },
    hints: {
      setGenreToBegin: "Встановіть жанр і відкалібруйте канали для початку",
    },
    pdf: {
      exportFailed: "Помилка експорту PDF — спробуйте ще раз",
    },
  },
  ui: {
    header: {
      title: "Змішувач Історій",
      subtitle: "LoreForge — Відкалібрований Нарратив",
      studioReady: "Студія готова",
    },
    footer: {
      tagline:
        "LoreForge · Генерація відкаліброваного нарративу · налаштуй вайб, зваряй історію",
    },
    agentLog: {
      title: "Журнал взаємодії агентів",
      empty: "Ще немає взаємодій — почніть генерацію, щоб побачити конвеєр агентів.",
    },
    notFound: {
      title: "Сторінку не знайдено",
      body: "Сторінка, яку ви запитали, не існує або могла бути переміщена.",
      returnHome: "На головну",
    },
  },
} as const;

export default uk;
```

- [ ] **Step 1.3: Write `index.ts`**

```typescript
// frontend/src/locales/index.ts
import en from "./en";
import uk from "./uk";

export type Lang = "en" | "uk";
export type Translations = typeof en;

// Derive a flat union of all dotted key paths from the nested translations object.
// e.g. "vibe.briefing.sectionLabel" | "vibe.bands.balanced" | ...
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends object
    ? DotPaths<T[K], `${Prefix}${K & string}.`>
    : `${Prefix}${K & string}`;
}[keyof T];

export type TranslationKey = DotPaths<Translations>;

export const locales: Record<Lang, Translations> = { en, uk };

export function languageFlag(lang: string): string {
  switch ((lang || "").toLowerCase()) {
    case "uk":
      return "🇺🇦";
    case "en":
    default:
      return "🇬🇧";
  }
}

export function isValidLang(value: string): value is Lang {
  return value === "en" || value === "uk";
}

// Resolve a dotted key path against a translations object.
// e.g. getNestedValue(en, "vibe.bands.balanced") → "Balanced"
export function getNestedValue(obj: Translations, key: TranslationKey): string {
  const parts = key.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return key;
    current = current[part];
  }
  return typeof current === "string" ? current : key;
}
```

- [ ] **Step 1.4: Write locale shape test**

```typescript
// frontend/src/lib/__tests__/locales.test.ts
import { describe, it, expect } from "vitest";
import en from "../../locales/en";
import uk from "../../locales/uk";
import { getNestedValue, locales, isValidLang } from "../../locales/index";
import type { TranslationKey } from "../../locales/index";

// Collect all dotted key paths from a nested object
function collectKeys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v !== null ? collectKeys(v, path) : [path];
  });
}

describe("locale completeness", () => {
  const enKeys = collectKeys(en);
  const ukKeys = collectKeys(uk);

  it("uk has the same keys as en", () => {
    expect(ukKeys.sort()).toEqual(enKeys.sort());
  });

  it("all en values are strings", () => {
    for (const key of enKeys) {
      const val = getNestedValue(en as never, key as TranslationKey);
      expect(typeof val).toBe("string");
    }
  });
});

describe("getNestedValue", () => {
  it("resolves a valid key", () => {
    expect(getNestedValue(en, "vibe.bands.balanced")).toBe("Balanced");
    expect(getNestedValue(uk, "vibe.bands.balanced")).toBe("Збалансований");
  });

  it("returns the key itself for unknown paths", () => {
    expect(getNestedValue(en, "vibe.bands.nonexistent" as TranslationKey)).toBe(
      "vibe.bands.nonexistent"
    );
  });

  it("resolves empty string values (morality modifier balanced)", () => {
    expect(getNestedValue(en, "vibe.tones.moralityModifier.balanced")).toBe("");
  });
});

describe("isValidLang", () => {
  it("accepts known langs", () => {
    expect(isValidLang("en")).toBe(true);
    expect(isValidLang("uk")).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isValidLang("fr")).toBe(false);
    expect(isValidLang("")).toBe(false);
  });
});

describe("locales map", () => {
  it("exports both locales", () => {
    expect(locales.en).toBe(en);
    expect(locales.uk).toBe(uk);
  });
});
```

- [ ] **Step 1.5: Run tests — expect PASS**

```bash
cd frontend && npm run test -- --reporter=verbose src/lib/__tests__/locales.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 1.6: Commit**

```bash
cd frontend && git add src/locales/en.ts src/locales/uk.ts src/locales/index.ts src/lib/__tests__/locales.test.ts
git commit -m "feat: add typed namespaced locale files (en + uk)"
```

---

## Task 2: Create LanguageContext

**Files:**
- Create: `frontend/src/lib/language-context.tsx`
- Create: `frontend/src/lib/__tests__/language-context.test.ts`

- [ ] **Step 2.1: Write `language-context.tsx`**

```tsx
// frontend/src/lib/language-context.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  locales,
  isValidLang,
  getNestedValue,
  languageFlag,
  type Lang,
  type TranslationKey,
} from "@/locales/index";

const STORAGE_KEY = "loreforge.language";

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidLang(stored)) return stored;
    if (navigator.language.startsWith("uk")) return "uk";
  } catch {
    // localStorage unavailable (private mode etc.)
  }
  return "en";
}

interface LanguageContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
  flag: string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  const setLang = (l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore write failures
    }
    setLangState(l);
  };

  const t = (key: TranslationKey): string =>
    getNestedValue(locales[lang], key) || getNestedValue(locales.en, key);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, flag: languageFlag(lang) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
```

- [ ] **Step 2.2: Write context unit test**

```typescript
// frontend/src/lib/__tests__/language-context.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getNestedValue, isValidLang, languageFlag } from "../../locales/index";
import type { TranslationKey } from "../../locales/index";
import en from "../../locales/en";
import uk from "../../locales/uk";

// Test the pure helpers that back the context — component rendering
// is covered by E2E tests (Playwright).

describe("languageFlag", () => {
  it("returns UK flag for 'uk'", () => expect(languageFlag("uk")).toBe("🇺🇦"));
  it("returns GB flag for 'en'", () => expect(languageFlag("en")).toBe("🇬🇧"));
  it("returns GB flag for unknown lang", () => expect(languageFlag("fr")).toBe("🇬🇧"));
});

describe("t() fallback to en", () => {
  // Simulate what context's t() does: uk first, fallback to en
  function t(lang: "en" | "uk", key: TranslationKey): string {
    const locales = { en, uk };
    return (
      getNestedValue(locales[lang], key) || getNestedValue(locales.en, key)
    );
  }

  it("resolves uk string when present", () => {
    expect(t("uk", "vibe.briefing.sectionLabel")).toBe("Інструкції до історії");
  });

  it("falls back to en for empty-string values", () => {
    // moralityModifier.balanced is "" in both — should return "" not key
    expect(t("uk", "vibe.tones.moralityModifier.balanced")).toBe("");
  });

  it("resolves en string", () => {
    expect(t("en", "vibe.buttons.forgeNarrative")).toBe("FORGE NARRATIVE");
  });
});

describe("isValidLang", () => {
  it("accepts en and uk", () => {
    expect(isValidLang("en")).toBe(true);
    expect(isValidLang("uk")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidLang("de")).toBe(false);
  });
});
```

- [ ] **Step 2.3: Run tests — expect PASS**

```bash
cd frontend && npm run test -- --reporter=verbose src/lib/__tests__/language-context.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.4: Commit**

```bash
cd frontend && git add src/lib/language-context.tsx src/lib/__tests__/language-context.test.ts
git commit -m "feat: add LanguageProvider context with localStorage persistence"
```

---

## Task 3: Wire LanguageProvider into layout

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 3.1: Update `layout.tsx`**

Replace the current file with:

```tsx
// frontend/src/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/language-context";

export const metadata: Metadata = {
  title: "Story Mixer — LoreForge",
  description: "Calibrated narrative generation. Tune the vibe, brew the story.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body suppressHydrationWarning className="min-h-screen" style={{ background: "var(--ink)" }}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3.2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
cd frontend && git add src/app/layout.tsx
git commit -m "feat: wrap app in LanguageProvider"
```

---

## Task 4: Refactor `vibe-bands.ts`

**Files:**
- Modify: `frontend/src/lib/vibe-bands.ts`

`toneLabelMap` is moved to the locale files as `vibe.tones.channelLabel.*` (done in Task 1). Components will call `t()` directly instead of using this map.
`bandLabelMap` similarly moves to `vibe.bands.*` in locale files.
`SoftWarning.message` is removed — callers resolve warnings via `t("vibe.warnings.${code}")`.

- [ ] **Step 4.1: Update `vibe-bands.ts`**

Apply these changes:

1. Remove `bandLabelMap` export (values now live in `vibe.bands.*`).
2. Remove `toneLabelMap` export (values now live in `vibe.tones.channelLabel.*`).
3. Remove `message` field from `SoftWarning` type and `deriveSoftWarnings`.

```typescript
// frontend/src/lib/vibe-bands.ts
export type VibeMetricName = "aggression" | "readerRespect" | "morality" | "sourceFidelity";

export type MetricBand =
  | "strongly_minimized"
  | "restrained"
  | "balanced"
  | "elevated"
  | "dominant";

export interface VibeValues {
  aggression: number;
  readerRespect: number;
  morality: number;
  sourceFidelity: number;
}

const clamp = (value: number): number => Math.max(1, Math.min(10, Math.round(value)));

export const normalizeSliderValue = (value: number): number => {
  return Number((clamp(value) / 10).toFixed(4));
};

export const bandForNormalizedValue = (value: number): MetricBand => {
  if (value < 0.2) return "strongly_minimized";
  if (value < 0.4) return "restrained";
  if (value < 0.6) return "balanced";
  if (value < 0.8) return "elevated";
  return "dominant";
};

export interface SoftWarning {
  code:
    | "stern_but_respectful"
    | "preachy_risk"
    | "detached_risk"
    | "neutral_collapse_risk"
    | "extreme_tone_risk";
}

export const deriveSoftWarnings = (values: VibeValues): SoftWarning[] => {
  const aggression = normalizeSliderValue(values.aggression);
  const readerRespect = normalizeSliderValue(values.readerRespect);
  const morality = normalizeSliderValue(values.morality);
  const warnings: SoftWarning[] = [];

  if (aggression >= 0.8 && readerRespect >= 0.8) {
    warnings.push({ code: "stern_but_respectful" });
  }
  if (morality >= 0.8 && readerRespect <= 0.2) {
    warnings.push({ code: "preachy_risk" });
  }
  if (morality <= 0.2 && readerRespect >= 0.8) {
    warnings.push({ code: "detached_risk" });
  }
  if ([aggression, readerRespect, morality].every((v) => v >= 0.4 && v <= 0.6)) {
    warnings.push({ code: "neutral_collapse_risk" });
  }
  const sourceFidelity = normalizeSliderValue(values.sourceFidelity);
  if ([aggression, readerRespect, morality, sourceFidelity].some((v) => v <= 0.1 || v >= 0.9)) {
    warnings.push({ code: "extreme_tone_risk" });
  }

  return warnings;
};
```

- [ ] **Step 4.2: Run TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: errors for broken imports of `bandLabelMap` / `toneLabelMap` in `vibe-controller.tsx` — these will be fixed in Task 5.

- [ ] **Step 4.3: Skip standalone commit — squash Tasks 4 + 5**

> **Note:** After this step `vibe-controller.tsx` still imports the removed exports, so TypeScript is broken. Do NOT commit yet. Proceed directly to Task 5 and commit both changes together in Step 5.10.

---

## Task 5: Migrate `vibe-controller.tsx`

**Files:**
- Modify: `frontend/src/components/vibe-controller.tsx`

This is the largest migration. Key changes:
- Remove `import { t, languageFlag } from "@/lib/i18n"` → use `useLanguage()`
- Remove `import { bandLabelMap, toneLabelMap }` from vibe-bands
- Remove local `language` state and `StoryLanguage` type
- Add `GENRE_FLAVOR_KEY` map (genre name → locale key)
- Update `buildToneLabel` to accept `t` param
- Update `MixerChannel` to use `t()` for band/tone labels
- Replace all hardcoded English strings with `t("namespace.key")`

- [ ] **Step 5.1: Add genre key helper near top of file (after imports)**

Add after the existing `SEED_TAGS` definition:

```typescript
// Maps GENRE_OPTIONS values to their genreFlavor locale key suffix
const GENRE_TO_FLAVOR_KEY: Record<string, string> = {
  "Noir":               "noir",
  "Horror":             "horror",
  "Thriller":           "thriller",
  "Fantasy":            "fantasy",
  "Science Fiction":    "scienceFiction",
  "Romance":            "romance",
  "Historical Fiction": "historicalFiction",
  "Fairy Tale":         "fairyTale",
  "Mystery":            "mystery",
  "Adventure":          "adventure",
  "Mythology":          "mythology",
  "Speculative Fiction":"speculativeFiction",
};
```

- [ ] **Step 5.2: Update `buildToneLabel` to accept `t`**

Replace the existing `buildToneLabel` function:

```typescript
import type { TranslationKey } from "@/locales/index";

const buildToneLabel = (
  values: VibeValues,
  genre: string,
  t: (key: TranslationKey) => string
): string => {
  const aggBand = bandForNormalizedValue(normalizeSliderValue(values.aggression));
  const morBand = bandForNormalizedValue(normalizeSliderValue(values.morality));
  const aggrAdj = t(`vibe.tones.aggressionAdjective.${aggBand}` as TranslationKey);
  const morMod  = t(`vibe.tones.moralityModifier.${morBand}` as TranslationKey);
  const flavorKey = genre ? GENRE_TO_FLAVOR_KEY[genre] : null;
  const genreFlav = flavorKey ? t(`vibe.tones.genreFlavor.${flavorKey}` as TranslationKey) : "";
  const genreName = genre || t("vibe.briefing.narrativeFallback");
  return [aggrAdj, morMod, genreFlav, genreName].filter(Boolean).join(" ");
};
```

Remove the old `AGGRESSION_ADJECTIVE`, `MORALITY_MODIFIER`, and `GENRE_FLAVOR` constants (now in locale files).

- [ ] **Step 5.3: Update `SliderDefinition` to use translation keys for label/description**

```typescript
interface SliderDefinition {
  key: VibeMetricName;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  variant: SliderVariant;
  accentColor: string;
  accentGlow: string;
  accentBg: string;
}
```

Update `sliderDefinitions` array:

```typescript
const sliderDefinitions: SliderDefinition[] = [
  {
    key: "aggression",
    labelKey: "vibe.sliders.aggression.label",
    descriptionKey: "vibe.sliders.aggression.description",
    variant: "rose",
    accentColor: "#EF4444",
    accentGlow: "rgba(239,68,68,0.12)",
    accentBg: "rgba(127,29,29,0.12)",
  },
  {
    key: "readerRespect",
    labelKey: "vibe.sliders.readerRespect.label",
    descriptionKey: "vibe.sliders.readerRespect.description",
    variant: "teal",
    accentColor: "#14B8A6",
    accentGlow: "rgba(20,184,166,0.12)",
    accentBg: "rgba(13,61,56,0.12)",
  },
  {
    key: "morality",
    labelKey: "vibe.sliders.morality.label",
    descriptionKey: "vibe.sliders.morality.description",
    variant: "violet",
    accentColor: "#A78BFA",
    accentGlow: "rgba(167,139,250,0.12)",
    accentBg: "rgba(46,16,101,0.12)",
  },
  {
    key: "sourceFidelity",
    labelKey: "vibe.sliders.sourceFidelity.label",
    descriptionKey: "vibe.sliders.sourceFidelity.description",
    variant: "amber",
    accentColor: "#F59E0B",
    accentGlow: "rgba(245,158,11,0.12)",
    accentBg: "rgba(69,26,3,0.12)",
  },
];
```

- [ ] **Step 5.4: Update `SEED_TAGS` to use translation keys**

```typescript
import type { TranslationKey } from "@/locales/index";

type SeedTag = {
  labelKey: TranslationKey;
  seed: string; // seed text stays in English — it's a prompt sent to the LLM
};

const SEED_TAGS: SeedTag[] = [
  { labelKey: "vibe.seeds.loneWanderer",    seed: "A lone wanderer arrives at the edge of a dying world with no name and nothing to lose." },
  { labelKey: "vibe.seeds.darkProphecy",    seed: "A prophecy demands a sacrifice no hero is willing to make — and the clock has already started." },
  { labelKey: "vibe.seeds.hiddenMonster",   seed: "The monster they feared was never the beast. It was the ally who smiled at the threshold." },
  { labelKey: "vibe.seeds.unlikelyAllies",  seed: "Two sworn enemies, bound by necessity, must trust each other with the one thing neither can afford to lose." },
  { labelKey: "vibe.seeds.forbiddenArchive",seed: "A sealed archive holds the one truth that could unravel the empire — and someone already knows it." },
  { labelKey: "vibe.seeds.lastBloodline",   seed: "The last heir of an ancient bloodline carries a power they cannot control and a price they cannot pay." },
  { labelKey: "vibe.seeds.theBetrayal",     seed: "A trusted figure betrays them in the final hour. They had good reason. That makes it worse." },
  { labelKey: "vibe.seeds.shatteredCity",   seed: "A once-great city lies in ruins. Someone is rebuilding it — not to restore what was lost, but to erase it." },
];
```

- [ ] **Step 5.5: Update `MixerChannel` to accept and use `t`**

Update its prop type and internals:

```typescript
function MixerChannel({
  def,
  rawValue,
  onUpdate,
  t,
}: {
  def: SliderDefinition;
  rawValue: number;
  onUpdate: (v: number) => void;
  t: (key: TranslationKey) => string;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const normalized     = normalizeSliderValue(rawValue);
  const band           = bandForNormalizedValue(normalized);
  const toneLabel      = t(`vibe.tones.channelLabel.${def.key}.${band}` as TranslationKey);
  const bandLabel      = t(`vibe.bands.${band}` as TranslationKey);
  const intensityLabel = t(`vibe.intensity.${band}` as TranslationKey);
  const label          = t(def.labelKey);
  const description    = t(def.descriptionKey);

  // replace all occurrences of def.label → label, def.description → description
  // replace bandLabelMap[band] → bandLabel
  // replace toneLabel (already computed above)
  // replace intensityLabel (already computed above)
  // aria-label strings also updated:
  //   aria-label={`${label} control strip`}
  //   aria-valuetext={`${label} ${rawValue} out of 10, ${intensityLabel} intensity`}
  // tooltip: {toneLabel.toUpperCase()}
  // footer: {bandLabel} · {toneLabel}
  // ... (keep all existing JSX structure, just swap the string variables)
}
```

- [ ] **Step 5.6: Update `VibeController` body**

Inside `VibeController`:

1. Remove `const [language, setLanguage] = useState<StoryLanguage>("en");`
2. Remove `StoryLanguage` type alias.
3. Add at top of component: `const { lang, setLang, t, flag } = useLanguage();`
4. Update `toneLabel` useMemo: `const toneLabel = useMemo(() => buildToneLabel(values, genre, t), [values, genre, t]);`
5. Update `handleGenerate` — replace `language` with `lang` in the payload.
6. In the `missing` array validation, replace hardcoded English field names with translated versions:
   ```typescript
   if (!sourceTaleA.trim()) missing.push(t("vibe.validation.originalStoryA"));
   if (!sourceTaleB.trim()) missing.push(t("vibe.validation.originalStoryB"));
   if (!genre) missing.push(t("vibe.validation.genre"));
   if (missing.length > 0) {
     setValidationError(`${t("vibe.validation.pleaseFillIn")} ${missing.join(", ")}`);
   ```

7. Update all `t("oldKey", language)` calls to `t("new.namespace.key")` per this map:

   | Old call | New call |
   |----------|----------|
   | `t("storyBriefing", language)` | `t("vibe.briefing.sectionLabel")` |
   | `t("storyBrief", language)` | `t("vibe.brief.sectionLabel")` |
   | `t("storyLanguage", language)` | `t("vibe.language.sectionLabel")` |
   | `t("channelCalibration", language)` | `t("vibe.channels.sectionLabel")` |
   | `t("providerConfig", language)` | `t("vibe.provider.sectionLabel")` |
   | `languageFlag(language)` | `flag` (from context) |

8. Replace all other hardcoded strings:

   | Hardcoded | Key |
   |-----------|-----|
   | `"Define the source tales..."` | `t("vibe.briefing.description")` |
   | `"Source Tale A"` | `t("vibe.briefing.sourceTaleA")` |
   | `"Source Tale B"` | `t("vibe.briefing.sourceTaleB")` |
   | `placeholder="e.g. Moby Dick"` | `placeholder={t("vibe.placeholders.sourceTaleA")}` |
   | `placeholder="e.g. Blade Runner"` | `placeholder={t("vibe.placeholders.sourceTaleB")}` |
   | `"Genre"` (label) | `t("vibe.fields.genre")` |
   | `placeholder="Select genre…"` | `placeholder={t("vibe.placeholders.selectGenre")}` |
   | `"Narrative Tone"` | `t("vibe.briefing.narrativeTone")` |
   | `"English"` (SelectItem) | `t("vibe.language.english")` |
   | `"Ukrainian"` (SelectItem) | `t("vibe.language.ukrainian")` |
   | `"🇺🇦 Ukrainian text detected..."` | `t("vibe.language.cyrillicDetected")` |
   | `"SWITCH"` | `t("vibe.buttons.switch")` |
   | `"DISMISS"` | `t("vibe.buttons.dismiss")` |
   | `"Chapters"` | `t("vibe.fields.chapters")` |
   | `"Words/ch."` | `t("vibe.fields.wordsPerChapter")` |
   | `"1 – 10 range..."` | `t("vibe.channels.description")` |
   | `"Long-form Progress"` | `t("vibe.progress.sectionLabel")` |
   | `"Table of Contents"` | `t("vibe.progress.tableOfContents")` |
   | `"Ready to generate"` | `t("vibe.status.readyToGenerate")` |
   | `"Press Forge Narrative..."` | `t("vibe.status.pressForgeNarrative")` |
   | `statusLabel.pending` → `"pending"` | `t("vibe.status.pending")` |
   | `statusLabel.generating` → `"writing…"` | `t("vibe.status.writing")` |
   | `statusLabel.revising` → `"revising (N)"` | `` `${t("vibe.status.revising")} (${ch.revisionCount})` `` |
   | `statusLabel.complete` (accepted) | `` `${t("vibe.status.done")} · ${ch.wordCount}w` `` |
   | `statusLabel.complete` (rejected) | `` `${t("vibe.status.lowQuality")} · ${ch.wordCount}w` `` |
   | `"Provider"` | `t("vibe.fields.provider")` |
   | `"Model"` | `t("vibe.fields.model")` |
   | `"Judge Model"` | `t("vibe.fields.judgeModel")` |
   | `"Temperature"` | `t("vibe.fields.temperature")` |
   | `"FORGE NARRATIVE"` | `t("vibe.buttons.forgeNarrative")` |
   | `"BREWING NARRATIVE"` | `t("vibe.buttons.brewingNarrative")` |
   | `"Download PDF"` | `t("vibe.buttons.downloadPdf")` |
   | `"PDF export failed — try again"` | `t("vibe.pdf.exportFailed")` |
   | `"Set genre and calibrate..."` | `t("vibe.hints.setGenreToBegin")` |

9. Update seed tags in the map:
   ```tsx
   {SEED_TAGS.map((tag) => (
     <button
       key={tag.labelKey}
       ...
       aria-label={`Add seed: ${t(tag.labelKey)}`}
     >
       + {t(tag.labelKey)}
     </button>
   ))}
   ```

10. Pass `t` to each `MixerChannel`:
    ```tsx
    <MixerChannel
      key={def.key}
      def={def}
      rawValue={values[def.key]}
      onUpdate={(v) => updateValue(def.key, v)}
      t={t}
    />
    ```

11. Update the `Textarea` placeholder:
    ```tsx
    placeholder={t("vibe.brief.placeholder")}
    ```

- [ ] **Step 5.7: Remove `StoryLanguage` and old imports**

Remove from the top of the file:
```typescript
// Remove:
import { t, languageFlag } from "@/lib/i18n";
import { bandLabelMap, toneLabelMap } from "@/lib/vibe-bands";
type StoryLanguage = "en" | "uk";
```

Add:
```typescript
import { useLanguage } from "@/lib/language-context";
import type { TranslationKey } from "@/locales/index";
```

- [ ] **Step 5.8: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5.9: Run all unit tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 5.10: Commit**

```bash
cd frontend && git add src/components/vibe-controller.tsx
git commit -m "feat: migrate vibe-controller to useLanguage() — all strings now localized"
```

---

## Task 6: Migrate remaining components

**Files:**
- Modify: `frontend/src/components/agent-interaction-log.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/not-found.tsx`

- [ ] **Step 6.1: Update `agent-interaction-log.tsx`**

Add `import { useLanguage } from "@/lib/language-context";` and inside the component:

```tsx
const { t } = useLanguage();
```

Replace:
- `"Agent Interaction Log"` → `{t("ui.agentLog.title")}`
- `"No interactions recorded yet — start generation..."` → `{t("ui.agentLog.empty")}`
- `aria-label="Agent interaction log entries"` → `aria-label={t("ui.agentLog.title")}`

- [ ] **Step 6.2: Update `page.tsx`**

`page.tsx` uses `useState` so it already has `"use client"` at the top — confirm it's present, otherwise add it.

Add `import { useLanguage } from "@/lib/language-context";` and inside `HomePage`:

```tsx
const { t } = useLanguage();
```

Replace:
- `"Story Mixer"` (h1) → `{t("ui.header.title")}`
- `"LoreForge — Calibrated Narrative"` (subtitle) → `{t("ui.header.subtitle")}`
- `"Studio ready"` → `{t("ui.header.studioReady")}`
- `"LoreForge · Calibrated narrative generation..."` (footer) → `{t("ui.footer.tagline")}`

- [ ] **Step 6.3: Update `not-found.tsx`**

This is currently a Server Component. Add `"use client"` since it needs the context hook.

```tsx
"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/language-context";

export default function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <main className="grid min-h-screen place-items-center p-6 xl:p-10">
      <section className="w-full max-w-lg space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">404</p>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          {t("ui.notFound.title")}
        </h1>
        <p className="text-sm leading-6 text-zinc-400">{t("ui.notFound.body")}</p>
        <div className="pt-2">
          <Link
            href="/"
            aria-label="Return to LoreForge home page"
            className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 px-4 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
          >
            {t("ui.notFound.returnHome")}
          </Link>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 6.4: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6.5: Run all unit tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 6.6: Commit**

```bash
cd frontend && git add src/components/agent-interaction-log.tsx src/app/page.tsx src/app/not-found.tsx
git commit -m "feat: migrate remaining components to useLanguage()"
```

---

## Task 7: Delete `i18n.ts` + final verification

**Files:**
- Delete: `frontend/src/lib/i18n.ts`

- [ ] **Step 7.1: Delete the old file**

```bash
cd frontend && git rm src/lib/i18n.ts
```

- [ ] **Step 7.2: Confirm no remaining imports**

```bash
cd frontend && grep -r "from.*i18n" src/
```

Expected: no output (zero references remain).

- [ ] **Step 7.3: Full TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.4: Run all unit tests**

```bash
cd frontend && npm run test
```

Expected: all tests pass.

- [ ] **Step 7.5: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 7.6: Manual smoke test — dev server**

Start the dev server and verify manually:
```bash
cd frontend && npm run dev
```

Open `http://localhost:3000` and:
1. All visible text is in English by default.
2. Switch language to Ukrainian → all labels, buttons, section headers change immediately.
3. Refresh the page → Ukrainian persists (localStorage).
4. Open DevTools → Application → LocalStorage → `loreforge.language` key is present.

- [ ] **Step 7.7: Final commit**

```bash
cd frontend && git add -A
git commit -m "feat: delete legacy i18n.ts — localization fully migrated to LanguageContext"
```

---

## Rollup: What was built

| Concern | Before | After |
|---------|--------|-------|
| Translation storage | Flat `Record<Lang, Record<string, string>>` | Nested typed objects, structurally enforced |
| Language persistence | In-memory `useState` in VibeController | `localStorage` via React Context |
| String coverage | ~9 strings | ~115 strings across all components |
| Type safety | `string` keys, no compile-time check | `TranslationKey` union, missing keys caught at compile time |
| Prop drilling | `language` passed to `t()` at every call site | `useLanguage()` hook, available anywhere |
| Test coverage | None | 11 unit tests for locale shape and helpers |
