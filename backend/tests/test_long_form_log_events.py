"""Tests that LongFormOrchestrator.stream() emits LOG events at each agent boundary."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.domain.long_form_contracts import ChapterCriticResult, ChapterOutline, LongFormRequest
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


class _PassingCritic:
    """Accept every chapter draft immediately."""

    async def evaluate_chapter(
        self,
        draft: str,
        request: LongFormRequest,
        calibration: object,
        chapter_outline: ChapterOutline,
        previous_summaries: list[str],
    ) -> ChapterCriticResult:
        return ChapterCriticResult(
            passed=True,
            confidence=0.9,
            summary="Well written and on-tone.",
            suggestions=(),
        )


class _RejectFirstCritic:
    """Reject only the very first evaluation; accept all others."""

    def __init__(self) -> None:
        self._call_count = 0

    async def evaluate_chapter(
        self,
        draft: str,
        request: LongFormRequest,
        calibration: object,
        chapter_outline: ChapterOutline,
        previous_summaries: list[str],
    ) -> ChapterCriticResult:
        self._call_count += 1
        if self._call_count == 1:
            return ChapterCriticResult(
                passed=False,
                confidence=0.35,
                summary="Too sparse — expand the atmosphere.",
                suggestions=("Add sensory detail", "Slow the pacing"),
            )
        return ChapterCriticResult(
            passed=True,
            confidence=0.82,
            summary="Good revision.",
            suggestions=(),
        )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _make_request(chapter_count: int = 2, enable_critic: bool = True) -> LongFormRequest:
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
            "revision_limit": 2,
            "enable_critic": enable_critic,
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


def _make_orchestrator(critic=None) -> LongFormOrchestrator:
    return LongFormOrchestrator(
        llm_gateway=_LLMGateway(),
        outline_agent=_OutlineAgent(),
        critic_agent=critic or _PassingCritic(),
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


# ── Tests: critic stage ───────────────────────────────────────────────────────


def test_orchestrator_to_critic_log_emitted() -> None:
    """A LOG event from Orchestrator to Critic must appear after each chapter draft."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    orch_to_critic = [
        e for e in logs
        if e["payload"]["from"] == "Orchestrator" and e["payload"]["to"] == "Critic"
    ]
    assert len(orch_to_critic) >= 2


def test_critic_to_orchestrator_log_emitted() -> None:
    """A LOG event from Critic to Orchestrator must appear after each evaluation."""
    events = _collect(_make_orchestrator(), _make_request())
    logs = _logs(events)

    critic_to_orch = [
        e for e in logs
        if e["payload"]["from"] == "Critic" and e["payload"]["to"] == "Orchestrator"
    ]
    assert len(critic_to_orch) >= 2


def test_accepted_chapter_log_has_info_level() -> None:
    """Accepted chapter LOG events from Critic must have level 'info'."""
    events = _collect(_make_orchestrator(_PassingCritic()), _make_request())
    logs = _logs(events)

    critic_logs = [
        e for e in logs
        if e["payload"]["from"] == "Critic" and e["payload"]["to"] == "Orchestrator"
    ]
    assert len(critic_logs) >= 1
    assert all(e["payload"]["level"] == "info" for e in critic_logs)


def test_rejected_chapter_log_has_warning_level() -> None:
    """When the critic rejects a chapter, the LOG event level must be 'warning'."""
    events = _collect(_make_orchestrator(_RejectFirstCritic()), _make_request())
    logs = _logs(events)

    warning_logs = [
        e for e in logs
        if e["payload"]["from"] == "Critic" and e["payload"]["level"] == "warning"
    ]
    assert len(warning_logs) >= 1


# ── Tests: revision ───────────────────────────────────────────────────────────


def test_revision_emits_revision_log_from_orchestrator_to_llm() -> None:
    """When a chapter is rejected, a LOG event for the revision write must appear."""
    events = _collect(_make_orchestrator(_RejectFirstCritic()), _make_request())
    logs = _logs(events)

    revision_logs = [
        e for e in logs
        if e["payload"]["from"] == "Orchestrator"
        and e["payload"]["to"] == "LLM"
        and "revis" in e["payload"]["message"].lower()
    ]
    assert len(revision_logs) >= 1


def test_rejection_produces_more_logs_than_clean_run() -> None:
    """A run with a rejection must produce more LOG events than an all-pass run."""
    clean_events = _collect(_make_orchestrator(_PassingCritic()), _make_request())
    revised_events = _collect(_make_orchestrator(_RejectFirstCritic()), _make_request())

    assert len(_logs(revised_events)) > len(_logs(clean_events))


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


# ── Tests: critic disabled ────────────────────────────────────────────────────


def test_critic_disabled_emits_no_critic_evaluation_logs() -> None:
    """When enable_critic=False, no Orchestrator→Critic log events must appear."""
    events = _collect(_make_orchestrator(), _make_request(enable_critic=False))
    logs = _logs(events)

    orch_to_critic = [
        e for e in logs
        if e["payload"]["from"] == "Orchestrator" and e["payload"]["to"] == "Critic"
        and "disabled" not in e["payload"]["message"]
    ]
    assert len(orch_to_critic) == 0


def test_critic_disabled_emits_no_critic_response_logs() -> None:
    """When enable_critic=False, no Critic→Orchestrator log events must appear."""
    events = _collect(_make_orchestrator(), _make_request(enable_critic=False))
    logs = _logs(events)

    critic_to_orch = [
        e for e in logs
        if e["payload"]["from"] == "Critic" and e["payload"]["to"] == "Orchestrator"
    ]
    assert len(critic_to_orch) == 0


def test_critic_disabled_emits_disabled_log_per_chapter() -> None:
    """When enable_critic=False, a 'disabled' log must appear for each chapter."""
    request = _make_request(chapter_count=2, enable_critic=False)
    events = _collect(_make_orchestrator(), request)
    logs = _logs(events)

    disabled_logs = [
        e for e in logs
        if "disabled" in e["payload"]["message"].lower()
    ]
    assert len(disabled_logs) >= 2


def test_critic_disabled_still_produces_complete_event() -> None:
    """When enable_critic=False, the pipeline must still complete successfully."""
    events = _collect(_make_orchestrator(), _make_request(enable_critic=False))
    event_names = [e["event"] for e in events]
    assert "complete" in event_names


def test_critic_disabled_produces_fewer_logs_than_enabled() -> None:
    """Disabling the critic must produce fewer log events than with it enabled."""
    enabled_events  = _collect(_make_orchestrator(_PassingCritic()), _make_request(enable_critic=True))
    disabled_events = _collect(_make_orchestrator(_PassingCritic()), _make_request(enable_critic=False))
    assert len(_logs(disabled_events)) < len(_logs(enabled_events))
