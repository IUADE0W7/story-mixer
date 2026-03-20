# Russian & Kazakh Localization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Russian (`ru`) and Kazakh (`kk`) as fully-translated UI languages alongside the existing English and Ukrainian locales.

**Architecture:** Mirror the existing `en`/`uk` pattern exactly — create typed locale files, register them in `index.ts`, extend auto-detection in `language-context.tsx`, and add two new options to the language selector in `vibe-controller.tsx`. The TypeScript `typeof en` constraint on each locale file acts as a compile-time completeness check.

**Tech Stack:** TypeScript, Next.js 15, React 19, custom i18n system in `frontend/src/locales/`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/locales/ru.ts` | Create | Russian translations (~220 keys) |
| `frontend/src/locales/kk.ts` | Create | Kazakh translations (~220 keys) |
| `frontend/src/locales/index.ts` | Modify | Register `ru`/`kk` in `Lang`, `locales`, `languageFlag`, `isValidLang` |
| `frontend/src/locales/en.ts` | Modify | Add `russian` and `kazakh` keys to `vibe.language` |
| `frontend/src/locales/uk.ts` | Modify | Add `russian` and `kazakh` keys to `vibe.language` |
| `frontend/src/lib/language-context.tsx` | Modify | Add `ru`/`kk` auto-detection in `readStoredLang()` |
| `frontend/src/components/vibe-controller.tsx` | Modify | Add Russian/Kazakh `SelectItem` entries; fix `onValueChange` to handle all four langs |

---

## Task 1: Create `ru.ts` Russian locale file

**Files:**
- Create: `frontend/src/locales/ru.ts`

- [ ] **Step 1: Create the file**

```typescript
import type en from "./en";

