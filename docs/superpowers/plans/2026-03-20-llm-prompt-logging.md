# LLM Prompt Logging Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log full system and user prompts at DEBUG level in `HybridLangChainGateway` so developers can inspect what is sent to the LLM.

**Architecture:** Add two `logger.debug` calls to `HybridLangChainGateway` — one in `stream_text` before `astream`, one in `generate_text` before `ainvoke`. No new config, no new abstractions. Controlled entirely by `LOG_LEVEL=DEBUG`.

**Tech Stack:** Python 3.12, FastAPI, LangChain, pytest with `caplog` fixture.

---

### Task 1: Add prompt logging to `HybridLangChainGateway`

**Files:**
- Modify: `backend/app/services/provider_gateway.py`
- Test: `backend/tests/test_provider_gateway_prompt_logging.py`

**Spec:** `docs/superpowers/specs/2026-03-20-llm-prompt-logging-design.md`

---

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_provider_gateway_prompt_logging.py`:

```python
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
            chunks = [c async for c in gw.stream_text(prompt)]

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


async def _async_iter(items: list):
    for item in items:
        yield item
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /home/mikha/projects/story-mixer
.venv/bin/pytest backend/tests/test_provider_gateway_prompt_logging.py -v
```

Expected: 4 tests FAIL (no prompt logging exists yet).

- [ ] **Step 3: Add prompt logging to `stream_text`**

In `backend/app/services/provider_gateway.py`, inside `HybridLangChainGateway.stream_text`, add this block after the existing metadata `logger.debug` call (provider/model/char-count) and before `chat_model = build_chat_model()`:

```python
logger.debug(
    "stream_text prompt\n--- system ---\n%s\n--- user ---\n%s",
    prompt.system_prompt,
    prompt.user_prompt,
)
```

- [ ] **Step 4: Add prompt logging to `generate_text`**

In the same file, inside `HybridLangChainGateway.generate_text`, add the same block after the existing metadata `logger.debug` call and before `chat_model = build_chat_model()`:

```python
logger.debug(
    "generate_text prompt\n--- system ---\n%s\n--- user ---\n%s",
    prompt.system_prompt,
    prompt.user_prompt,
)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /home/mikha/projects/story-mixer
.venv/bin/pytest backend/tests/test_provider_gateway_prompt_logging.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
cd /home/mikha/projects/story-mixer
make test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/provider_gateway.py \
        backend/tests/test_provider_gateway_prompt_logging.py
git commit -m "feat: log full LLM prompts at DEBUG level in HybridLangChainGateway"
```

---

## Manual Verification

To see prompt logs in action during local dev:

```bash
cd backend
LOG_LEVEL=DEBUG USE_STUB_LLM=false \
  DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
  ../.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Trigger a story generation request. You will see log lines like:

```
DEBUG [app.services.provider_gateway] stream_text prompt
--- system ---
You are a calibrated narrator...
--- user ---
Write chapter one...
```
