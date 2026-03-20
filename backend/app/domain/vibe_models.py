"""Pydantic models for converting UI slider values into calibrated prompt controls."""

from __future__ import annotations

from enum import StrEnum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, computed_field


class MetricBand(StrEnum):
    """Semantic bands used to stabilize prompt wording across small float changes."""

    STRONGLY_MINIMIZED = "strongly_minimized"
    RESTRAINED = "restrained"
    BALANCED = "balanced"
    ELEVATED = "elevated"
    DOMINANT = "dominant"


class SoftConstraintCode(StrEnum):
    """Codes used to surface creative tension without blocking the request."""

    STERN_BUT_RESPECTFUL = "stern_but_respectful"
    PREACHY_RISK = "preachy_risk"
    DETACHED_RISK = "detached_risk"
    NEUTRAL_COLLAPSE_RISK = "neutral_collapse_risk"
    EXTREME_TONE_RISK = "extreme_tone_risk"


class VibeMetricWarning(BaseModel):
    """Soft validation signal for metric combinations that deserve extra scrutiny."""

    model_config = ConfigDict(frozen=True)

    code: SoftConstraintCode
    message: str
    affected_metrics: tuple[str, ...] = Field(default_factory=tuple)


class CalibrationDirective(BaseModel):
    """Prompt-calibration instruction derived from a normalized metric value."""

    model_config = ConfigDict(frozen=True)

    metric_name: str
    value: float = Field(ge=0.0, le=1.0, strict=True)
    band: MetricBand
    instruction: str
    negative_instruction: str


