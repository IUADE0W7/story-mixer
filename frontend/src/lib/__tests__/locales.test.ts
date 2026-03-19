import { describe, it, expect } from "vitest";
import en from "../../locales/en";
import uk from "../../locales/uk";
import { getNestedValue, locales, isValidLang } from "../../locales/index";
import type { TranslationKey } from "../../locales/index";

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
