"""Outline agent: generates a structured chapter plan from a story brief."""

from __future__ import annotations

import logging

from pydantic import BaseModel, ConfigDict

from app.domain.long_form_contracts import ChapterOutline, LongFormRequest
from app.domain.vibe_models import CalibrationProfile
from app.services.model_factory import build_chat_model

logger = logging.getLogger(__name__)


# ── Internal schema for LangChain structured output ──────────────────────────

class _ChapterSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")

    number: int
    title: str
    summary: str
    word_target: int = 400


class _OutlineSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")

    chapters: list[_ChapterSpec]


# ── Stub (no LLM required) ───────────────────────────────────────────────────

class LocalOutlineAgent:
    """Deterministic outline used when USE_STUB_LLM=true."""

    async def generate_outline(
        self,
        request: LongFormRequest,
        calibration: CalibrationProfile,
    ) -> list[ChapterOutline]:
        titles = [
            "The First Signal",
            "Fractures",
            "Into the Dark",
            "Resolution",
            "Aftermath",
            "Echoes",
            "The Last Word",
            "Epilogue",
            "Coda",
            "Final Chapter",
        ]
        count = min(request.chapter_count, len(titles))
        return [
            ChapterOutline(
                number=i + 1,
                title=titles[i],
                summary=f"Chapter {i + 1}: The narrative unfolds with calibrated tension.",
                word_target=request.chapter_word_target,
            )
            for i in range(count)
        ]


# ── Production (LangChain structured output) ─────────────────────────────────

class StructuredOutlineAgent:
    """Uses the generation model to produce a typed chapter plan."""

    async def generate_outline(
        self,
        request: LongFormRequest,
        calibration: CalibrationProfile,
    ) -> list[ChapterOutline]:
        chat_model = build_chat_model(request.provider, for_judge=False)
        structured = chat_model.with_structured_output(_OutlineSpec)

        directive_lines = "\n".join(
            f"- {d.metric_name}: {d.instruction}" for d in calibration.directives
        )
        genre = request.context.genre or "unspecified"

        prompt = (
            "You are LoreForge outline architect. Generate a structured chapter plan.\n\n"
            f"Story brief: {request.context.user_prompt}\n"
            f"Genre: {genre}\n"
            f"Public title: {request.context.public_title or 'untitled'}\n"
            f"Chapters requested: {request.chapter_count}\n"
            f"Target words per chapter: ~{request.chapter_word_target}\n\n"
            f"Vibe directives:\n{directive_lines}\n\n"
            "Return a JSON object with a 'chapters' array. Each entry must have:\n"
            "  number (int, starting at 1), title (str), "
            "summary (str, 1-2 sentences describing the chapter arc), "
            "word_target (int).\n"
            "Ensure chapters form a coherent narrative arc from opening to resolution."
        )

        logger.debug("Outline prompt provider=%s", request.provider.provider)
        result: _OutlineSpec = await structured.ainvoke(prompt)  # type: ignore[assignment]

        chapters = sorted(result.chapters, key=lambda c: c.number)
        return [
            ChapterOutline(
                number=spec.number,
                title=spec.title,
                summary=spec.summary,
                word_target=max(100, spec.word_target),
            )
            for spec in chapters
        ]
