import { describe, it, expect } from "vitest";
import { getNestedValue, isValidLang, languageFlag, locales } from "../../locales/index";
import type { TranslationKey, Lang } from "../../locales/index";
import en from "../../locales/en";
import uk from "../../locales/uk";

// Test the pure helpers that back the context — component rendering
// is covered by E2E tests (Playwright).

describe("languageFlag", () => {
  it("returns UK flag for 'uk'", () => expect(languageFlag("uk")).toBe("🇺🇦"));
  it("returns GB flag for 'en'", () => expect(languageFlag("en")).toBe("🇬🇧"));
  it("returns RU flag for 'ru'", () => expect(languageFlag("ru")).toBe("🇷🇺"));
  it("returns KZ flag for 'kk'", () => expect(languageFlag("kk")).toBe("🇰🇿"));
  it("returns GB flag for unknown lang", () => expect(languageFlag("fr")).toBe("🇬🇧"));
});

describe("t() fallback to en", () => {
  // Simulate what context's t() does: chosen lang first, fallback to en
  function t(lang: Lang, key: TranslationKey): string {
    return (
      getNestedValue(locales[lang], key) || getNestedValue(locales.en, key)
    );
  }

  it("resolves uk string when present", () => {
    expect(t("uk", "vibe.briefing.sectionLabel")).toBe("Інструкції до історії");
  });

  it("returns empty string when both locales have empty string value", () => {
    // moralityModifier.balanced is "" in both en and uk — t() returns "" (not the key string)
    expect(t("uk", "vibe.tones.moralityModifier.balanced")).toBe("");
  });

  it("resolves en string", () => {
    expect(t("en", "vibe.buttons.forgeNarrative")).toBe("FORGE NARRATIVE");
  });

  it("resolves ru string when present", () => {
    expect(t("ru", "vibe.briefing.sectionLabel")).toBe("Инструкции к истории");
  });

  it("resolves kk string when present", () => {
    expect(t("kk", "vibe.briefing.sectionLabel")).toBe("Әңгіме нұсқаулары");
  });
});

describe("isValidLang", () => {
  it("accepts en, uk, ru and kk", () => {
    expect(isValidLang("en")).toBe(true);
    expect(isValidLang("uk")).toBe(true);
    expect(isValidLang("ru")).toBe(true);
    expect(isValidLang("kk")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isValidLang("de")).toBe(false);
  });
});

describe("language dropdown switching", () => {
  it("switching to 'ru' resolves Russian UI strings", () => {
    expect(getNestedValue(locales.ru, "vibe.language.sectionLabel")).toBe("Язык истории");
  });

  it("switching to 'kk' resolves Kazakh UI strings", () => {
    expect(getNestedValue(locales.kk, "vibe.language.sectionLabel")).toBe("Әңгіме тілі");
  });

  it("ru locale has russian and kazakh label keys", () => {
    expect(getNestedValue(locales.ru, "vibe.language.russian")).toBe("Русский");
    expect(getNestedValue(locales.ru, "vibe.language.kazakh")).toBe("Казахский");
  });

  it("kk locale has russian and kazakh label keys", () => {
    expect(getNestedValue(locales.kk, "vibe.language.russian")).toBe("Орыс");
    expect(getNestedValue(locales.kk, "vibe.language.kazakh")).toBe("Қазақ");
  });

  it("en locale has russian and kazakh label keys", () => {
    expect(getNestedValue(locales.en, "vibe.language.russian")).toBe("Russian");
    expect(getNestedValue(locales.en, "vibe.language.kazakh")).toBe("Kazakh");
  });
});
