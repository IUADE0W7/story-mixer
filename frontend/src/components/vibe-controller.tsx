"use client";

import { useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { SliderVariant } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/lib/language-context";
import type { TranslationKey } from "@/locales/index";
import {
  bandForNormalizedValue,
  type MetricBand,
  normalizeSliderValue,
  type VibeMetricName,
  type VibeValues,
} from "@/lib/vibe-bands";
import {
  buildPreviewTitle,
  DEFAULT_PROVIDER_CONFIG,
  GENRE_OPTIONS,
  PROVIDER_OPTIONS,
  type ProviderConfig,
} from "@/lib/story-streaming";
import { useLongFormStream, type ChapterState } from "@/components/use-long-form-stream";
import { AgentInteractionLog } from "@/components/agent-interaction-log";
import { downloadStoryAsPdf } from "@/lib/story-pdf";

interface VibeControllerProps {
  values: VibeValues;
  onChange: (next: VibeValues) => void;
}

interface SliderDefinition {
  key: VibeMetricName;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  variant: SliderVariant;
  accentColor: string;
  accentGlow: string;
  accentBg: string;
}

/* ── Genre → flavor locale key map ── */
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

/* ── Seed tags ── */
type SeedTag = {
  labelKey: TranslationKey;
  seed: string;
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

/* ── Tone label computation ── */
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

/* ── Shared input style ── */
const inputStyle = {
  background: "var(--surface-high)",
  border: "1px solid var(--border-bright)",
  color: "var(--cream)",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
} as React.CSSProperties;

const selectContentStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--border-bright)",
  color: "var(--cream)",
} as React.CSSProperties;

