"""Tests that HybridLangChainGateway logs full prompts at DEBUG level."""
from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.contracts import CompletionChunk, PromptEnvelope
from app.services.provider_gateway import HybridLangChainGateway

_SYSTEM = "You are a calibrated narrator."
_USER = "Write chapter one."


def _make_prompt() -> PromptEnvelope:
    return PromptEnvelope(system_prompt=_SYSTEM, user_prompt=_USER)


def _make_chunk(text: str) -> MagicMock:
    chunk = MagicMock()
    chunk.content = text
    return chunk


@pytest.mark.asyncio
async def test_stream_text_logs_system_prompt(caplog: pytest.LogCaptureFixture) -> None:
    """stream_text emits a DEBUG record containing the full system prompt."""
    prompt = _make_prompt()
    mock_model = MagicMock()
    mock_model.astream = MagicMock(return_value=_async_iter([_make_chunk("hello")]))

    with patch("app.services.provider_gateway.build_chat_model", return_value=mock_model):
        with caplog.at_level(logging.DEBUG, logger="app.services.provider_gateway"):
            gw = HybridLangChainGateway()
            _ = [c async for c in gw.stream_text(prompt)]

    assert any(_SYSTEM in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_stream_text_logs_user_prompt(caplog: pytest.LogCaptureFixture) -> None:
    """stream_text emits a DEBUG record containing the full user prompt."""
    prompt = _make_prompt()
    mock_model = MagicMock()
    mock_model.astream = MagicMock(return_value=_async_iter([_make_chunk("hello")]))

    with patch("app.services.provider_gateway.build_chat_model", return_value=mock_model):
        with caplog.at_level(logging.DEBUG, logger="app.services.provider_gateway"):
            gw = HybridLangChainGateway()
            _ = [c async for c in gw.stream_text(prompt)]

    assert any(_USER in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_generate_text_logs_system_prompt(caplog: pytest.LogCaptureFixture) -> None:
    """generate_text emits a DEBUG record containing the full system prompt."""
    prompt = _make_prompt()
    mock_response = MagicMock()
    mock_response.content = "result"
    mock_model = MagicMock()
    mock_model.ainvoke = AsyncMock(return_value=mock_response)

    with patch("app.services.provider_gateway.build_chat_model", return_value=mock_model):
        with caplog.at_level(logging.DEBUG, logger="app.services.provider_gateway"):
            gw = HybridLangChainGateway()
            _ = await gw.generate_text(prompt)

    assert any(_SYSTEM in r.message for r in caplog.records)


@pytest.mark.asyncio
async def test_generate_text_logs_user_prompt(caplog: pytest.LogCaptureFixture) -> None:
    """generate_text emits a DEBUG record containing the full user prompt."""
    prompt = _make_prompt()
    mock_response = MagicMock()
    mock_response.content = "result"
    mock_model = MagicMock()
    mock_model.ainvoke = AsyncMock(return_value=mock_response)

    with patch("app.services.provider_gateway.build_chat_model", return_value=mock_model):
        with caplog.at_level(logging.DEBUG, logger="app.services.provider_gateway"):
            gw = HybridLangChainGateway()
            _ = await gw.generate_text(prompt)

    assert any(_USER in r.message for r in caplog.records)


async def _async_iter(items: list[MagicMock]) -> AsyncIterator[MagicMock]:
    for item in items:
        yield item
