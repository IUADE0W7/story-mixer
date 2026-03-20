"""Domain contracts for long-form multi-agent story generation."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.story_contracts import StoryContext
from app.domain.vibe_models import CalibrationProfile, VibeMetrics, VibeSliderInput


class ChapterOutline(BaseModel):
    """Specification for a single chapter produced by the outline agent."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=1_000)
    word_target: int = Field(default=400, ge=50, le=2_000)


class LongFormRequest(BaseModel):
    """API request contract for the multi-agent long-form generation pipeline."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    context: StoryContext
    vibe: VibeSliderInput
    chapter_count: int = Field(default=4, ge=2, le=10)
    chapter_word_target: int = Field(default=400, ge=100, le=2_000)
    revision_limit: int = Field(default=2, ge=1, le=3)
    enable_critic: bool = True
    stream: bool = True

    def normalized_vibe(self) -> VibeMetrics:
        return self.vibe.to_normalized_metrics()

    def calibration_profile(self) -> CalibrationProfile:
        return self.normalized_vibe().to_calibration_profile()


class ChapterCriticResult(BaseModel):
    """Structured critique produced by the chapter critic agent."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    passed: bool
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str = Field(min_length=1)
    suggestions: tuple[str, ...] = Field(default_factory=tuple)


class ChapterResult(BaseModel):
    """Final accepted chapter after writer + critic + redactor loop."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    number: int = Field(ge=1)
    title: str
    content: str = Field(min_length=1)
    revision_count: int = Field(default=0, ge=0)
    accepted: bool = True
    critic_summary: str = ""


class LongFormResult(BaseModel):
    """Final assembled manuscript returned after all chapters are complete."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    story_id: str
    public_title: str | None = None
    chapters: tuple[ChapterResult, ...]
    vibe_profile: VibeSliderInput
    normalized_vibe: VibeMetrics
    total_words: int = Field(ge=0)
    full_text: str = Field(min_length=1)