const ru: typeof en = {
  vibe: {
    briefing: {
      sectionLabel: "Инструкции к истории",
      description: "Определите первоисточники для смешивания и задайте начальную сцену.",
      sourceTaleA: "Первоисточник A",
      sourceTaleB: "Первоисточник B",
      narrativeTone: "Тон нарратива",
      narrativeFallback: "Нарратив",
    },
    language: {
      sectionLabel: "Язык истории",
      english: "Английский",
      ukrainian: "Украинский",
      russian: "Русский",
      kazakh: "Казахский",
      cyrillicDetected: "🇷🇺 Обнаружен кириллический текст — сменить язык?",
    },
    brief: {
      sectionLabel: "Краткое описание",
      placeholder: "Опишите начальную сцену, главного героя, место действия и тип напряжения.",
    },
    seeds: {
      loneWanderer: "Одинокий странник",
      darkProphecy: "Тёмное пророчество",
      hiddenMonster: "Скрытый монстр",
      unlikelyAllies: "Неожиданные союзники",
      forbiddenArchive: "Запретный архив",
      lastBloodline: "Последний род",
      theBetrayal: "Предательство",
      shatteredCity: "Разрушенный город",
    },
    fields: {
      genre: "Жанр",
      chapters: "Главы",
      wordsPerChapter: "Слов/гл.",
      provider: "Провайдер",
      model: "Модель",
      judgeModel: "Модель-судья",
      temperature: "Температура",
    },
    placeholders: {
      sourceTaleA: "напр. Моби Дик",
      sourceTaleB: "напр. Бегущий по лезвию",
      selectGenre: "Выберите жанр…",
    },
    validation: {
      originalStoryA: "Оригинальная история A",
      originalStoryB: "Оригинальная история B",
      genre: "Жанр",
      pleaseFillIn: "Пожалуйста, заполните:",
    },
    sliders: {
      aggression: {
        label: "Агрессия",
        description: "Интенсивность нарратива и вербальная сила.",
      },
      readerRespect: {
        label: "Уважение к читателю",
        description: "Доверие к интеллекту читателя.",
      },
      morality: {
        label: "Мораль",
        description: "Этическая рамка и интенсивность суждения.",
      },
      sourceFidelity: {
        label: "Верность источнику",
        description: "Оригинальный источник против вымышленного нарратива.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Спокойный",
        restrained: "Взвешенный",
        balanced: "Напряжённый",
        elevated: "Мрачный",
        dominant: "Висцеральный",
      },
      moralityModifier: {
        strongly_minimized: "Нигилистический",
        restrained: "Серый",
        balanced: "",
        elevated: "Искренний",
        dominant: "Праведный",
      },
      genreFlavor: {
        noir: "Крутой",
        horror: "Жуткий",
        thriller: "Напряжённый",
        fantasy: "Мифический",
        scienceFiction: "Церебральный",
        romance: "Интимный",
        historicalFiction: "Эпохальный",
        fairyTale: "Волшебный",
        mystery: "Загадочный",
        adventure: "Кинетический",
        mythology: "Эпический",
        speculativeFiction: "Спекулятивный",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Лёгкий",
          restrained: "Взвешенный",
          balanced: "Напряжённый",
          elevated: "Мощный",
          dominant: "Взрывной",
        },
        readerRespect: {
          strongly_minimized: "Провокационный",
          restrained: "Сжатый",
          balanced: "Сбалансированный",
          elevated: "Доверяющий",
          dominant: "Для экспертов",
        },
        morality: {
          strongly_minimized: "Аморальный",
          restrained: "Неоднозначный",
          balanced: "Текстурированный",
          elevated: "Принципиальный",
          dominant: "Праведный",
        },
        sourceFidelity: {
          strongly_minimized: "Чистый вымысел",
          restrained: "Свободное вдохновение",
          balanced: "Смешанный",
          elevated: "Верный",
          dominant: "Канонический",
        },
      },
    },
    bands: {
      strongly_minimized: "Сильно минимизированный",
      restrained: "Сдержанный",
      balanced: "Сбалансированный",
      elevated: "Повышенный",
      dominant: "Доминантный",
    },
    intensity: {
      strongly_minimized: "Минимум",
      restrained: "Низкая",
      balanced: "Умеренная",
      elevated: "Высокая",
      dominant: "Максимум",
    },
    status: {
      pending: "ожидание",
      writing: "написание…",
      revising: "редактирование",
      done: "готово",
      lowQuality: "низкое качество",
      readyToGenerate: "Готово к генерации",
      pressForgeNarrative: "Нажмите «Создать нарратив» для запуска агентного конвейера.",
      streamReady: "Готово",
      streamConnecting: "Подключение",
      streamOutlineReady: "Структура готова",
      streamWritingChapter: "Пишем главу",
      streamRevisingChapter: "Редактируем главу",
      streamAttempt: "попытка",
      streamComplete: "Завершено",
      streamError: "Ошибка",
    },
    buttons: {
      forgeNarrative: "СОЗДАТЬ НАРРАТИВ",
      brewingNarrative: "СОЗДАЁМ НАРРАТИВ",
      switch: "СМЕНИТЬ",
      dismiss: "ИГНОРИРОВАТЬ",
      downloadPdf: "Скачать PDF",
    },
    channels: {
      sectionLabel: "Калибровка каналов",
      description: "Диапазон 1–10. Детальный контроль нарратива.",
    },
    provider: {
      sectionLabel: "Настройки провайдера",
    },
    progress: {
      sectionLabel: "Прогресс длинной формы",
      tableOfContents: "Содержание",
      chaptersUnit: "гл.",
      wordsEachUnit: "слов каждая",
      error: "Ошибка",
    },
    warnings: {
      stern_but_respectful:
        "Высокая агрессия с высоким уважением к читателю даёт строгий профессионализм, а не оскорбительный тон.",
      preachy_risk: "Высокая мораль с низким уважением к читателю может превратиться в поучительную прозу.",
      detached_risk:
        "Низкая мораль с высоким уважением к читателю может звучать клинически отстранённо.",
      neutral_collapse_risk:
        "Сбалансированные настройки всех ползунков могут привести к обобщённой прозе без стилистических якорей.",
      extreme_tone_risk:
        "Экстремальные настройки допустимы, но следует оценивать их на связность и безопасность.",
    },
    hints: {
      setGenreToBegin: "Установите жанр и откалибруйте каналы для начала",
    },
    pdf: {
      exportFailed: "Ошибка экспорта PDF — попробуйте ещё раз",
    },
  },
  ui: {
    header: {
      title: "Миксер историй",
      subtitle: "LoreForge — Откалиброванный нарратив",
      studioReady: "Студия готова",
    },
    footer: {
      tagline: "LoreForge · Генерация откалиброванного нарратива · настрой вайб, создай историю",
    },
    agentLog: {
      title: "Журнал взаимодействия агентов",
      empty: "Взаимодействий пока нет — начните генерацию, чтобы увидеть конвейер агентов.",
    },
    notFound: {
      title: "Страница не найдена",
      body: "Запрошенная страница не существует или была перемещена.",
      returnHome: "На главную",
    },
  },
};

