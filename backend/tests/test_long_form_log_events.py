"""Tests that LongFormOrchestrator.stream() emits LOG events at each agent boundary."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.domain.long_form_contracts import ChapterOutline, LongFormRequest
from app.services.contracts import CompletionChunk, PromptEnvelope
from app.services.long_form_orchestrator import LongFormOrchestrator

_EV_LOG = "log"


# ── Stubs ─────────────────────────────────────────────────────────────────────


class _OutlineAgent:
    """Return a deterministic two-chapter outline."""

    async def generate_outline(
        self, request: LongFormRequest, calibration: object
    ) -> list[ChapterOutline]:
        return [
            ChapterOutline(
                number=1,
                title="The Crossing",
                summary="A traveller crosses the border under cover of night.",
                word_target=300,
            ),
            ChapterOutline(
                number=2,
                title="The Contact",
                summary="The traveller meets a handler in a crumbling safe house.",
                word_target=300,
            ),
        ]


class _LLMGateway:
    """Emit a short deterministic token stream for any chapter."""

    async def stream_text(
        self, prompt: PromptEnvelope
    ) -> AsyncIterator[CompletionChunk]:
        for token in ["She ", "moved ", "quickly."]:
            yield CompletionChunk(text=token)

    async def generate_text(self, prompt: PromptEnvelope) -> str:
        return "She moved quickly."


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_request(chapter_count: int = 2) -> LongFormRequest:
    return LongFormRequest.model_validate(
        {
            "context": {
                "user_prompt": "A spy crosses the border in wartime.",
                "genre": "thriller",
                "audience": "adult",
                "continuity_notes": [],
            },
            "vibe": {
                "aggression": 5,
                "reader_respect": 7,
                "morality": 4,
                "source_fidelity": 6,
            },
            "chapter_count": chapter_count,
            "chapter_word_target": 300,
            "stream": True,
        }
    )


def _collect(orchestrator: LongFormOrchestrator, request: LongFormRequest) -> list[dict]:
    async def _run() -> list[dict]:
        events: list[dict] = []
        async for event in orchestrator.stream(request):
            events.append(event)
        return events

    return asyncio.run(_run())


def _logs(events: list[dict]) -> list[dict]:
    return [e for e in events if e["event"] == _EV_LOG]


def _make_orchestrator() -> LongFormOrchestrator:
    return LongFormOrchestrator(
        llm_gateway=_LLMGateway(),
        outline_agent=_OutlineAgent(),
    )


# ── Tests: presence and shape ─────────────────────────────────────────────────


def test_stream_emits_at_least_one_log_event() -> None:
    """stream() must emit at least one LOG event."""
    events = _collect(_make_orchestrator(), _make_request())
    assert len(_logs(events)) > 0


def test_log_event_payload_has_required_keys() -> None:
    """Every LOG event payload must contain from, to, message, and level."""
    events = _collect(_make_orchestrator(), _make_request())
    for e in _logs(events):
        p = e["payload"]
        assert "from" in p, f"Missing 'from': {p}"
        assert "to" in p, f"Missing 'to': {p}"
        assert "message" in p, f"Missing 'message': {p}"
        assert "level" in p, f"Missing 'level': {p}"


def test_log_event_level_is_valid() -> None:
    """level must be one of 'info', 'warning', or 'error'."""
    events = _collect(_make_orchestrator(), _make_request())
    valid = {"info", "warning", "error"}
    for e in _logs(events):
        assert e["payload"]["level"] in valid


# ── Tests: outline stage ──────────────────────────────────────────────────────


def test_orchestrator_to_outline_agent_log_emitted() -> None:
    """A LOG event from Orchestrator to OutlineAgent must appear before the outline event."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    orch_to_outline = [
        e for e in logs
        if e["payload"]["from"] == "Orchestrator" and e["payload"]["to"] == "OutlineAgent"
    ]
    assert len(orch_to_outline) >= 1

    # Must precede the "outline" SSE event
    event_names = [e["event"] for e in events]
    outline_idx = next((i for i, n in enumerate(event_names) if n == "outline"), None)
    first_log_idx = next((i for i, e in enumerate(events) if e in orch_to_outline), None)
    assert first_log_idx is not None
    if outline_idx is not None:
        assert first_log_idx < outline_idx


def test_outline_agent_to_orchestrator_log_emitted() -> None:
    """A LOG event from OutlineAgent back to Orchestrator must appear after outline generation."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    outline_to_orch = [
        e for e in logs
        if e["payload"]["from"] == "OutlineAgent" and e["payload"]["to"] == "Orchestrator"
    ]
    assert len(outline_to_orch) >= 1


def test_outline_log_mentions_chapter_count() -> None:
    """The OutlineAgent → Orchestrator log message must mention the chapter count."""
    events = _collect(_make_orchestrator(), _make_request(chapter_count=2))
    logs = _logs(events)

    outline_to_orch = [
        e for e in logs
        if e["payload"]["from"] == "OutlineAgent" and e["payload"]["to"] == "Orchestrator"
    ]
    assert len(outline_to_orch) >= 1
    assert any("2 chapters" in e["payload"]["message"] for e in outline_to_orch)


# ── Tests: chapter writing ────────────────────────────────────────────────────


def test_orchestrator_to_llm_chapter_log_emitted() -> None:
    """A LOG event from Orchestrator to LLM must appear before each chapter is written."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    orch_to_llm = [
        e for e in logs
        if e["payload"]["from"] == "Orchestrator" and e["payload"]["to"] == "LLM"
    ]
    # Two chapters → at least two write logs
    assert len(orch_to_llm) >= 2


def test_chapter_write_log_mentions_title() -> None:
    """Each Orchestrator → LLM log for chapter writing must mention the chapter title."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    write_logs = [
        e for e in logs
        if e["payload"]["from"] == "Orchestrator" and e["payload"]["to"] == "LLM"
    ]
    titles_mentioned = [
        e for e in write_logs
        if "the crossing" in e["payload"]["message"].lower()
        or "the contact" in e["payload"]["message"].lower()
    ]
    assert len(titles_mentioned) >= 1


def test_llm_to_orchestrator_chapter_draft_log_emitted() -> None:
    """A LOG event from LLM to Orchestrator must appear after each chapter draft is received."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    llm_to_orch = [
        e for e in logs
        if e["payload"]["from"] == "LLM" and e["payload"]["to"] == "Orchestrator"
    ]
    assert len(llm_to_orch) >= 2
    assert any("chars" in e["payload"]["message"].lower() for e in llm_to_orch)


# ── Tests: ordering ───────────────────────────────────────────────────────────


def test_all_log_events_precede_complete_event() -> None:
    """Every LOG event must appear strictly before the final 'complete' event."""
    events = _collect(_make_orchestrator(), _make_request())
    event_names = [e["event"] for e in events]
    complete_idx = next((i for i, n in enumerate(event_names) if n == "complete"), None)
    assert complete_idx is not None

    log_indices = [i for i, n in enumerate(event_names) if n == _EV_LOG]
    assert all(i < complete_idx for i in log_indices)


def test_outline_log_precedes_chapter_logs() -> None:
    """Outline-stage LOG events must appear before any chapter-write LOG events."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    outline_indices = [
        i for i, e in enumerate(logs)
        if e["payload"].get("to") == "OutlineAgent" or e["payload"].get("from") == "OutlineAgent"
    ]
    chapter_write_indices = [
        i for i, e in enumerate(logs)
        if e["payload"].get("from") == "Orchestrator" and e["payload"].get("to") == "LLM"
    ]
    if outline_indices and chapter_write_indices:
        assert max(outline_indices) < min(chapter_write_indices)
