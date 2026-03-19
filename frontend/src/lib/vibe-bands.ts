export type VibeMetricName = "aggression" | "readerRespect" | "morality" | "sourceFidelity";

export type MetricBand =
  | "strongly_minimized"
  | "restrained"
  | "balanced"
  | "elevated"
  | "dominant";

export interface VibeValues {
  aggression: number;
  readerRespect: number;
  morality: number;
  sourceFidelity: number;
}

const clamp = (value: number): number => Math.max(1, Math.min(10, Math.round(value)));

export const normalizeSliderValue = (value: number): number => {
  return Number((clamp(value) / 10).toFixed(4));
};

export const bandForNormalizedValue = (value: number): MetricBand => {
  if (value < 0.2) {
    return "strongly_minimized";
  }
  if (value < 0.4) {
    return "restrained";
  }
  if (value < 0.6) {
    return "balanced";
  }
  if (value < 0.8) {
    return "elevated";
  }
  return "dominant";
};

export const bandLabelMap: Record<MetricBand, string> = {
  strongly_minimized: "Strongly Minimized",
  restrained: "Restrained",
  balanced: "Balanced",
  elevated: "Elevated",
  dominant: "Dominant",
};

export const toneLabelMap: Record<VibeMetricName, Record<MetricBand, string>> = {
  aggression: {
    strongly_minimized: "Gentle",
    restrained: "Measured",
    balanced: "Tense",
    elevated: "Forceful",
    dominant: "Combustive",
  },
  readerRespect: {
    strongly_minimized: "Provocative",
    restrained: "Spare",
    balanced: "Balanced",
    elevated: "Trusting",
    dominant: "Expert-facing",
  },
  morality: {
    strongly_minimized: "Amoral",
    restrained: "Ambiguous",
    balanced: "Textured",
    elevated: "Principled",
    dominant: "Righteous",
  },
  sourceFidelity: {
    strongly_minimized: "Pure Invention",
    restrained: "Loose Inspiration",
    balanced: "Blended",
    elevated: "Faithful",
    dominant: "Canonical",
  },
};

export interface SoftWarning {
  code:
    | "stern_but_respectful"
    | "preachy_risk"
    | "detached_risk"
    | "neutral_collapse_risk"
    | "extreme_tone_risk";
  message: string;
}

export const deriveSoftWarnings = (values: VibeValues): SoftWarning[] => {
  const aggression = normalizeSliderValue(values.aggression);
  const readerRespect = normalizeSliderValue(values.readerRespect);
  const morality = normalizeSliderValue(values.morality);
  const warnings: SoftWarning[] = [];

  if (aggression >= 0.8 && readerRespect >= 0.8) {
    warnings.push({
      code: "stern_but_respectful",
      message:
        "High aggression plus high reader respect targets stern professionalism, not abusive tone.",
    });
  }

  if (morality >= 0.8 && readerRespect <= 0.2) {
    warnings.push({
      code: "preachy_risk",
      message: "High morality with low reader respect can drift into lecturing prose.",
    });
  }

  if (morality <= 0.2 && readerRespect >= 0.8) {
    warnings.push({
      code: "detached_risk",
      message: "Low morality with high reader respect can read clinically detached.",
    });
  }

  if ([aggression, readerRespect, morality].every((metricValue) => metricValue >= 0.4 && metricValue <= 0.6)) {
    warnings.push({
      code: "neutral_collapse_risk",
      message: "Balanced settings across all sliders may produce generic prose without stylistic anchors.",
    });
  }

  const sourceFidelity = normalizeSliderValue(values.sourceFidelity);
  if ([aggression, readerRespect, morality, sourceFidelity].some((metricValue) => metricValue <= 0.1 || metricValue >= 0.9)) {
    warnings.push({
      code: "extreme_tone_risk",
      message: "Extreme settings are valid but should be judged for coherence and policy safety.",
    });
  }

  return warnings;
};