export default ru;
```

- [ ] **Step 2: Run TypeScript compile**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: compile passes (no errors about `ru`). If it fails with "Object literal may only specify known properties", a key name is wrong — fix to match `en.ts` exactly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/ru.ts
git commit -m "feat(i18n): add Russian locale (ru)"
```

---

## Task 2: Create `kk.ts` Kazakh locale file

**Files:**
- Create: `frontend/src/locales/kk.ts`

- [ ] **Step 1: Create the file**

```typescript
import type en from "./en";

const kk: typeof en = {
  vibe: {
    briefing: {
      sectionLabel: "Әңгіме нұсқаулары",
      description: "Араластыру үшін бастапқы деректерді анықтаңыз және бастапқы сахнаны орнатыңыз.",
      sourceTaleA: "Бастапқы дерек A",
      sourceTaleB: "Бастапқы дерек B",
      narrativeTone: "Баяндау тоны",
      narrativeFallback: "Баяндау",
    },
    language: {
      sectionLabel: "Әңгіме тілі",
      english: "Ағылшынша",
      ukrainian: "Украинша",
      russian: "Орыс тілі",
      kazakh: "Қазақша",
      cyrillicDetected: "🇰🇿 Кириллица анықталды — тілді ауыстыру керек пе?",
    },
    brief: {
      sectionLabel: "Қысқа сипаттама",
      placeholder: "Бастапқы сахнаны, кейіпкерді, орынды және шиеленіс түрін сипаттаңыз.",
    },
    seeds: {
      loneWanderer: "Жалғыз саяхатшы",
      darkProphecy: "Қара болжам",
      hiddenMonster: "Жасырын жаупір",
      unlikelyAllies: "Күтпеген одақтастар",
      forbiddenArchive: "Тыйым салынған мұрағат",
      lastBloodline: "Соңғы ұрпақ",
      theBetrayal: "Опасыздық",
      shatteredCity: "Қираған қала",
    },
    fields: {
      genre: "Жанр",
      chapters: "Тараулар",
      wordsPerChapter: "Сөз/тар.",
      provider: "Провайдер",
      model: "Үлгі",
      judgeModel: "Төреші үлгі",
      temperature: "Температура",
    },
    placeholders: {
      sourceTaleA: "мысалы Моби Дик",
      sourceTaleB: "мысалы Блейд Раннер",
      selectGenre: "Жанрды таңдаңыз…",
    },
    validation: {
      originalStoryA: "Бастапқы әңгіме A",
      originalStoryB: "Бастапқы әңгіме B",
      genre: "Жанр",
      pleaseFillIn: "Толтырыңыз:",
    },
    sliders: {
      aggression: {
        label: "Агрессия",
        description: "Баяндаудың қарқындылығы мен сөздік күші.",
      },
      readerRespect: {
        label: "Оқырманға құрмет",
        description: "Оқырманның зияткерлігіне деген сенім.",
      },
      morality: {
        label: "Адамгершілік",
        description: "Этикалық шеңбер мен пайымдау қарқындылығы.",
      },
      sourceFidelity: {
        label: "Деректерге адалдық",
        description: "Бастапқы дерек пен ойдан шығарылған баяндау.",
      },
    },
    tones: {
      aggressionAdjective: {
        strongly_minimized: "Тыныш",
        restrained: "Өлшемді",
        balanced: "Шиеленісті",
        elevated: "Рақымсыз",
        dominant: "Висцеральды",
      },
      moralityModifier: {
        strongly_minimized: "Нигилистік",
        restrained: "Сұр",
        balanced: "",
        elevated: "Шынайы",
        dominant: "Әділ",
      },
      genreFlavor: {
        noir: "Қатал",
        horror: "Қорқынышты",
        thriller: "Шиеленісті",
        fantasy: "Аңызды",
        scienceFiction: "Церебральды",
        romance: "Жылы",
        historicalFiction: "Тарихи",
        fairyTale: "Сиқырлы",
        mystery: "Жұмбақ",
        adventure: "Кинетикалық",
        mythology: "Эпикалық",
        speculativeFiction: "Болжамды",
      },
      channelLabel: {
        aggression: {
          strongly_minimized: "Жұмсақ",
          restrained: "Өлшемді",
          balanced: "Шиеленісті",
          elevated: "Қуатты",
          dominant: "Жарылысты",
        },
        readerRespect: {
          strongly_minimized: "Провокациялық",
          restrained: "Қысқа",
          balanced: "Теңдестірілген",
          elevated: "Сенімді",
          dominant: "Сарапшыларға арналған",
        },
        morality: {
          strongly_minimized: "Адамгершіліксіз",
          restrained: "Екіұшты",
          balanced: "Текстурлы",
          elevated: "Қағидалы",
          dominant: "Әділ",
        },
        sourceFidelity: {
          strongly_minimized: "Таза ойдан шығарылған",
          restrained: "Еркін шабыт",
          balanced: "Аралас",
          elevated: "Адал",
          dominant: "Каноникалық",
        },
      },
    },
    bands: {
      strongly_minimized: "Мықтап азайтылған",
      restrained: "Ұстамды",
      balanced: "Теңдестірілген",
      elevated: "Жоғарылатылған",
      dominant: "Үстем",
    },
    intensity: {
      strongly_minimized: "Минимум",
      restrained: "Төмен",
      balanced: "Орташа",
      elevated: "Жоғары",
      dominant: "Максимум",
    },
    status: {
      pending: "күту",
      writing: "жазу…",
      revising: "өңдеу",
      done: "дайын",
      lowQuality: "төмен сапа",
      readyToGenerate: "Генерациялауға дайын",
      pressForgeNarrative: "Агент конвейерін іске қосу үшін «Баяндауды соғу» түймесін басыңыз.",
      streamReady: "Дайын",
      streamConnecting: "Қосылу",
      streamOutlineReady: "Құрылым дайын",
      streamWritingChapter: "Тарауды жазу",
      streamRevisingChapter: "Тарауды өңдеу",
      streamAttempt: "әрекет",
      streamComplete: "Аяқталды",
      streamError: "Қате",
    },
    buttons: {
      forgeNarrative: "БАЯНДАУДЫ СОҒУ",
      brewingNarrative: "БАЯНДАУДЫ ЖАСАУ",
      switch: "АУЫСТЫРУ",
      dismiss: "ЖАБУ",
      downloadPdf: "PDF жүктеу",
    },
    channels: {
      sectionLabel: "Арналарды калибрлеу",
      description: "1–10 ауқымы. Баяндауды егжей-тегжейлі басқару.",
    },
    provider: {
      sectionLabel: "Провайдер баптаулары",
    },
    progress: {
      sectionLabel: "Ұзын пішіннің үдерісі",
      tableOfContents: "Мазмұны",
      chaptersUnit: "тар.",
      wordsEachUnit: "сөз әрқайсысы",
      error: "Қате",
    },
    warnings: {
      stern_but_respectful:
        "Жоғары агрессия мен жоғары оқырманға құрмет қатал кәсіпқойлықты, ал қорлаушы тонды емес береді.",
      preachy_risk: "Жоғары адамгершілік пен төмен оқырманға құрмет уағызшылдық прозаға айналуы мүмкін.",
      detached_risk:
        "Төмен адамгершілік пен жоғары оқырманға құрмет клиникалық алшақ естілуі мүмкін.",
      neutral_collapse_risk:
        "Барлық сырғытпаларда теңдестірілген баптаулар стилистикалық тіректерсіз жалпылама прозаға әкелуі мүмкін.",
      extreme_tone_risk:
        "Экстремалды баптаулар жарамды, бірақ олардың сәйкестігі мен қауіпсіздігін бағалау керек.",
    },
    hints: {
      setGenreToBegin: "Бастау үшін жанрды орнатып, арналарды калибрлеңіз",
    },
    pdf: {
      exportFailed: "PDF экспортында қате — қайталап көріңіз",
    },
  },
  ui: {
    header: {
      title: "Әңгіме Миксері",
      subtitle: "LoreForge — Калиброванған баяндау",
      studioReady: "Студия дайын",
    },
    footer: {
      tagline: "LoreForge · Калиброванған баяндауды генерациялау · вайбты реттеп, әңгімені жасаңыз",
    },
    agentLog: {
      title: "Агент өзара әрекеттесу журналы",
      empty: "Әзірге өзара әрекеттесулер жоқ — агент конвейерін көру үшін генерацияны бастаңыз.",
    },
    notFound: {
      title: "Бет табылмады",
      body: "Сіз сұраған бет жоқ немесе жылжытылған болуы мүмкін.",
      returnHome: "Басты бетке",
    },
  },
};

export default kk;
```

