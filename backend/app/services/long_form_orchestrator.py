"""Long-form story orchestrator: outline → chapter write loop."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import AsyncIterator
from uuid import uuid4

from app.domain.long_form_contracts import (
    ChapterOutline,
    ChapterResult,
    LongFormRequest,
    LongFormResult,
)
from app.domain.vibe_models import CalibrationProfile
from app.services.contracts import LLMGateway, PromptEnvelope
from app.services.outline_agent import LocalOutlineAgent, StructuredOutlineAgent

logger = logging.getLogger(__name__)

# ── SSE event keys ────────────────────────────────────────────────────────────
_EV_STATUS           = "status"
_EV_OUTLINE          = "outline"
_EV_CHAPTER_START    = "chapter_start"
_EV_CHAPTER_TOKEN    = "chapter_token"
_EV_CHAPTER_COMPLETE = "chapter_complete"
_EV_COMPLETE         = "complete"
_EV_ERROR            = "error"
_EV_LOG              = "log"


def _evt(event: str, request_id: str, payload: dict) -> dict:
    """Minimal typed event envelope for SSE serialization."""
    return {"event": event, "request_id": request_id, "payload": payload}


def _log(request_id: str, from_agent: str, to_agent: str, message: str, level: str = "info") -> dict:
    """Build a log event recording an inter-agent interaction."""
    log_fn = logger.warning if level == "warning" else logger.error if level == "error" else logger.info
    log_fn("[Agent] %s → %s: %s", from_agent, to_agent, message)
    return _evt(_EV_LOG, request_id, {"from": from_agent, "to": to_agent, "message": message, "level": level})


def _band_for(directives: tuple, name: str) -> str:
    """Look up the band value for a named metric from a directives tuple."""
    return next(d.band for d in directives if d.metric_name == name)


def _build_chapter_prompt(
    request: LongFormRequest,
    chapter: ChapterOutline,
    previous_summaries: list[str],
    calibration: CalibrationProfile,
) -> PromptEnvelope:
    """Compose a chapter-writing prompt including continuity and vibe context."""

    lang = (request.context.language or "").strip().lower()
    lang_instruction = ""
    if lang in ("uk", "ua", "ukr", "ukraine"):
        lang_instruction = (
            "Output language requirement: Ukrainian only (Cyrillic). "
            "Do not switch to English."
        )
    elif lang in ("ru", "rus", "russian"):
        lang_instruction = (
            "Output language requirement: Russian only (Cyrillic). "
            "Do not switch to English."
        )
    elif lang in ("kk", "kaz", "kazakh"):
        lang_instruction = (
            "Output language requirement: Kazakh only (Cyrillic script). "
            "Do not switch to English or Russian."
        )
    elif lang.startswith("en"):
        lang_instruction = "Output language requirement: English only."

    directive_block = "\n".join(
        f"- {d.metric_name}: {d.instruction} | NOT: {d.negative_instruction}"
        for d in calibration.directives
    )

    system_prompt = (
        "You are LoreForge, a calibrated narrative model writing a long-form story "
        "one chapter at a time.\n\n"
        "Vibe directives — apply these throughout the chapter:\n"
        f"{directive_block}\n"
        + (f"\n{lang_instruction}\n" if lang_instruction else "")
        + "\nWrite only the chapter body — no headers, no preamble."
    )

    aggression_band = _band_for(calibration.directives, "aggression")
    morality_band = _band_for(calibration.directives, "morality")

    continuity_block = (
        "Previous chapters (for continuity):\n"
        + "\n".join(f"  Ch{i+1}: {s}" for i, s in enumerate(previous_summaries))
        + "\n\n"
        if previous_summaries
        else ""
    )

    user_prompt = (
        f"Tone: {aggression_band} aggression, {morality_band} morality — hold this throughout.\n\n"
        f"Story brief: {request.context.user_prompt}\n"
        f"Genre: {request.context.genre or 'unspecified'}\n\n"
        f"{continuity_block}"
        f"Chapter {chapter.number}: {chapter.title}\n"
        f"Chapter arc: {chapter.summary}\n"
        f"Target words: ~{chapter.word_target}\n\n"
        "Write the chapter now."
    )

    return PromptEnvelope(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        metadata={"chapter": chapter.number},
    )


class LongFormOrchestrator:
    """Coordinate outline → chapter write for long-form generation."""

    def __init__(
        self,
        llm_gateway: LLMGateway,
        outline_agent: LocalOutlineAgent | StructuredOutlineAgent,
    ) -> None:
        self._llm_gateway   = llm_gateway
        self._outline_agent = outline_agent

    async def stream(self, request: LongFormRequest) -> AsyncIterator[dict]:
        """Yield SSE-ready dicts for each pipeline stage."""

        request_id  = str(uuid4())
        calibration = request.calibration_profile()

        _pipeline_start = time.time()
        logger.info("Pipeline started: chapters=%d", request.chapter_count)

        # ── 1. Outline ────────────────────────────────────────────────────────
        yield _evt(_EV_STATUS, request_id, {"message": "generating_outline"})
        yield _log(request_id, "Orchestrator", "OutlineAgent", f"Generating outline for {request.chapter_count} chapters")

        try:
            outline = await self._outline_agent.generate_outline(request, calibration)
        except Exception as exc:
            logger.exception("Outline generation failed")
            yield _log(request_id, "OutlineAgent", "Orchestrator", f"Outline generation failed: {exc}", level="error")
            yield _evt(_EV_ERROR, request_id, {"error": "outline_failed", "detail": str(exc)})
            return

        # Trim/pad to requested chapter count
        outline = outline[: request.chapter_count]

        yield _log(request_id, "OutlineAgent", "Orchestrator", f"Outline ready: {len(outline)} chapters")
        yield _evt(_EV_OUTLINE, request_id, {
            "chapters": [c.model_dump() for c in outline],
        })

        # ── 2. Chapter loop ────────────────────────────────────────────────────
        completed: list[ChapterResult] = []
        previous_summaries: list[str] = []

        for chapter_outline in outline:
            _chapter_start = time.time()

            yield _evt(_EV_STATUS, request_id, {
                "message": f"writing_chapter_{chapter_outline.number}",
            })
            yield _evt(_EV_CHAPTER_START, request_id, {
                "number": chapter_outline.number,
                "title":  chapter_outline.title,
                "summary": chapter_outline.summary,
                "total_chapters": len(outline),
            })

            chapter_prompt = _build_chapter_prompt(
                request=request,
                chapter=chapter_outline,
                previous_summaries=previous_summaries,
                calibration=calibration,
            )

            yield _log(request_id, "Orchestrator", "LLM", f"Writing chapter {chapter_outline.number}: {chapter_outline.title}")
            chunks: list[str] = []
            try:
                async for chunk in self._llm_gateway.stream_text(
                    prompt=chapter_prompt,
                ):
                    chunks.append(chunk.text)
                    yield _evt(_EV_CHAPTER_TOKEN, request_id, {
                        "chapter": chapter_outline.number,
                        "text": chunk.text,
                    })
            except Exception as exc:
                logger.exception("Chapter %d write failed", chapter_outline.number)
                yield _log(request_id, "LLM", "Orchestrator", f"Chapter {chapter_outline.number} write failed: {exc}", level="error")
                yield _evt(_EV_ERROR, request_id, {
                    "error": "chapter_write_failed",
                    "chapter": chapter_outline.number,
                    "detail": str(exc),
                })
                return

            draft_text = "".join(chunks).strip()
            yield _log(
                request_id, "LLM", "Orchestrator",
                f"Chapter {chapter_outline.number} draft received "
                f"({len(draft_text)} chars, {time.time() - _chapter_start:.1f}s)"
            )

            chapter_result = ChapterResult(
                number=chapter_outline.number,
                title=chapter_outline.title,
                content=draft_text,
            )
            completed.append(chapter_result)
            previous_summaries.append(
                f"Chapter {chapter_outline.number} ({chapter_outline.title}): {chapter_outline.summary}"
            )

            yield _evt(_EV_CHAPTER_COMPLETE, request_id, {
                "number": chapter_outline.number,
                "title":  chapter_outline.title,
                "content": draft_text,
                "word_count": len(draft_text.split()),
            })

        # ── 3. Assemble & complete ────────────────────────────────────────────
        full_text = "\n\n".join(
            f"## {ch.title}\n\n{ch.content}" for ch in completed
        )
        total_words = len(re.findall(r"\S+", full_text))

        result = LongFormResult(
            story_id=request_id,
            public_title=request.context.public_title,
            chapters=tuple(completed),
            vibe_profile=request.vibe,
            normalized_vibe=calibration.metrics,
            total_words=total_words,
            full_text=full_text,
        )

        logger.info(
            "Pipeline complete: %d chapters in %.1fs",
            len(completed),
            time.time() - _pipeline_start,
        )

        yield _evt(_EV_COMPLETE, request_id, result.model_dump(mode="json"))
