"""Tests for StructuredOutlineAgent prompt structure (system/user split, directives, bug fixes)."""

from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

from app.domain.long_form_contracts import LongFormRequest
from app.services.outline_agent import StructuredOutlineAgent, _ChapterSpec, _OutlineSpec


def _make_request(language: str | None = None) -> LongFormRequest:
    ctx: dict = {
        "user_prompt": "A hero crosses a desert.",
        "genre": "fantasy",
        "audience": "adult",
        "continuity_notes": [],
    }
    if language:
        ctx["language"] = language
    return LongFormRequest.model_validate({
        "context": ctx,
        "vibe": {"aggression": 9, "reader_respect": 3, "morality": 2, "source_fidelity": 8},
        "chapter_count": 2,
        "chapter_word_target": 400,
        "stream": True,
    })


def _run_outline_agent(request: LongFormRequest) -> list:
    """Return the messages list captured from ainvoke."""
    captured: list = []
    fake_result = _OutlineSpec(chapters=[
        _ChapterSpec(number=1, title="Ch1", summary="Opens.", word_target=400),
        _ChapterSpec(number=2, title="Ch2", summary="Closes.", word_target=400),
    ])

    async def _fake_ainvoke(messages):
        captured.append(messages)
        return fake_result

    mock_chain = MagicMock()
    mock_chain.ainvoke = _fake_ainvoke
    mock_model = MagicMock()
    mock_model.with_structured_output.return_value = mock_chain

    with patch("app.services.outline_agent.build_chat_model", return_value=mock_model):
        agent = StructuredOutlineAgent()
        calibration = request.calibration_profile()
        asyncio.run(agent.generate_outline(request, calibration))

    return captured[0]


def test_outline_prompt_is_two_messages() -> None:
    """ainvoke must receive a two-element message list, not a plain string."""
    messages = _run_outline_agent(_make_request())
    assert len(messages) == 2, f"Expected 2 messages, got {len(messages)}"


def test_outline_system_message_contains_directives_with_not() -> None:
    """System message must contain vibe directives formatted with '| NOT:'."""
    messages = _run_outline_agent(_make_request())
    assert "| NOT:" in messages[0].content


def test_outline_system_message_contains_all_four_metrics() -> None:
    """System message must mention all four metric names."""
    content = _run_outline_agent(_make_request())[0].content
    for metric in ("aggression", "reader_respect", "morality", "source_fidelity"):
        assert metric in content, f"Missing metric '{metric}' in system message"


def test_outline_user_message_contains_story_brief() -> None:
    """User message must contain the story brief."""
    messages = _run_outline_agent(_make_request())
    assert "A hero crosses a desert." in messages[1].content


def test_outline_user_message_word_target_has_newline() -> None:
    """Bug fix: word target line must end with newline, not literal 'n'."""
    messages = _run_outline_agent(_make_request())
    assert "~400\n" in messages[1].content
    assert "~400n" not in messages[1].content


def test_outline_user_message_json_fields_present() -> None:
    """User message must list all required JSON output fields."""
    content = _run_outline_agent(_make_request())[1].content
    for field in ("number", "title", "summary", "word_target"):
        assert field in content, f"Missing JSON field '{field}' in user message"


def test_outline_language_instruction_in_system_when_set() -> None:
    """Language constraint must appear in the system message when language is set."""
    messages = _run_outline_agent(_make_request(language="uk"))
    assert "Ukrainian" in messages[0].content
