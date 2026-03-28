"""Tests for sanitized SSE error handling in story generation."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from app.api.v1.stories import _stream_long_form_events


async def _failing_events() -> AsyncIterator[dict]:
    raise ValueError("provider stacktrace detail")
    yield {}


def test_stream_long_form_events_redacts_internal_error_details() -> None:
    async def _collect() -> list[str]:
        frames: list[str] = []
        async for frame in _stream_long_form_events(_failing_events()):
            frames.append(frame)
        return frames

    frames = asyncio.run(_collect())
    assert len(frames) == 1
    assert frames[0].startswith("event: error")

    payload_raw = frames[0].split("data: ", maxsplit=1)[1].strip()
    payload = json.loads(payload_raw)
    assert payload["error"] == "internal_server_error"
    assert payload["user_message"] == "Long-form story generation failed. Please retry."
    assert "detail" not in payload
