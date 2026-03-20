"""Long-form story orchestrator: outline → chapter write → critic → redactor loop."""

from __future__ import annotations

import logging
import re
import time
from collections.abc import AsyncIterator
from uuid import uuid4

from app.domain.long_form_contracts import (
    ChapterCriticResult,
    ChapterOutline,
    ChapterResult,
    LongFormRequest,
    LongFormResult,
)
from app.services.contracts import LLMGateway, PromptEnvelope
from app.services.critic_agent import LocalChapterCritic, StructuredChapterCritic
from app.services.outline_agent import LocalOutlineAgent, StructuredOutlineAgent

logger = logging.getLogger(__name__)

# ── SSE event keys ────────────────────────────────────────────────────────────
_EV_STATUS           = "status"
_EV_OUTLINE          = "outline"
_EV_CHAPTER_START    = "chapter_start"
_EV_CHAPTER_TOKEN    = "chapter_token"
_EV_CHAPTER_REVISION = "chapter_revision"
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


def _build_chapter_prompt(
    request: LongFormRequest,
    chapter: ChapterOutline,
    previous_summaries: list[str],
    calibration_directive_lines: str,
    critic_result: ChapterCriticResult | None = None,
) -> PromptEnvelope:
    """Compose a chapter-writing prompt including continuity and vibe context."""

    lang = (request.context.language or "").strip().lower()
    lang_instruction = ""
    if lang in ("uk", "ua", "ukr", "ukraine"):
        lang_instruction = (
            "Output language requirement: Ukrainian only (Cyrillic). "
            "Do not switch to English.\n\n"
        )
    elif lang in ("ru", "rus", "russian"):
        lang_instruction = (
            "Output language requirement: Russian only (Cyrillic). "
            "Do not switch to English.\n\n"
        )
    elif lang in ("kk", "kaz", "kazakh"):
        lang_instruction = (
            "Output language requirement: Kazakh only (Cyrillic script). "
            "Do not switch to English or Russian.\n\n"
        )
    elif lang.startswith("en"):
        lang_instruction = "Output language requirement: English only.\n\n"

    continuity_block = (
        "Previous chapters (for continuity):\n"
        + "\n".join(f"  Ch{i+1}: {s}" for i, s in enumerate(previous_summaries))
        + "\n\n"
        if previous_summaries
        else ""
    )

    revision_block = ""
    if critic_result and not critic_result.passed:
        suggestions_text = "\n".join(f"  - {s}" for s in critic_result.suggestions)
        revision_block = (
            f"\nCritic feedback (revision #{critic_result.confidence:.0%} confidence):\n"
            f"  {critic_result.summary}\n"
            f"Revision instructions:\n{suggestions_text}\n\n"
            "Rewrite this chapter addressing the feedback above while preserving the chapter arc.\n"
        )

    system_prompt = (
        "You are LoreForge, a calibrated narrative model writing a long-form story "
        "one chapter at a time. "
        "Follow vibe directives precisely and maintain continuity with previous chapters. "
        "Write only the chapter body — no headers, no preamble."
        + (f" {lang_instruction.strip()}" if lang_instruction else "")
    )

    user_prompt = (
        f"{lang_instruction}"
        f"Story brief: {request.context.user_prompt}\n"
        f"Genre: {request.context.genre or 'unspecified'}\n\n"
        f"{continuity_block}"
        f"Chapter {chapter.number}: {chapter.title}\n"
        f"Chapter arc: {chapter.summary}\n"
        f"Target words: ~{chapter.word_target}\n\n"
        f"Vibe directives:\n{calibration_directive_lines}\n"
        f"{revision_block}"
        "Write the chapter now."
    )

    return PromptEnvelope(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        metadata={"chapter": chapter.number, "revision": critic_result is not None},
    )


