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
    word_target: int = Field(default=400, ge=50, le=500)


class LongFormRequest(BaseModel):
    """API request contract for the multi-agent long-form generation pipeline."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    context: StoryContext
    vibe: VibeSliderInput
    chapter_count: int = Field(default=4, ge=2, le=4)
    chapter_word_target: int = Field(default=400, ge=100, le=500)
    stream: bool = True

    def normalized_vibe(self) -> VibeMetrics:
        return self.vibe.to_normalized_metrics()

    def calibration_profile(self) -> CalibrationProfile:
        return self.normalized_vibe().to_calibration_profile()


class ChapterResult(BaseModel):
    """Final accepted chapter after the writer loop."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    number: int = Field(ge=1)
    title: str
    content: str = Field(min_length=1)


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
