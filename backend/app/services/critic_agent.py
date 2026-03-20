"""Chapter critic agent: evaluates a chapter draft for coherence and vibe alignment."""

from __future__ import annotations

import logging

from pydantic import BaseModel, ConfigDict, Field

from app.config import settings
from app.domain.long_form_contracts import ChapterCriticResult, ChapterOutline, LongFormRequest
from app.domain.vibe_models import CalibrationProfile
from app.services.model_factory import build_chat_model

logger = logging.getLogger(__name__)


# ── Internal schema for LangChain structured output ──────────────────────────

class _CriticOutput(BaseModel):
    model_config = ConfigDict(extra="ignore")

    passed: bool
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str
    suggestions: list[str] = Field(default_factory=list)


# ── Stub ─────────────────────────────────────────────────────────────────────

class LocalChapterCritic:
    """Deterministic critic for local development (no LLM calls)."""

    async def evaluate_chapter(
        self,
        draft: str,
        request: LongFormRequest,
        calibration: CalibrationProfile,
        chapter_outline: ChapterOutline,
        previous_summaries: list[str],
    ) -> ChapterCriticResult:
        passed = len(draft.strip()) >= 200
        if passed:
            return ChapterCriticResult(
                passed=True,
                confidence=0.78,
                summary="Chapter meets baseline length and calibration shape.",
                suggestions=(),
            )
        return ChapterCriticResult(
            passed=False,
            confidence=0.42,
            summary="Chapter is too short to assess tonal stability.",
            suggestions=("Expand the chapter with more narrative detail.",),
        )


# ── Production ────────────────────────────────────────────────────────────────

class StructuredChapterCritic:
    """Uses a judge model to evaluate chapter quality and narrative coherence."""

    async def evaluate_chapter(
        self,
        draft: str,
        request: LongFormRequest,
        calibration: CalibrationProfile,
        chapter_outline: ChapterOutline,
        previous_summaries: list[str],
    ) -> ChapterCriticResult:
        chat_model = build_chat_model(for_judge=True)
        structured = chat_model.with_structured_output(_CriticOutput)

        directive_lines = "\n".join(
            f"- {d.metric_name}: {d.instruction}" for d in calibration.directives
        )
        continuity_block = (
            "Previous chapters summary:\n" + "\n".join(f"  - {s}" for s in previous_summaries)
            if previous_summaries
            else "This is the opening chapter; no prior continuity to check."
        )

        prompt = (
            "You are LoreForge chapter critic. Evaluate the chapter draft "
            "against the vibe calibration and narrative continuity. Return structured JSON.\n\n"
            f"Chapter {chapter_outline.number}: {chapter_outline.title}\n"
            f"Expected arc: {chapter_outline.summary}\n\n"
            f"{continuity_block}\n\n"
            f"Vibe directives:\n{directive_lines}\n\n"
            f"Target normalized metrics:\n{calibration.metrics.model_dump_json(indent=2)}\n\n"
            "Chapter draft:\n"
            f"{draft}\n\n"
            "Return: passed (bool), confidence (0-1), summary (str), "
            "suggestions (list of plain-text improvement notes). "
            "Set passed=false if vibe is misaligned or narrative continuity breaks."
        )

        logger.info(
            "Critic agent: chapter=%d provider=%s model=%s",
            chapter_outline.number,
            settings.llm_provider,
            settings.llm_judge_model,
        )
        logger.debug("Critic prompt: chapter=%d %d chars", chapter_outline.number, len(prompt))
        result: _CriticOutput = await structured.ainvoke(prompt)  # type: ignore[assignment]
        logger.info(
            "Critic verdict: chapter=%d %s confidence=%.0f%% summary=%r",
            chapter_outline.number,
            "accepted" if result.passed else "rejected",
            result.confidence * 100,
            result.summary,
        )

        return ChapterCriticResult(
            passed=result.passed,
            confidence=result.confidence,
            summary=result.summary,
            suggestions=tuple(result.suggestions),
        )
