import {
  bandForNormalizedValue,
  normalizeSliderValue,
  type MetricBand,
  type VibeValues,
} from "./vibe-bands";

/* Local fallback tone labels used only for buildPreviewTitle (no locale available here) */
const _previewToneMap: Record<"aggression" | "readerRespect" | "morality", Record<MetricBand, string>> = {
  aggression:   { strongly_minimized: "Gentle", restrained: "Measured", balanced: "Tense", elevated: "Forceful", dominant: "Combustive" },
  readerRespect:{ strongly_minimized: "Provocative", restrained: "Spare", balanced: "Balanced", elevated: "Trusting", dominant: "Expert-facing" },
  morality:     { strongly_minimized: "Amoral", restrained: "Ambiguous", balanced: "Textured", elevated: "Principled", dominant: "Righteous" },
};

export const GENRE_OPTIONS = [
  "Fantasy",
  "Science Fiction",
  "Horror",
  "Noir",
  "Romance",
  "Thriller",
  "Historical Fiction",
  "Fairy Tale",
  "Mystery",
  "Adventure",
  "Mythology",
  "Speculative Fiction",
] as const;

export type Genre = (typeof GENRE_OPTIONS)[number];

export interface StoryDraftInput {
  values: VibeValues;
  publicTitle?: string;
  userPrompt?: string;
  language?: string;
  genre?: string;
}

export interface LongFormRequestPayload {
  context: {
    user_prompt: string;
    language?: string;
    public_title?: string;
    genre?: string;
    audience: string;
    continuity_notes: string[];
  };
  vibe: {
    aggression: number;
    reader_respect: number;
    morality: number;
    source_fidelity: number;
  };
  chapter_count: number;
  chapter_word_target: number;
  revision_limit: number;
  enable_critic: boolean;
  stream: true;
}

export interface ChapterOutlineEntry {
  number: number;
  title: string;
  summary: string;
  word_target: number;
}

export interface StreamEventFrame {
  event: string;
  payload: Record<string, unknown>;
}

const normalizeOptionalText = (value?: string): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export const buildPreviewTitle = (values: VibeValues, publicTitle?: string): string => {
  const normalizedTitle = normalizeOptionalText(publicTitle);
  if (normalizedTitle) {
    return normalizedTitle;
  }

  const aggressionBand = bandForNormalizedValue(normalizeSliderValue(values.aggression));
  const respectBand = bandForNormalizedValue(normalizeSliderValue(values.readerRespect));
  const moralityBand = bandForNormalizedValue(normalizeSliderValue(values.morality));

  return `${_previewToneMap.aggression[aggressionBand]} / ${_previewToneMap.readerRespect[respectBand]} / ${_previewToneMap.morality[moralityBand]}`;
};

const buildDefaultPrompt = (values: VibeValues, language: string): string => {
  const normalizedLanguage = (language || "en").trim().toLowerCase();
  if (normalizedLanguage === "uk" || normalizedLanguage === "ua") {
    return (
      "Напиши стислий вступ до історії українською мовою. "
      + `Калібрування: aggression=${values.aggression}, reader_respect=${values.readerRespect}, morality=${values.morality}, source_fidelity=${values.sourceFidelity}.`
    );
  }

  const vibeLabel = buildPreviewTitle(values);
  return `Write a concise opening scene that reflects this vibe profile: ${vibeLabel}.`;
};

export const buildLongFormRequest = (
  draft: StoryDraftInput,
  chapterCount: number,
  chapterWordTarget: number,
  enableCritic: boolean = true,
): LongFormRequestPayload => {
  const publicTitle = normalizeOptionalText(draft.publicTitle);
  const language    = draft.language ?? "en";
  const userPrompt  = normalizeOptionalText(draft.userPrompt) ?? buildDefaultPrompt(draft.values, language);

  return {
    context: {
      user_prompt: userPrompt,
      language,
      public_title: publicTitle,
      genre: draft.genre || "Speculative Fiction",
      audience: "adult",
      continuity_notes: [],
    },
    vibe: {
      aggression:      draft.values.aggression,
      reader_respect:  draft.values.readerRespect,
      morality:        draft.values.morality,
      source_fidelity: draft.values.sourceFidelity,
    },
    chapter_count:      chapterCount,
    chapter_word_target: chapterWordTarget,
    revision_limit: 2,
    enable_critic: enableCritic,
    stream: true,
  };
};

export const parseSseChunk = (rawChunk: string): StreamEventFrame | null => {
  const lines = rawChunk
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return null;
  }

  let eventName = "message";
  const payloadLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      payloadLines.push(line.slice(5).trim());
    }
  }

  const payloadRaw = payloadLines.join("\n");
  if (!payloadRaw) {
    return { event: eventName, payload: {} };
  }

  try {
    return {
      event: eventName,
      payload: JSON.parse(payloadRaw) as Record<string, unknown>,
    };
  } catch {
    return {
      event: eventName,
      payload: { text: payloadRaw },
    };
  }
};