/* ── Section wrapper ── */
function Section({
  id, label, description, children, className = "", entranceClass = "",
}: {
  id: string;
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  entranceClass?: string;
}) {
  return (
    <section
      role="region"
      aria-labelledby={id}
      className={`rounded-xl p-5 lf-panel ${entranceClass} ${className}`}
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
      }}
    >
      <header className="mb-4">
        <h3 id={id} className="lf-section-label" style={{ color: "var(--teal)" }}>
          {label}
        </h3>
        {description && (
          <p className="mt-1 text-xs" style={{ color: "var(--cream-muted)", fontFamily: "var(--font-mono)" }}>
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

/* ── VU Meter Segments ── */
function VuMeter({ value, accentColor, max = 10 }: { value: number; accentColor: string; max?: number }) {
  return (
    <div className="flex gap-0.5" role="presentation" aria-hidden>
      {Array.from({ length: max }, (_, i) => i + 1).map((seg) => {
        const active = seg <= value;
        const isHot  = active && seg >= value;
        return (
          <div
            key={seg}
            className="flex-1 rounded-sm transition-all duration-150"
            style={{
              height: "6px",
              background: active ? accentColor : "var(--surface-high)",
              opacity: active ? Math.min(1, 0.45 + seg * 0.055) : 0.22,
              boxShadow: isHot ? `0 0 5px ${accentColor}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Mixer Channel (slider with VU meter + tooltip) ── */
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

  return (
    <div
      className="rounded-lg p-4 space-y-2.5 transition-shadow duration-300"
      style={{
        border: `1px solid ${def.accentColor}35`,
        background: def.accentBg,
      }}
      aria-label={`${label} control strip`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none truncate" style={{ fontFamily: "var(--font-mono)", color: def.accentColor }}>
            {label}
          </p>
          <p className="text-xs mt-1 line-clamp-2" style={{ color: "var(--cream-faint)", fontFamily: "var(--font-mono)" }}>
            {description}
          </p>
        </div>
        {/* Illuminated value knob */}
        <div
          className="relative shrink-0 flex flex-col items-center"
          onMouseEnter={() => setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
        >
          <div
            className="lf-knob-badge"
            style={{
              borderColor: def.accentColor,
              boxShadow: `0 0 10px ${def.accentGlow}, inset 0 0 6px ${def.accentBg}`,
            }}
          >
            <span
              className="text-xl font-medium tabular-nums leading-none"
              style={{ fontFamily: "var(--font-mono)", color: def.accentColor }}
            >
              {rawValue}
            </span>
            <span className="text-xs leading-none" style={{ color: "var(--cream-faint)", fontFamily: "var(--font-mono)" }}>
              /10
            </span>
          </div>
          {/* Tooltip */}
          {tooltipVisible && (
            <div
              className="absolute -top-9 right-0 z-10 px-2.5 py-1 rounded whitespace-nowrap"
              style={{
                background: "var(--surface-high)",
                border: `1px solid ${def.accentColor}60`,
                color: def.accentColor,
                fontFamily: "var(--font-mono)",
                fontSize: "10px",
                letterSpacing: "0.1em",
                boxShadow: `0 0 12px ${def.accentGlow}`,
              }}
              role="tooltip"
            >
              {toneLabel.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* VU meter */}
      <VuMeter value={rawValue} accentColor={def.accentColor} />

      {/* Slider */}
      <Slider
        id={`vibe-${def.key}`}
        variant={def.variant}
        min={1}
        max={10}
        step={1}
        value={[rawValue]}
        onValueChange={(v) => onUpdate(v[0] ?? rawValue)}
        aria-label={`${label} slider`}
        aria-valuemin={1}
        aria-valuemax={10}
        aria-valuenow={rawValue}
        aria-valuetext={`${label} ${rawValue} out of 10, ${intensityLabel} intensity`}
        className="py-1"
      />

      {/* Footer row */}
      <div className="flex items-center justify-end min-w-0">
        <span
          className="text-xs truncate text-right"
          style={{ color: def.accentColor, fontFamily: "var(--font-mono)", opacity: 0.85 }}
        >
          {bandLabel} · {toneLabel}
        </span>
      </div>
    </div>
  );
}

export function VibeController({
  values,
  onChange,
}: VibeControllerProps) {
  const { lang, setLang, t, flag } = useLanguage();
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(DEFAULT_PROVIDER_CONFIG);
  const [sourceTaleA, setSourceTaleA]     = useState<string>("");
  const [sourceTaleB, setSourceTaleB]     = useState<string>("");
  const [userPrompt, setUserPrompt]       = useState<string>("");
  const [genre, setGenre]                 = useState<string>("");
  const [chapterCount, setChapterCount]   = useState(4);
  const [chapterWords, setChapterWords]   = useState(400);
  const [langBannerDismissed, setLangBannerDismissed] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  /* Derived title from two source tales */
  const combinedTitle = [sourceTaleA.trim(), sourceTaleB.trim()].filter(Boolean).join(" × ");
  const normalizedUserPrompt  = userPrompt.trim();

  /* Language detection */
  const hasCyrillic   = /[\u0400-\u04FF]/.test(userPrompt);
  const showLangBanner = hasCyrillic && lang === "en" && !langBannerDismissed && userPrompt.length > 8;

  /* Tone label */
  const toneLabel = useMemo(() => buildToneLabel(values, genre, t), [values, genre, t]);

  const {
    outline,
    chapters: longFormChapters,
    streamStatus: lfStatus,
    isStreaming: lfIsStreaming,
    streamError: lfError,
    agentLog: lfAgentLog,
    generateLongForm,
    reset: resetLongForm,
  } = useLongFormStream();

  const previewTitle  = useMemo(() => buildPreviewTitle(values, combinedTitle), [values, combinedTitle]);

  const updateValue = (metric: VibeMetricName, next: number) => {
    onChange({ ...values, [metric]: Math.max(1, Math.min(10, Math.round(next))) });
  };

  const handleSeedTag = (seed: string) => {
    setUserPrompt((p) => (p.trim() ? `${p.trim()}\n\n${seed}` : seed));
  };

  const [validationError, setValidationError] = useState<string | null>(null);

  const handleGenerate = async () => {
    const missing: string[] = [];
    if (!sourceTaleA.trim()) missing.push(t("vibe.validation.originalStoryA"));
    if (!sourceTaleB.trim()) missing.push(t("vibe.validation.originalStoryB"));
    if (!genre) missing.push(t("vibe.validation.genre"));
    if (missing.length > 0) {
      setValidationError(`${t("vibe.validation.pleaseFillIn")} ${missing.join(", ")}`);
      return;
    }
    setValidationError(null);
    resetLongForm();
    await generateLongForm({
      draft: {
        values,
        publicTitle: combinedTitle,
        userPrompt: normalizedUserPrompt,
        language: lang,
        genre,
      },
      providerConfig,
      chapterCount,
      chapterWordTarget: chapterWords,
    });
  };

  return (
    <div className="space-y-4">

      {/* ── Story Briefing ── */}
      <Section
        id="brief-heading"
        label={t("vibe.briefing.sectionLabel")}
        description={t("vibe.briefing.description")}
        entranceClass="lf-entrance-1"
      >
        {/* Source Tale fields */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 mb-4">
          <div className="space-y-1.5">
            <Label htmlFor="source-tale-a" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
              {t("vibe.briefing.sourceTaleA")}
            </Label>
            <Input
              id="source-tale-a"
              value={sourceTaleA}
              onChange={(e) => { setSourceTaleA(e.target.value); setValidationError(null); }}
              placeholder={t("vibe.placeholders.sourceTaleA")}
              aria-label="First source tale"
              style={inputStyle}
              className="border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source-tale-b" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
              {t("vibe.briefing.sourceTaleB")}
            </Label>
            <Input
              id="source-tale-b"
              value={sourceTaleB}
              onChange={(e) => { setSourceTaleB(e.target.value); setValidationError(null); }}
              placeholder={t("vibe.placeholders.sourceTaleB")}
              aria-label="Second source tale"
              style={inputStyle}
              className="border-0 focus-visible:ring-1 focus-visible:ring-[#F59E0B]"
            />
          </div>
        </div>

        {/* Combined title preview */}
        {combinedTitle && (
          <div
            className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg"
            style={{ background: "var(--teal-glow)", border: "1px solid rgba(20,184,166,0.18)" }}
          >
            <span className="lf-section-label" style={{ color: "var(--teal)" }}>MIX</span>
            <span className="text-sm" style={{ color: "var(--cream)", fontFamily: "var(--font-display)", fontStyle: "italic" }}>
              {combinedTitle}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)]">

          {/* Left: genre + language + chapter settings */}
          <div className="space-y-3">
            {/* Genre */}
            <div className="space-y-1.5">
              <Label htmlFor="genre-select" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                {t("vibe.fields.genre")}
              </Label>
              <Select value={genre} onValueChange={(v) => { setGenre(v); setValidationError(null); }}>
                <SelectTrigger
                  id="genre-select"
                  className="w-full border-0 focus:ring-1 focus:ring-[#14B8A6]"
                  style={inputStyle}
                  aria-label="Select story genre"
                >
                  <SelectValue placeholder={t("vibe.placeholders.selectGenre")} />
                </SelectTrigger>
                <SelectContent style={selectContentStyle}>
                  {GENRE_OPTIONS.map((g) => (
                    <SelectItem key={g} value={g} className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Narrative tone preview panel */}
            <div
              className="rounded-lg px-3 py-2.5 space-y-0.5"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
              aria-live="polite"
              aria-label="Narrative tone preview"
            >
              <p className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                {t("vibe.briefing.narrativeTone")}
              </p>
              <p
                className="lf-display leading-tight"
                style={{ fontSize: "0.95rem", color: "var(--cream)" }}
              >
                {toneLabel}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="language-select" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                {t("vibe.language.sectionLabel")}
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  value={lang}
                  onValueChange={(v) => {
                    setLang(v === "uk" ? "uk" : "en");
                    setLangBannerDismissed(false);
                  }}
                >
                  <SelectTrigger
                    id="language-select"
                    className="w-36 border-0 focus:ring-1 focus:ring-[#14B8A6]"
                    style={inputStyle}
                    aria-label="Select story language"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={selectContentStyle}>
                    <SelectItem value="en" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.english")}</SelectItem>
                    <SelectItem value="uk" className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]">{t("vibe.language.ukrainian")}</SelectItem>
                  </SelectContent>
                </Select>
                <span aria-hidden className="text-lg">{flag}</span>
              </div>
            </div>

            {/* Chapter settings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="chapter-count" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                  {t("vibe.fields.chapters")}
                </Label>
                <Input
                  id="chapter-count"
                  type="number"
                  min={2}
                  max={10}
                  step={1}
                  value={chapterCount}
                  onChange={(e) => setChapterCount(Math.max(2, Math.min(10, Number(e.target.value))))}
                  style={inputStyle}
                  className="border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6] text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="chapter-words" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                  {t("vibe.fields.wordsPerChapter")}
                </Label>
                <Input
                  id="chapter-words"
                  type="number"
                  min={100}
                  max={2000}
                  step={100}
                  value={chapterWords}
                  onChange={(e) => setChapterWords(Math.max(100, Math.min(2000, Number(e.target.value))))}
                  style={inputStyle}
                  className="border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6] text-center"
                />
              </div>
            </div>
          </div>

          {/* Right: seed tags + brief textarea + language banner */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="story-brief-input" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                {t("vibe.brief.sectionLabel")}
              </Label>
            </div>

            {/* Seed tags */}
            <div
              className="flex flex-wrap gap-1.5 pb-1"
              role="group"
              aria-label="Story seed suggestions"
            >
              {SEED_TAGS.map((tag) => (
                <button
                  key={tag.labelKey}
                  type="button"
                  onClick={() => handleSeedTag(tag.seed)}
                  className="px-2 py-0.5 rounded transition-all duration-150 hover:border-[var(--teal)] hover:text-[var(--teal)] active:scale-95"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "10px",
                    letterSpacing: "0.08em",
                    color: "var(--cream-faint)",
                    background: "var(--surface)",
                    border: "1px solid var(--border-bright)",
                  }}
                  aria-label={`Add seed: ${t(tag.labelKey)}`}
                >
                  + {t(tag.labelKey)}
                </button>
              ))}
            </div>

            <Textarea
              id="story-brief-input"
              value={userPrompt}
              onChange={(e) => {
                setUserPrompt(e.target.value);
                setLangBannerDismissed(false);
              }}
              placeholder={t("vibe.brief.placeholder")}
              aria-label="Custom story brief"
              className="min-h-28 border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6] resize-none lf-manuscript"
              style={{ ...inputStyle, fontSize: "13px", lineHeight: "1.7" }}
            />

            {/* Language detection banner */}
            {showLangBanner && (
              <div
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{
                  background: "rgba(20,184,166,0.07)",
                  border: "1px solid rgba(20,184,166,0.25)",
                }}
                role="alert"
              >
                <p className="text-xs" style={{ color: "var(--teal)", fontFamily: "var(--font-mono)" }}>
                  {t("vibe.language.cyrillicDetected")}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setLang("uk"); setLangBannerDismissed(true); }}
                    className="px-2 py-0.5 rounded text-xs transition-colors"
                    style={{
                      fontFamily: "var(--font-mono)",
                      background: "var(--teal)",
                      color: "#0B0E14",
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {t("vibe.buttons.switch")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLangBannerDismissed(true)}
                    className="px-2 py-0.5 rounded text-xs transition-colors"
                    style={{
                      fontFamily: "var(--font-mono)",
                      color: "var(--cream-faint)",
                      fontSize: "10px",
                      letterSpacing: "0.1em",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {t("vibe.buttons.dismiss")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* ── Three-column grid: Channels / Preview / History ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">

        {/* ── Channel Calibration (Mixing Board) ── */}
        <Section
          id="calibration-heading"
          label={t("vibe.channels.sectionLabel")}
          description={t("vibe.channels.description")}
          entranceClass="lf-entrance-2"
        >
          <div className="space-y-3">
            {sliderDefinitions.map((def) => (
              <MixerChannel
                key={def.key}
                def={def}
                rawValue={values[def.key]}
                onUpdate={(v) => updateValue(def.key, v)}
                t={t}
              />
            ))}
          </div>
        </Section>

        {/* ── Long-form Progress ── */}
        <Section
            id="preview-heading"
            label={t("vibe.progress.sectionLabel")}
            entranceClass="lf-entrance-3"
            className="flex flex-col"
          >
            <div className="flex items-center justify-between mb-3 -mt-1">
              <span className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
                {chapterCount} {t("vibe.progress.chaptersUnit")} · {chapterWords} {t("vibe.progress.wordsEachUnit")}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  fontFamily: "var(--font-mono)",
                  background: lfIsStreaming ? "var(--teal-glow)" : "var(--surface-high)",
                  color: lfIsStreaming ? "var(--teal)" : "var(--cream-faint)",
                  border: `1px solid ${lfIsStreaming ? "var(--teal)" : "var(--border)"}`,
                  transition: "all 0.3s ease",
                }}
              >
                {lfStatus}
              </span>
            </div>

            <div className="flex-1 space-y-2 max-h-[520px] overflow-y-auto pr-1" aria-live="polite">

              {/* Outline table of contents */}
              {outline.length > 0 && (
                <div className="rounded-lg p-3 mb-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <p className="lf-section-label mb-2" style={{ color: "var(--teal)" }}>{t("vibe.progress.tableOfContents")}</p>
                  {outline.map((ch) => (
                    <div key={ch.number} className="flex items-baseline gap-2 py-0.5">
                      <span className="lf-section-label shrink-0" style={{ color: "var(--teal)", minWidth: "2ch" }}>{ch.number}.</span>
                      <span className="text-xs" style={{ color: "var(--cream-muted)", fontFamily: "var(--font-mono)" }}>{ch.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Chapter cards */}
              {longFormChapters.length === 0 && !lfIsStreaming && !lfError && (
                <div className="rounded-lg p-6 text-center" style={{ border: "1px dashed var(--border-bright)" }}>
                  <p className="lf-section-label" style={{ color: "var(--cream-faint)" }}>{t("vibe.status.readyToGenerate")}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--cream-faint)", fontFamily: "var(--font-mono)", opacity: 0.6 }}>
                    {t("vibe.status.pressForgeNarrative")}
                  </p>
                </div>
              )}

              {longFormChapters.map((ch) => {
                const statusColor: Record<ChapterState["status"], string> = {
                  pending:    "var(--cream-faint)",
                  generating: "var(--teal)",
                  revising:   "var(--amber)",
                  complete:   ch.accepted ? "var(--teal)" : "var(--amber)",
                };
                return (
                  <div
                    key={ch.outline.number}
                    className="rounded-lg p-3 space-y-2"
                    style={{
                      background: "var(--surface)",
                      border: `1px solid ${ch.status === "generating" ? "var(--teal)" : ch.status === "revising" ? "var(--amber)" : "var(--border)"}`,
                      borderLeft: `3px solid ${statusColor[ch.status]}`,
                      transition: "border-color 0.3s ease",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="lf-display" style={{ fontSize: "0.85rem", color: "var(--cream)" }}>
                        {ch.outline.number}. {ch.outline.title}
                      </span>
                      <span
                        className="text-xs shrink-0"
                        style={{ fontFamily: "var(--font-mono)", color: statusColor[ch.status] }}
                      >
                        {ch.status === "pending" ? t("vibe.status.pending") :
                         ch.status === "generating" ? t("vibe.status.writing") :
                         ch.status === "revising" ? `${t("vibe.status.revising")} (${ch.revisionCount})` :
                         ch.accepted ? `${t("vibe.status.done")} · ${ch.wordCount}w` : `${t("vibe.status.lowQuality")} · ${ch.wordCount}w`}
                      </span>
                    </div>

                    {ch.status === "generating" && ch.text.length === 0 && (
                      <div className="space-y-1.5">
                        {[0.9, 0.7, 0.85].map((w, i) => (
                          <div key={i} className="lf-shimmer rounded" style={{ height: "10px", width: `${w * 100}%` }} />
                        ))}
                      </div>
                    )}

                    {ch.text.length > 0 && (
                      <p
                        className={`text-xs leading-5 ${ch.status !== "complete" ? "line-clamp-3" : ""} ${ch.status === "generating" ? "lf-streaming" : ""}`}
                        style={{ color: "var(--cream-muted)", fontFamily: "var(--font-serif)" }}
                      >
                        {ch.status !== "complete" ? ch.text.slice(0, 240) : ch.text}
                      </p>
                    )}
                  </div>
                );
              })}

              {lfError && (
                <Alert className="border-0" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <AlertTitle style={{ color: "var(--rose)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>{t("vibe.progress.error")}</AlertTitle>
                  <AlertDescription style={{ color: "var(--cream-muted)", fontFamily: "var(--font-mono)", fontSize: "11px" }}>{lfError}</AlertDescription>
                </Alert>
              )}
            </div>

            {longFormChapters.length > 0 && !lfIsStreaming && (
              <div className="mt-3 flex items-center justify-end gap-3">
                {pdfError && (
                  <span className="lf-section-label" style={{ color: "var(--rose)", letterSpacing: "0.05em" }}>
                    {t("vibe.pdf.exportFailed")}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPdfError(null);
                    const fullText = longFormChapters
                      .map((ch) => `${ch.outline.number}. ${ch.outline.title}\n\n${ch.text}`)
                      .join("\n\n\n");
                    downloadStoryAsPdf(fullText, previewTitle, genre).catch((err: unknown) => {
                      console.error("PDF download failed:", err);
                      setPdfError(t("vibe.pdf.exportFailed"));
                    });
                  }}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--teal)",
                    borderColor: "var(--teal)",
                    background: "transparent",
                  }}
                >
                  {t("vibe.buttons.downloadPdf")}
                </Button>
              </div>
            )}
          </Section>

      {/* ── Agent Interaction Log ── */}
      <AgentInteractionLog entries={lfAgentLog} />
      </div>

      {/* ── Provider Configuration ── */}
      <Section
        id="provider-heading"
        label={t("vibe.provider.sectionLabel")}
        entranceClass="lf-entrance-5"
      >
        <div className="flex flex-wrap items-end gap-4">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label htmlFor="provider-select" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
              {t("vibe.fields.provider")}
            </Label>
            <Select
              value={providerConfig.provider}
              onValueChange={(nextProvider) => {
                const option    = PROVIDER_OPTIONS.find((o) => o.id === nextProvider);
                const nextModel = option?.defaultModel ?? providerConfig.model;
                setProviderConfig((p) => ({ ...p, provider: nextProvider, model: nextModel, judgeModel: nextModel }));
              }}
            >
              <SelectTrigger
                id="provider-select"
                className="w-44 border-0 focus:ring-1 focus:ring-[#14B8A6]"
                style={inputStyle}
                aria-label="Select LLM provider"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent style={selectContentStyle}>
                {PROVIDER_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.id}
                    value={opt.id}
                    className="focus:bg-[var(--surface-high)] focus:text-[var(--cream)]"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label htmlFor="model-input" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
              {t("vibe.fields.model")}
            </Label>
            <Input
              id="model-input"
              value={providerConfig.model}
              onChange={(e) => setProviderConfig((p) => ({ ...p, model: e.target.value }))}
              aria-label="Model name"
              className="w-52 border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6]"
              style={inputStyle}
            />
          </div>

          {/* Judge Model */}
          <div className="space-y-1.5">
            <Label htmlFor="judge-model-input" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
              {t("vibe.fields.judgeModel")}
            </Label>
            <Input
              id="judge-model-input"
              value={providerConfig.judgeModel}
              onChange={(e) => setProviderConfig((p) => ({ ...p, judgeModel: e.target.value }))}
              aria-label="Judge model name"
              className="w-52 border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6]"
              style={inputStyle}
            />
          </div>

          {/* Temperature */}
          <div className="space-y-1.5">
            <Label htmlFor="temperature-input" className="lf-section-label" style={{ color: "var(--cream-faint)" }}>
              {t("vibe.fields.temperature")}
            </Label>
            <Input
              id="temperature-input"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={providerConfig.temperature}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                if (Number.isFinite(parsed)) {
                  setProviderConfig((p) => ({ ...p, temperature: Math.max(0, Math.min(2, parsed)) }));
                }
              }}
              aria-label="Temperature"
              className="w-20 border-0 focus-visible:ring-1 focus-visible:ring-[#14B8A6]"
              style={inputStyle}
            />
          </div>
        </div>
      </Section>

      {/* ── Forge Narrative Button ── */}
      <div className="lf-entrance-5 flex flex-col items-center gap-3 py-4">
        {lfIsStreaming && (
          <span
            className="text-xs"
            style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}
          >
            {lfStatus}...
          </span>
        )}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={lfIsStreaming}
          aria-label="Forge narrative from current calibration"
          className={`lf-forge-btn ${lfIsStreaming ? "" : "lf-forge-btn--active"} relative overflow-hidden disabled:opacity-50`}
        >
          {lfIsStreaming ? (
            <span className="flex items-center gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                style={{ animation: "slowSpin 1.2s linear infinite" }}
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" />
              </svg>
              {t("vibe.buttons.brewingNarrative")}
            </span>
          ) : (
            <span className="flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2L14.5 9.5H22L16 14L18.5 21.5L12 17L5.5 21.5L8 14L2 9.5H9.5L12 2Z" fill="currentColor" opacity="0.9" />
              </svg>
              {t("vibe.buttons.forgeNarrative")}
            </span>
          )}
        </button>
        {validationError ? (
          <p
            className="text-xs text-center"
            style={{ color: "#EF4444", fontFamily: "var(--font-mono)" }}
            role="alert"
          >
            {validationError}
          </p>
        ) : (
          <p
            className="text-xs text-center"
            style={{ color: "var(--cream-faint)", fontFamily: "var(--font-mono)" }}
          >
            {genre ? `${toneLabel}` : t("vibe.hints.setGenreToBegin")}
          </p>
        )}
      </div>

    </div>
  );
}
