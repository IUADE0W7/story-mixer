"""Outline agent: generates a structured chapter plan from a story brief."""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, ConfigDict

from app.config import settings
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
        chat_model = build_chat_model()
        structured = chat_model.with_structured_output(_OutlineSpec)

        directive_lines = "\n".join(
            f"- {d.metric_name}: {d.instruction} | NOT: {d.negative_instruction}"
            for d in calibration.directives
        )
        genre = request.context.genre or "unspecified"
        lang = (request.context.language or "").strip().lower()
        lang_instruction = ""
        if lang in ("uk", "ua", "ukr", "ukraine"):
            lang_instruction = "Output language requirement: Ukrainian only (Cyrillic). Do not switch to English.\n\n"
        elif lang in ("ru", "rus", "russian"):
            lang_instruction = "Output language requirement: Russian only (Cyrillic). Do not switch to English.\n\n"
        elif lang in ("kk", "kaz", "kazakh"):
            lang_instruction = "Output language requirement: Kazakh only (Cyrillic script). Do not switch to English or Russian.\n\n"

        system_content = (
            "You are LoreForge outline architect.\n\n"
            "Vibe directives — the outline structure must reflect these, not just the prose:\n"
            f"{directive_lines}\n\n"
            "Chapter arcs, turning points, and pacing must reflect the calibration above.\n"
            + (lang_instruction if lang_instruction else "")
        )

        user_content = (
            f"{lang_instruction}"
            f"Story brief: {request.context.user_prompt}\n"
            f"Genre: {genre}\n"
            f"Public title: {request.context.public_title or 'untitled'}\n"
            f"Chapters requested: {request.chapter_count}\n"
            f"Target words per chapter: ~{request.chapter_word_target}\n"
            "Return a JSON object with a 'chapters' array. Each entry must have:\n"
            "  number (int, starting at 1)\n"
            "  title (str)\n"
            "  summary (str, 1-2 sentences describing the chapter arc)\n"
            "  word_target (int)\n"
            "Ensure chapters form a coherent narrative arc from opening to resolution."
        )

        messages = [SystemMessage(content=system_content), HumanMessage(content=user_content)]

        logger.info("Outline agent: provider=%s model=%s", settings.llm_provider, settings.llm_model)
        logger.debug("Outline prompt: %d chars", sum(len(m.content) for m in messages))
        result: _OutlineSpec = await structured.ainvoke(messages)  # type: ignore[assignment]
        logger.info("Outline response received: %d chapters parsed", len(result.chapters))

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
