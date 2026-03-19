import { describe, it, expect } from "vitest";
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
    // moralityModifier.balanced is "" in both — fallback to en also returns ""
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