- [ ] **Step 2: Run TypeScript compile**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/kk.ts
git commit -m "feat(i18n): add Kazakh locale (kk)"
```

---

## Task 3: Register `ru` and `kk` in `index.ts`

**Files:**
- Modify: `frontend/src/locales/index.ts`

- [ ] **Step 1: Update `index.ts`**

Replace the entire file content with:

```typescript
import en from "./en";
import uk from "./uk";
import ru from "./ru";
import kk from "./kk";

export type Lang = "en" | "uk" | "ru" | "kk";
export type Translations = typeof en;

/** Derives a union of all dot-path strings from a nested translations object, e.g. "vibe.bands.balanced". */
type DotPaths<T, Prefix extends string = ""> = {
  [K in keyof T]: T[K] extends object
    ? DotPaths<T[K], `${Prefix}${K & string}.`>
    : `${Prefix}${K & string}`;
}[keyof T];

export type TranslationKey = DotPaths<Translations>;

export const locales: Record<Lang, Translations> = { en, uk, ru, kk };

export function languageFlag(lang: string): string {
  switch ((lang || "").toLowerCase()) {
    case "uk":
      return "🇺🇦";
    case "ru":
      return "🇷🇺";
    case "kk":
      return "🇰🇿";
    case "en":
    default:
      return "🇬🇧";
  }
}