class LongFormOrchestrator:
    """Coordinate outline → chapter write → critic → redactor for long-form generation."""

    def __init__(
        self,
        llm_gateway: LLMGateway,
        outline_agent: LocalOutlineAgent | StructuredOutlineAgent,
        critic_agent: LocalChapterCritic | StructuredChapterCritic,
    ) -> None:
        self._llm_gateway   = llm_gateway
        self._outline_agent = outline_agent
        self._critic_agent  = critic_agent

    async def stream(self, request: LongFormRequest) -> AsyncIterator[dict]:
        """Yield SSE-ready dicts for each pipeline stage."""

        request_id  = str(uuid4())
        calibration = request.calibration_profile()

        _pipeline_start = time.time()
        logger.info(
            "Pipeline started: chapters=%d critic=%s",
            request.chapter_count,
            request.enable_critic,
        )

        directive_lines = "\n".join(
            f"- {d.metric_name}: {d.instruction}" for d in calibration.directives
        )

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

            critic_result: ChapterCriticResult | None = None
            revision_count = 0
            draft_text = ""

            while True:
                # Build prompt (first pass or revision)
                chapter_prompt = _build_chapter_prompt(
                    request=request,
                    chapter=chapter_outline,
                    previous_summaries=previous_summaries,
                    calibration_directive_lines=directive_lines,
                    critic_result=critic_result,
                )

                # Stream chapter prose
                action = "Writing" if critic_result is None else f"Revising (attempt {revision_count + 1})"
                yield _log(request_id, "Orchestrator", "LLM", f"{action} chapter {chapter_outline.number}: {chapter_outline.title}")
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

                # Critic evaluation (skipped when enable_critic is False)
                if not request.enable_critic:
                    logger.info("Critic disabled — accepting chapter %d as-is", chapter_outline.number)
                    yield _log(request_id, "Orchestrator", "Critic", f"Critic disabled — accepting chapter {chapter_outline.number} as-is")
                    break

                yield _log(request_id, "Orchestrator", "Critic", f"Evaluating chapter {chapter_outline.number} quality")
                try:
                    critic_result = await self._critic_agent.evaluate_chapter(
                        draft=draft_text,
                        request=request,
                        calibration=calibration,
                        chapter_outline=chapter_outline,
                        previous_summaries=previous_summaries,
                    )
                except Exception as exc:
                    logger.warning("Critic failed for chapter %d: %s", chapter_outline.number, exc)
                    yield _log(request_id, "Critic", "Orchestrator", f"Critic failed for chapter {chapter_outline.number}, treating as accepted: {exc}", level="warning")
                    # Treat critic failure as a pass to avoid blocking pipeline
                    break

                yield _log(
                    request_id, "Critic", "Orchestrator",
                    f"Chapter {chapter_outline.number} {'accepted' if critic_result.passed else 'rejected'} — {critic_result.summary} (confidence {critic_result.confidence:.0%})",
                    level="info" if critic_result.passed else "warning",
                )

                # Chief redactor decision
                if critic_result.passed:
                    break
                if revision_count >= request.revision_limit:
                    logger.warning(
                        "Max revisions reached for chapter %d (limit=%d), accepting current draft",
                        chapter_outline.number,
                        request.revision_limit,
                    )
                    break

                revision_count += 1
                yield _evt(_EV_CHAPTER_REVISION, request_id, {
                    "chapter": chapter_outline.number,
                    "attempt": revision_count,
                    "critic_summary": critic_result.summary,
                    "suggestions": list(critic_result.suggestions),
                })

            chapter_result = ChapterResult(
                number=chapter_outline.number,
                title=chapter_outline.title,
                content=draft_text,
                revision_count=revision_count,
                accepted=critic_result.passed if critic_result else True,
                critic_summary=critic_result.summary if critic_result else "",
            )
            completed.append(chapter_result)
            previous_summaries.append(
                f"Chapter {chapter_outline.number} ({chapter_outline.title}): "
                + (critic_result.summary if critic_result else chapter_outline.summary)
            )

            yield _evt(_EV_CHAPTER_COMPLETE, request_id, {
                "number": chapter_outline.number,
                "title":  chapter_outline.title,
                "content": draft_text,
                "revision_count": revision_count,
                "accepted": chapter_result.accepted,
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
