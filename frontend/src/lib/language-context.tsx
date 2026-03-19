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
