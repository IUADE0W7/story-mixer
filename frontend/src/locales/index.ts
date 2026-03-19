import en from "./en";
import uk from "./uk";

export type Lang = "en" | "uk";
export type Translations = typeof en;

/** Derives a union of all dot-path strings from a nested translations object, e.g. "vibe.bands.balanced". */
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
