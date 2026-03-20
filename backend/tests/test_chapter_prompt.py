"""Tests for _build_chapter_prompt: directive placement, vibe recap, language deduplication."""

from __future__ import annotations

from app.domain.long_form_contracts import ChapterOutline, LongFormRequest
from app.domain.vibe_models import CalibrationProfile, VibeMetrics
from app.services.long_form_orchestrator import _build_chapter_prompt


def _make_calibration(
    aggression: float = 0.9,
    reader_respect: float = 0.7,
    morality: float = 0.9,
    source_fidelity: float = 0.5,
) -> CalibrationProfile:
    return VibeMetrics(
        aggression=aggression,
        reader_respect=reader_respect,
        morality=morality,
        source_fidelity=source_fidelity,
    ).to_calibration_profile()


def _make_chapter() -> ChapterOutline:
    return ChapterOutline(
        number=1, title="The Crossing",
        summary="A tense border crossing.", word_target=400,
    )


def _make_request(language: str | None = None) -> LongFormRequest:
    ctx: dict = {
        "user_prompt": "A spy in wartime.",
        "genre": "thriller",
        "audience": "adult",
        "continuity_notes": [],
    }
    if language:
        ctx["language"] = language
    return LongFormRequest.model_validate({
        "context": ctx,
        "vibe": {"aggression": 9, "reader_respect": 7, "morality": 9, "source_fidelity": 5},
        "chapter_count": 2,
        "chapter_word_target": 400,
        "stream": True,
    })


def test_chapter_system_prompt_contains_directives_with_not() -> None:
    """system_prompt must contain '| NOT:' formatted directives."""
    envelope = _build_chapter_prompt(
        request=_make_request(),
        chapter=_make_chapter(),
        previous_summaries=[],
        calibration=_make_calibration(),
    )
    assert "| NOT:" in envelope.system_prompt


def test_chapter_system_prompt_contains_all_four_metrics() -> None:
    """system_prompt must enumerate all four metric names."""
    system = _build_chapter_prompt(
        request=_make_request(),
        chapter=_make_chapter(),
        previous_summaries=[],
        calibration=_make_calibration(),
    ).system_prompt
    for metric in ("aggression", "reader_respect", "morality", "source_fidelity"):
        assert metric in system, f"Metric '{metric}' missing from system_prompt"


def test_chapter_user_prompt_starts_with_tone_recap() -> None:
    """user_prompt must begin with a 'Tone:' vibe recap line."""
    envelope = _build_chapter_prompt(
        request=_make_request(),
        chapter=_make_chapter(),
        previous_summaries=[],
        calibration=_make_calibration(aggression=0.9, morality=0.9),
    )
    assert envelope.user_prompt.startswith("Tone:")
    first_line = envelope.user_prompt.split("\n")[0]
    assert "dominant" in first_line


def test_chapter_user_prompt_contains_story_brief() -> None:
    """user_prompt must contain the story brief."""
    envelope = _build_chapter_prompt(
        request=_make_request(),
        chapter=_make_chapter(),
        previous_summaries=[],
        calibration=_make_calibration(),
    )
    assert "A spy in wartime." in envelope.user_prompt


def test_chapter_language_instruction_in_system_only() -> None:
    """Language constraint must appear in system_prompt and NOT in user_prompt."""
    envelope = _build_chapter_prompt(
        request=_make_request(language="uk"),
        chapter=_make_chapter(),
        previous_summaries=[],
        calibration=_make_calibration(),
    )
    assert "Ukrainian" in envelope.system_prompt
    assert "Ukrainian" not in envelope.user_prompt


def test_chapter_no_language_instruction_when_unset() -> None:
    """When language is not set, neither prompt should contain a language instruction."""
    envelope = _build_chapter_prompt(
        request=_make_request(),
        chapter=_make_chapter(),
        previous_summaries=[],
        calibration=_make_calibration(),
    )
    assert "Output language requirement" not in envelope.system_prompt
    assert "Output language requirement" not in envelope.user_prompt
