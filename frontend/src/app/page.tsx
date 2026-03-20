"use client";

import { useState, useCallback, useEffect } from "react";
import { VibeController } from "@/components/vibe-controller";
import { useLanguage } from "@/lib/language-context";
import { decodeEmail } from "@/lib/auth";
import type { VibeValues } from "@/lib/vibe-bands";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isValidLang } from "@/locales/index";

const DEFAULT_VIBE: VibeValues = { aggression: 5, readerRespect: 6, morality: 5, sourceFidelity: 7 };

function MixerLogo({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Base platform */}
      <rect x="8" y="41" width="24" height="4" rx="2" fill="#0D3D38" />
      {/* Column */}
      <rect x="15" y="32" width="10" height="11" rx="1" fill="#0D3D38" />
      {/* Machine body */}
      <rect x="8" y="14" width="22" height="20" rx="5" fill="#0D3D38" stroke="#14B8A6" strokeWidth="1.5" />
      {/* Arm */}
      <path d="M30 18 L30 8 Q30 4 35 4" stroke="#14B8A6" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Attachment head */}
      <circle cx="35" cy="4" r="3.5" fill="#14B8A6" opacity="0.9" />
      {/* Dashed whisk line */}
      <line x1="35" y1="7.5" x2="35" y2="22" stroke="#14B8A6" strokeWidth="1" strokeDasharray="2 2.5" opacity="0.45" />
      {/* Control knob */}
      <circle cx="25" cy="23" r="4.5" fill="#0B0E14" stroke="#14B8A6" strokeWidth="1.5" />
      <circle cx="25" cy="23" r="1.8" fill="#14B8A6" />
      {/* Speed indicator dots */}
      <circle cx="14" cy="18" r="1" fill="#14B8A6" opacity="0.3" />
      <circle cx="14" cy="22" r="1" fill="#14B8A6" opacity="0.6" />
      <circle cx="14" cy="26" r="1" fill="#14B8A6" opacity="0.9" />
      {/* Bowl */}
      <path d="M11 33 Q10 44 24 44 Q38 44 37 33 Z" fill="#0D3D38" stroke="#14B8A6" strokeWidth="1.5" />
      {/* Swirl / story elements rising */}
      <path
        d="M24 14 Q32 6 40 10 Q46 16 38 22"
        stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeLinecap="round"
        opacity="0.75"
      />
      {/* Accent stars */}
      <circle cx="5"  cy="9"  r="1.5" fill="#F59E0B" opacity="0.85" />
      <circle cx="43" cy="26" r="1"   fill="#14B8A6" opacity="0.7"  />
      <circle cx="42" cy="38" r="1.5" fill="#A78BFA" opacity="0.8"  />
      <circle cx="4"  cy="30" r="1"   fill="#EF4444" opacity="0.7"  />
      <circle cx="38" cy="5"  r="1"   fill="#A78BFA" opacity="0.6"  />
    </svg>
  );
}

export default function HomePage() {
  const { t, lang, setLang, flag } = useLanguage();
  const [values, setValues] = useState<VibeValues>(DEFAULT_VIBE);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem("lf_token"));
  }, []);

  const handleTokenChange = useCallback((newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("lf_token", newToken);
    } else {
      localStorage.removeItem("lf_token");
    }
    setToken(newToken);
  }, []);

  const email = token ? decodeEmail(token) : null;

  return (
    <div className="min-h-screen" style={{ background: "var(--ink)" }}>
      {/* ── Header ── */}
      <header
        className="lf-entrance-0 sticky top-0 z-40 flex items-center justify-between px-6 py-4 xl:px-12"
        style={{
          background: "linear-gradient(180deg, var(--surface) 85%, transparent 100%)",
          borderBottom: "1px solid var(--border)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="flex items-center gap-3">
          <MixerLogo size={40} />
          <div>
            <h1
              className="lf-display leading-none"
              style={{ fontSize: "1.6rem", color: "var(--cream)" }}
            >
              {t("ui.header.title")}
            </h1>
            <p
              className="lf-section-label mt-0.5"
              style={{ color: "var(--teal)", letterSpacing: "0.2em" }}
            >
              {t("ui.header.subtitle")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Language selector */}
          <Select
            value={lang}
            onValueChange={(v) => { if (isValidLang(v)) setLang(v); }}
          >
            <SelectTrigger
              className="h-7 border-0 focus:ring-1 focus:ring-[#14B8A6] gap-1.5"
              style={{
                background: "var(--surface-high)",
                border: "1px solid var(--border-bright)",
                color: "var(--cream-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                letterSpacing: "0.08em",
                width: "auto",
                paddingLeft: "8px",
                paddingRight: "8px",
              }}
              aria-label="Select story language"
            >
              <span aria-hidden className="text-sm leading-none">{flag}</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              style={{
                background: "var(--surface-raised)",
                border: "1px solid var(--border-bright)",
                color: "var(--cream)",
              }}
            >
              <SelectItem value="en" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.english")}</SelectItem>
              <SelectItem value="uk" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.ukrainian")}</SelectItem>
              <SelectItem value="ru" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.russian")}</SelectItem>
              <SelectItem value="kk" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.kazakh")}</SelectItem>
            </SelectContent>
          </Select>

          {/* Status pip */}
          <div className="flex items-center gap-2">
            {email && (
              <>
                <span className="lf-section-label" style={{ color: "var(--cream-muted)" }}>
                  {email}
                </span>
                <span className="lf-section-label" style={{ color: "var(--cream-faint)" }} aria-hidden="true">
                  •
                </span>
              </>
            )}
            <div className="relative flex h-2 w-2">
              <div
                className="absolute inline-flex h-full w-full rounded-full opacity-75"
                style={{
                  background: "var(--teal)",
                  animation: "glowPulse 2.4s ease-in-out infinite",
                }}
              />
              <div
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: "var(--teal)" }}
              />
            </div>
            <span className="lf-section-label" style={{ color: "var(--cream-muted)" }}>
              {t("ui.header.studioReady")}
            </span>
          </div>
        </div>
      </header>

      {/* ── Teal → Amber accent rule — laboratory spectrum indicator ── */}
      <div
        aria-hidden
        style={{
          height: "1px",
          background: "linear-gradient(90deg, transparent 0%, var(--teal) 25%, var(--teal) 45%, var(--amber) 65%, var(--amber) 85%, transparent 100%)",
          opacity: 0.4,
        }}
      />

      {/* ── Main content ── */}
      <main className="px-4 py-8 xl:px-12 xl:py-10">
        <VibeController
          values={values}
          onChange={setValues}
          token={token}
          onTokenChange={handleTokenChange}
        />
      </main>

      {/* ── Footer ── */}
      <footer
        className="px-6 py-5 xl:px-12"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <p className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
          {t("ui.footer.tagline")}
        </p>
      </footer>
    </div>
  );
}