export function isValidLang(value: string): value is Lang {
  return value === "en" || value === "uk" || value === "ru" || value === "kk";
}

/** Resolves a dot-path translation key against a translations object. Returns the key string if not found. */
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

- [ ] **Step 2: Run TypeScript compile**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/index.ts
git commit -m "feat(i18n): register ru and kk locales in index.ts"
```

---

## Task 4: Add `russian` and `kazakh` keys to `en.ts` and `uk.ts`

**Files:**
- Modify: `frontend/src/locales/en.ts`
- Modify: `frontend/src/locales/uk.ts`

- [ ] **Step 1: Edit `en.ts`** — find the `language` block and add two keys:

```typescript
    language: {
      sectionLabel: "Story Language",
      english: "English",
      ukrainian: "Ukrainian",
      russian: "Russian",      // ADD
      kazakh: "Kazakh",        // ADD
      cyrillicDetected: "🇺🇦 Ukrainian text detected — switch story language?",
    },
```

- [ ] **Step 2: Edit `uk.ts`** — find the `language` block and add two keys:

```typescript
    language: {
      sectionLabel: "Мова історії",
      english: "Англійська",
      ukrainian: "Українська",
      russian: "Російська",    // ADD
      kazakh: "Казахська",     // ADD
      cyrillicDetected: "🇺🇦 Виявлено кириличний текст — змінити мову?",
    },
