type Lang = "en" | "uk";

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    storyBriefing: "Story Briefing",
    publicTitle: "Public Story Title",
    storyBrief: "Story Brief",
    storyLanguage: "Story Language",
    channelCalibration: "Channel Calibration",
    streamingPreview: "Streaming Story Preview",
    historicalFeed: "Historical Story Feed",
    providerConfig: "Provider Configuration",
    generateStory: "Generate Story",
  },
  uk: {
    storyBriefing: "Інструкції до історії",
    publicTitle: "Публічна назва історії",
    storyBrief: "Короткий опис",
    storyLanguage: "Мова історії",
    channelCalibration: "Калібрування каналів",
    streamingPreview: "Попередній перегляд історії",
    historicalFeed: "Історія генерацій",
    providerConfig: "Налаштування провайдера",
    generateStory: "Згенерувати історію",
  },
};

export function t(key: string, lang: Lang = "en") {
  return STRINGS[lang as Lang][key] ?? STRINGS.en[key] ?? key;
}

export function languageFlag(lang: string) {
  switch ((lang || "").toLowerCase()) {
    case "uk":
      return "🇺🇦";
    case "en":
    default:
      return "🇬🇧";
  }
}
