import {
  bandForNormalizedValue,
  normalizeSliderValue,
  toneLabelMap,
  type VibeValues,
} from "./vibe-bands";

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
  provider: {
    provider: string;
    model: string;
    judge_model: string;
    temperature: number;
  };
  chapter_count: number;
  chapter_word_target: number;
  revision_limit: number;
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

export interface ProviderConfig {
  provider: string;
  model: string;
  judgeModel: string;
  temperature: number;
}

export interface ProviderOption {
  id: string;
  label: string;
  defaultModel: string;
}

export const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: "ollama",    label: "Ollama (local)",   defaultModel: "gpt-oss:20b" },
  { id: "openai",    label: "OpenAI",            defaultModel: "gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic",         defaultModel: "claude-3-haiku-20240307" },
  { id: "gemini",    label: "Google Gemini",     defaultModel: "gemini-1.5-flash" },
];

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: "ollama",
  model: "gpt-oss:20b",
  judgeModel: "gpt-oss:20b",
  temperature: 0.8,
};

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

  return `${toneLabelMap.aggression[aggressionBand]} / ${toneLabelMap.readerRespect[respectBand]} / ${toneLabelMap.morality[moralityBand]}`;
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
  providerConfig: ProviderConfig,
  chapterCount: number,
  chapterWordTarget: number,
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
    provider: {
      provider:    providerConfig.provider,
      model:       providerConfig.model,
      judge_model: providerConfig.judgeModel,
      temperature: providerConfig.temperature,
    },
    chapter_count:      chapterCount,
    chapter_word_target: chapterWordTarget,
    revision_limit: 2,
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
