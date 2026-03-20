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
  if (value < 0.2) return "strongly_minimized";
  if (value < 0.4) return "restrained";
  if (value < 0.6) return "balanced";
  if (value < 0.8) return "elevated";
  return "dominant";
};

export interface SoftWarning {
  code:
    | "stern_but_respectful"
    | "preachy_risk"
    | "detached_risk"
    | "neutral_collapse_risk"
    | "extreme_tone_risk";
}

export const deriveSoftWarnings = (values: VibeValues): SoftWarning[] => {
  const aggression = normalizeSliderValue(values.aggression);
  const readerRespect = normalizeSliderValue(values.readerRespect);
  const morality = normalizeSliderValue(values.morality);
  const warnings: SoftWarning[] = [];

  if (aggression >= 0.8 && readerRespect >= 0.8) {
    warnings.push({ code: "stern_but_respectful" });
  }
  if (morality >= 0.8 && readerRespect <= 0.2) {
    warnings.push({ code: "preachy_risk" });
  }
  if (morality <= 0.2 && readerRespect >= 0.8) {
    warnings.push({ code: "detached_risk" });
  }
  if ([aggression, readerRespect, morality].every((v) => v >= 0.4 && v <= 0.6)) {
    warnings.push({ code: "neutral_collapse_risk" });
  }
  const sourceFidelity = normalizeSliderValue(values.sourceFidelity);
  if ([aggression, readerRespect, morality, sourceFidelity].some((v) => v <= 0.1 || v >= 0.9)) {
    warnings.push({ code: "extreme_tone_risk" });
  }

  return warnings;
};