class VibeMetrics(BaseModel):
    """Normalized vibe controls consumed by prompt builders and judge agents."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    aggression: float = Field(ge=0.0, le=1.0, strict=True)
    reader_respect: float = Field(ge=0.0, le=1.0, strict=True)
    morality: float = Field(ge=0.0, le=1.0, strict=True)
    source_fidelity: float = Field(ge=0.0, le=1.0, strict=True)

    def band_for(self, value: float) -> MetricBand:
        """Map a normalized control value into a stable semantic band."""

        if value < 0.2:
            return MetricBand.STRONGLY_MINIMIZED
        if value < 0.4:
            return MetricBand.RESTRAINED
        if value < 0.6:
            return MetricBand.BALANCED
        if value < 0.8:
            return MetricBand.ELEVATED
        return MetricBand.DOMINANT

    def build_directives(self) -> tuple[CalibrationDirective, ...]:
        """Translate numeric values into stable prompt-building instructions."""

        return (
            CalibrationDirective(
                metric_name="aggression",
                value=self.aggression,
                band=self.band_for(self.aggression),
                instruction=self._instruction_for_aggression(),
                negative_instruction=self._negative_for_aggression(),
            ),
            CalibrationDirective(
                metric_name="reader_respect",
                value=self.reader_respect,
                band=self.band_for(self.reader_respect),
                instruction=self._instruction_for_reader_respect(),
                negative_instruction=self._negative_for_reader_respect(),
            ),
            CalibrationDirective(
                metric_name="morality",
                value=self.morality,
                band=self.band_for(self.morality),
                instruction=self._instruction_for_morality(),
                negative_instruction=self._negative_for_morality(),
            ),
            CalibrationDirective(
                metric_name="source_fidelity",
                value=self.source_fidelity,
                band=self.band_for(self.source_fidelity),
                instruction=self._instruction_for_source_fidelity(),
                negative_instruction=self._negative_for_source_fidelity(),
            ),
        )

    def build_warnings(self) -> tuple[VibeMetricWarning, ...]:
        """Return soft warnings for combinations that may confuse generation quality."""

        warnings: list[VibeMetricWarning] = []

        if self.aggression >= 0.8 and self.reader_respect >= 0.8:
            warnings.append(
                VibeMetricWarning(
                    code=SoftConstraintCode.STERN_BUT_RESPECTFUL,
                    message=(
                        "High aggression and high reader respect require a stern, professional "
                        "voice rather than abusive language."
                    ),
                    affected_metrics=("aggression", "reader_respect"),
                )
            )

        if self.morality >= 0.8 and self.reader_respect <= 0.2:
            warnings.append(
                VibeMetricWarning(
                    code=SoftConstraintCode.PREACHY_RISK,
                    message=(
                        "High morality with low reader respect can drift into a lecturing tone."
                    ),
                    affected_metrics=("morality", "reader_respect"),
                )
            )

        if self.morality <= 0.2 and self.reader_respect >= 0.8:
            warnings.append(
                VibeMetricWarning(
                    code=SoftConstraintCode.DETACHED_RISK,
                    message=(
                        "Low morality with high reader respect can become clinically detached."
                    ),
                    affected_metrics=("morality", "reader_respect"),
                )
            )

        mid_metrics = (self.aggression, self.reader_respect, self.morality)
        if all(0.4 <= value <= 0.6 for value in mid_metrics):
            warnings.append(
                VibeMetricWarning(
                    code=SoftConstraintCode.NEUTRAL_COLLAPSE_RISK,
                    message="Midpoint values across all metrics risk generic, flattened prose.",
                    affected_metrics=("aggression", "reader_respect", "morality"),
                )
            )

        all_metrics = (self.aggression, self.reader_respect, self.morality, self.source_fidelity)
        if any(value <= 0.1 or value >= 0.9 for value in all_metrics):
            warnings.append(
                VibeMetricWarning(
                    code=SoftConstraintCode.EXTREME_TONE_RISK,
                    message=(
                        "Extreme values require the judge to verify "
                        "the prose stayed coherent and safe."
                    ),
                    affected_metrics=tuple(
                        metric_name
                        for metric_name, value in (
                            ("aggression", self.aggression),
                            ("reader_respect", self.reader_respect),
                            ("morality", self.morality),
                            ("source_fidelity", self.source_fidelity),
                        )
                        if value <= 0.1 or value >= 0.9
                    ),
                )
            )

        return tuple(warnings)

    @computed_field(return_type=tuple[CalibrationDirective, ...])
    @property
    def directives(self) -> tuple[CalibrationDirective, ...]:
        """Expose the prompt directives as serialized derived data."""

        return self.build_directives()

    @computed_field(return_type=tuple[VibeMetricWarning, ...])
    @property
    def warnings(self) -> tuple[VibeMetricWarning, ...]:
        """Expose soft warnings so the judge agent can see the creative tension."""

        return self.build_warnings()

    def to_calibration_profile(self) -> CalibrationProfile:
        """Bundle directives and warnings for prompt assembly and judging."""

        return CalibrationProfile(metrics=self, directives=self.directives, warnings=self.warnings)

    def _instruction_for_aggression(self) -> str:
        """Return the aggression prompt instruction for the current band."""

        band = self.band_for(self.aggression)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return "Prefer gentle, de-escalating language and avoid combative framing."
            case MetricBand.RESTRAINED:
                return "Keep conflict controlled and measured, with little verbal heat."
            case MetricBand.BALANCED:
                return "Balance tension with restraint so the prose stays energetic but composed."
            case MetricBand.ELEVATED:
                return (
                    "Use assertive, confrontational phrasing "
                    "while staying coherent and intentional."
                )
            case MetricBand.DOMINANT:
                return (
                    "Make the narration forceful and high-pressure "
                    "without becoming incoherent ."
                )
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _negative_for_aggression(self) -> str:
        """Return the aggression negative constraint for the current band."""

        band = self.band_for(self.aggression)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return "Do not introduce combative framing, raised voices, or confrontational subtext."
            case MetricBand.RESTRAINED:
                return "Do not let conflict escalate beyond measured tension or tip into confrontation."
            case MetricBand.BALANCED:
                return "Do not let the tone collapse into either pure passivity or unchecked aggression."
            case MetricBand.ELEVATED:
                return "Do not pull back from tension or resolve confrontations too cleanly."
            case MetricBand.DOMINANT:
                return "Do not let characters back down, soften conflict, or resolve tension peacefully."
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _instruction_for_reader_respect(self) -> str:
        """Return the reader-respect prompt instruction for the current band."""

        band = self.band_for(self.reader_respect)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return (
                    "Use an intentionally abrasive, dismissive stance."
                )
            case MetricBand.RESTRAINED:
                return "Keep explanations sparse and avoid over-accommodating the reader."
            case MetricBand.BALANCED:
                return (
                    "Treat the reader as capable without leaning into "
                    "either hand-holding or hostility."
                )
            case MetricBand.ELEVATED:
                return (
                    "Use clear, trustworthy phrasing that respects "
                    "the reader's attention and intelligence."
                )
            case MetricBand.DOMINANT:
                return (
                    "Assume an expert reader and maintain sharp, professional "
                    "clarity with no condescension."
                )
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _negative_for_reader_respect(self) -> str:
        """Return the reader-respect negative constraint for the current band."""

        band = self.band_for(self.reader_respect)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return "Do not soften abrasive language or add accommodating transitions for the reader's comfort."
            case MetricBand.RESTRAINED:
                return "Do not over-explain or provide hand-holding that isn't warranted."
            case MetricBand.BALANCED:
                return "Do not drift into either dismissive hostility or over-accommodating hand-holding."
            case MetricBand.ELEVATED:
                return "Do not condescend, simplify unnecessarily, or withhold context the reader needs."
            case MetricBand.DOMINANT:
                return "Do not explain what is already implied; trust the reader to follow without aid."
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _instruction_for_morality(self) -> str:
        """Return the morality prompt instruction for the current band."""

        band = self.band_for(self.morality)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return (
                    "Frame the world with minimal moral judgment "
                    "and allow ethically dark choices to stand."
                )
            case MetricBand.RESTRAINED:
                return "Keep ethics ambiguous and avoid overt moral commentary."
            case MetricBand.BALANCED:
                return (
                    "Allow ethical texture without forcing the story toward judgment or cynicism."
                )
            case MetricBand.ELEVATED:
                return (
                    "Signal a principled worldview while keeping "
                    "the prose narrative rather than preachy."
                )
            case MetricBand.DOMINANT:
                return (
                    "Make the story's moral stance explicit, but keep it "
                    "embedded in the narration and action."
                )
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _negative_for_morality(self) -> str:
        """Return the morality negative constraint for the current band."""

        band = self.band_for(self.morality)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return "Do not insert moral lessons, redemption arcs, or ethical commentary."
            case MetricBand.RESTRAINED:
                return "Do not let a clear moral stance emerge or steer the story toward resolution."
            case MetricBand.BALANCED:
                return "Do not let the story become either nihilistically amoral or preachy."
            case MetricBand.ELEVATED:
                return "Do not portray the protagonist's moral convictions as naive or ineffective."
            case MetricBand.DOMINANT:
                return "Do not portray ethically ambiguous outcomes without moral weight or consequence."
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _instruction_for_source_fidelity(self) -> str:
        """Return the source-fidelity prompt instruction for the current band."""

        band = self.band_for(self.source_fidelity)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return (
                    "Use source tales only as loose inspiration; feel free to invent entirely new "
                    "plot lines, characters, and events that diverge from the originals."
                )
            case MetricBand.RESTRAINED:
                return (
                    "Borrow setting and character names from source tales but treat plot beats "
                    "as optional — significant invention is welcome."
                )
            case MetricBand.BALANCED:
                return (
                    "Maintain an even balance: preserve the most recognisable source-tale moments "
                    "while freely inventing connecting tissue and secondary scenes."
                )
            case MetricBand.ELEVATED:
                return (
                    "Follow the source tales' key plot beats closely; only deviate where vibe "
                    "calibration demands a tonal shift, and keep all named characters present."
                )
            case MetricBand.DOMINANT:
                return (
                    "Stay as close as possible to the canonical facts and sequence of the source "
                    "tales; rewrite only the tone and framing, not the story events."
                )
            case _:
                raise ValueError(f"Unhandled band: {band}")

    def _negative_for_source_fidelity(self) -> str:
        """Return the source-fidelity negative constraint for the current band."""

        band = self.band_for(self.source_fidelity)
        match band:
            case MetricBand.STRONGLY_MINIMIZED:
                return "Do not reproduce canonical plot beats — invent freely and diverge from the source."
            case MetricBand.RESTRAINED:
                return "Do not follow the source plot closely; significant invention is expected."
            case MetricBand.BALANCED:
                return "Do not stray so far from the source that recognisable moments vanish entirely."
            case MetricBand.ELEVATED:
                return "Do not invent new plot events or remove named characters from the story."
            case MetricBand.DOMINANT:
                return "Do not invent plot events, rename characters, or deviate from canonical scene order."
            case _:
                raise ValueError(f"Unhandled band: {band}")


class VibeSliderInput(BaseModel):
    """UI-facing slider payload using the 1-10 scale shown to end users."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    aggression: int = Field(ge=1, le=10, strict=True)
    reader_respect: int = Field(ge=1, le=10, strict=True)
    morality: int = Field(ge=1, le=10, strict=True)
    source_fidelity: int = Field(ge=1, le=10, strict=True)

    def to_normalized_metrics(self) -> VibeMetrics:
        """Convert integer slider values into the agent-facing 0.0-1.0 representation."""

        return VibeMetrics(
            aggression=round(self.aggression / 10, 4),
            reader_respect=round(self.reader_respect / 10, 4),
            morality=round(self.morality / 10, 4),
            source_fidelity=round(self.source_fidelity / 10, 4),
        )

    @classmethod
    def from_normalized_metrics(cls, metrics: VibeMetrics) -> Self:
        """Recreate the UI slider snapshot from normalized values stored in persistence."""

        return cls(
            aggression=max(1, min(10, round(metrics.aggression * 10))),
            reader_respect=max(1, min(10, round(metrics.reader_respect * 10))),
            morality=max(1, min(10, round(metrics.morality * 10))),
            source_fidelity=max(1, min(10, round(metrics.source_fidelity * 10))),
        )


class CalibrationProfile(BaseModel):
    """Stable calibration packet passed from request validation into orchestration."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    metrics: VibeMetrics
    directives: tuple[CalibrationDirective, ...]
    warnings: tuple[VibeMetricWarning, ...]