```

- [ ] **Step 3: Run TypeScript compile**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: no errors. The `typeof en` constraint on `ru.ts` and `kk.ts` will now enforce that `russian` and `kazakh` exist — they were already added in Tasks 1 and 2.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/locales/en.ts frontend/src/locales/uk.ts
git commit -m "feat(i18n): add russian/kazakh language name keys to en and uk locales"
```

---

## Task 5: Add auto-detection for `ru` and `kk` in `language-context.tsx`

**Files:**
- Modify: `frontend/src/lib/language-context.tsx`

- [ ] **Step 1: Update `readStoredLang()`**

Find the `readStoredLang` function and replace the navigator detection block:

Before:
```typescript
    if (navigator.language.startsWith("uk")) return "uk";
```

After:
```typescript
    if (navigator.language.startsWith("ru")) return "ru";
    if (navigator.language.startsWith("kk")) return "kk";
    if (navigator.language.startsWith("uk")) return "uk";
```

Note on order: Russian is checked before Kazakh because `"ru-KZ"` (Russian as used in Kazakhstan) starts with `"ru"`, and should map to Russian, not Kazakh. A Kazakh-language user will have `"kk"` or `"kk-KZ"`.

- [ ] **Step 2: Run TypeScript compile**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/language-context.tsx
git commit -m "feat(i18n): auto-detect Russian and Kazakh from navigator.language"
```

---

## Task 6: Add Russian and Kazakh to the language selector in `vibe-controller.tsx`

**Files:**
- Modify: `frontend/src/components/vibe-controller.tsx`

There are two changes needed:

**Change A:** The `onValueChange` callback currently hard-codes the two languages. Generalise it using `isValidLang`.

**Change B:** Add two new `SelectItem` entries for Russian and Kazakh.

- [ ] **Step 1: Import `isValidLang`**

Find the import from `@/locales/index` (or `@/locales`) at the top of the file. Add `isValidLang` to the import. If there is no existing import from that path, add one:

```typescript
import { isValidLang } from "@/locales";
```

- [ ] **Step 2: Fix `onValueChange` in the language Select**

Find (around line 549–552):
```typescript
                  onValueChange={(v) => {
                    setLang(v === "uk" ? "uk" : "en");
                    setLangBannerDismissed(false);
                  }}
```

Replace with:
```typescript
                  onValueChange={(v) => {
                    if (isValidLang(v)) setLang(v);
                    setLangBannerDismissed(false);
                  }}
```

- [ ] **Step 3: Add Russian and Kazakh `SelectItem` entries**

Find (around line 563–564):
```typescript
                    <SelectItem value="en" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.english")}</SelectItem>
                    <SelectItem value="uk" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.ukrainian")}</SelectItem>
```

Replace with:
```typescript
                    <SelectItem value="en" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.english")}</SelectItem>
                    <SelectItem value="uk" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.ukrainian")}</SelectItem>
                    <SelectItem value="ru" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.russian")}</SelectItem>
                    <SelectItem value="kk" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.kazakh")}</SelectItem>
```

- [ ] **Step 4: Run TypeScript compile**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run lint**

```bash
cd /home/mikha/projects/story-mixer/frontend && npm run lint
```

Expected: no errors or warnings introduced by these changes.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/vibe-controller.tsx
git commit -m "feat(i18n): add Russian and Kazakh options to language selector"
```

---

## Task 7: Manual verification

- [ ] Start the frontend dev server:

```bash
cd /home/mikha/projects/story-mixer/frontend && npm run dev
```

- [ ] Open `http://localhost:3000` in a browser

- [ ] Switch language to **Russian** — verify all visible UI strings render in Russian (section labels, slider labels, button text, hints)

- [ ] Switch language to **Kazakh** — verify all visible UI strings render in Kazakh

- [ ] Switch back to **English** and **Ukrainian** — verify those still work

- [ ] With Russian active, type Cyrillic text in the brief field — verify the Ukrainian detection banner does **not** appear (the existing `lang === "en"` condition in `showLangBanner` already prevents this)

- [ ] Reload the page with Russian selected — verify the language persists (localStorage)

- [ ] **Final compile check:**

```bash
cd /home/mikha/projects/story-mixer/frontend && npx tsc --noEmit
```

Expected: clean.
