# Backend Logging Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover all backend layers with terminal-readable logs including `[req=<id>]` correlation on every line.

**Architecture:** A new `app/logging_context.py` module holds a `ContextVar[str]` for the request ID and a `logging.Filter` that stamps every log record automatically. The HTTP middleware sets the ID per-request (with try/finally reset). All downstream services — agents, gateway, persistence, auth — log via module-level loggers and pick up the ID automatically through the filter.

**Tech Stack:** Python 3.12, stdlib `logging`, `contextvars.ContextVar`, FastAPI middleware.

---

## Notes on spec vs. reality

- **Story record create/update logs:** The spec lists these in the persistence table. In the current codebase, long-form story generation produces a `LongFormResult` but does not persist a `StoryRecord` to the database — no INSERT/UPDATE happens. Those spec rows are N/A until persistence is added. The plan covers only what actually runs: session lifecycle logs.
- **"Critic disabled" attribution:** The spec attributes this log to `critic_agent.py`, but the code handles it in `long_form_orchestrator.py` (line 222). The existing `_log()` call there already calls `logger.info()`. Task 8 adds an explicit `logger.info()` alongside the `_log()` call for full Python log record coverage.
- **Pre-existing error/warning logs (no plan action needed):** The following spec rows are already implemented in the current codebase and do not require plan tasks:
  - "Outline generation failed" (ERROR): `logger.exception("Outline generation failed")` at orchestrator line 152.
  - "Chapter write failed" (ERROR): `logger.exception("Chapter %d write failed", ...)` at orchestrator line 208.
  - "Critic call failed — falling back to accept" (WARNING): `logger.warning("Critic failed for chapter %d: %s", ...)` at orchestrator line 235. The critic agent does not catch exceptions itself — they propagate to the orchestrator which logs them there.

---

## File Map

| Action | File |
|--------|------|
| **Create** | `backend/app/logging_context.py` |
| **Create** | `backend/tests/test_logging_context.py` |
| **Modify** | `backend/app/main.py` |
| **Modify** | `backend/app/api/deps.py` |
| **Modify** | `backend/app/api/v1/stories.py` |
| **Modify** | `backend/app/services/outline_agent.py` |
| **Modify** | `backend/app/services/critic_agent.py` |
| **Modify** | `backend/app/services/provider_gateway.py` |
| **Modify** | `backend/app/services/long_form_orchestrator.py` |
| **Modify** | `backend/app/persistence/db.py` |

---

## Task 1: Create `app/logging_context.py`

**Files:**
- Create: `backend/app/logging_context.py`
- Create: `backend/tests/test_logging_context.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_logging_context.py
"""Unit tests for request-ID context propagation."""
import logging

from app.logging_context import (
    RequestIdFilter,
    get_request_id,
    reset_request_id,
    set_request_id,
)


def test_default_is_dash():
    assert get_request_id() == "-"


def test_set_and_get():
    token = set_request_id("abc123")
    assert get_request_id() == "abc123"
    reset_request_id(token)


def test_reset_restores_previous():
    token = set_request_id("abc123")
    assert get_request_id() == "abc123"
    reset_request_id(token)
    assert get_request_id() == "-"


def test_nested_contexts_restore_outer():
    token1 = set_request_id("outer")
    token2 = set_request_id("inner")
    assert get_request_id() == "inner"
    reset_request_id(token2)
    assert get_request_id() == "outer"
    reset_request_id(token1)


def test_filter_stamps_req_id():
    token = set_request_id("test-req-id")
    record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
    f = RequestIdFilter()
    f.filter(record)
    assert record.req_id == "test-req-id"
    reset_request_id(token)


def test_filter_stamps_default_when_not_set():
    record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
    f = RequestIdFilter()
    f.filter(record)
    assert record.req_id == "-"


def test_filter_always_returns_true():
    record = logging.LogRecord("test", logging.INFO, "", 0, "msg", (), None)
    f = RequestIdFilter()
    assert f.filter(record) is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && ../.venv/bin/pytest tests/test_logging_context.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.logging_context'`

- [ ] **Step 3: Create the module**

```python
# backend/app/logging_context.py
"""Request-scoped logging context via ContextVar.

Usage in middleware:
    token = set_request_id(req_id)
    try:
        ...
    finally:
        reset_request_id(token)
"""
from __future__ import annotations

import logging
from contextvars import ContextVar, Token

_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def set_request_id(value: str) -> Token:
    """Store request ID in the current async context. Returns a reset token."""
    return _request_id.set(value)


def reset_request_id(token: Token) -> None:
    """Restore the previous request ID using the token from set_request_id."""
    _request_id.reset(token)


def get_request_id() -> str:
    """Return the current request ID, or '-' if not set."""
    return _request_id.get()


class RequestIdFilter(logging.Filter):
    """Inject req_id into every log record that passes through a handler."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.req_id = _request_id.get()
        return True
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && ../.venv/bin/pytest tests/test_logging_context.py -v
```

Expected: 7 tests PASSED

- [ ] **Step 5: Commit**

```bash
git add backend/app/logging_context.py backend/tests/test_logging_context.py
git commit -m "feat: add logging_context module with ContextVar request-ID propagation"
```

---

## Task 2: Update `app/main.py`

Three changes: (a) update `_configure_logging()` to attach the filter + new format to all handlers and suppress uvicorn.access, (b) extend `_log_requests` middleware with request ID, (c) update lifespan startup logs.

**Files:**
- Modify: `backend/app/main.py`

**Current file structure for reference:**
- Imports: lines 1–19
- `lifespan()`: lines 22–36
- `create_app()`: lines 39–81 (including `_log_requests` at lines 57–78)
- `_configure_logging()`: lines 84–119
- Module-level calls: lines 121–123

### 2a — Add imports

At the top of the file, add `uuid` to the stdlib imports and import from the new module. The existing imports include `logging`, `os`, `sys`, `time`. Add:

```python
import uuid

from app.logging_context import RequestIdFilter, reset_request_id, set_request_id
```

### 2b — Replace `_configure_logging()`

Replace the entire function (lines 84–119) with the version below. Key changes: new format with `%(req_id)s`, a `_make_handler()` factory that attaches `RequestIdFilter`, suppression of `uvicorn.access`.

> **Note:** The existing code adds dedicated handlers to named `app.*` loggers AND keeps `propagate = True`, which would cause duplicate lines. The replacement preserves that structure (to avoid breaking existing tests) but the underlying issue is pre-existing.

```python
def _configure_logging() -> None:
    """Configure root and uvicorn logging to write to stdout with request-ID context."""

    level_name = (
        getattr(settings, "log_level", None) or os.getenv("LOG_LEVEL") or "INFO"
    ).upper()
    root_level = getattr(logging, level_name, logging.INFO)

    fmt = "%(asctime)s %(levelname)-8s [%(name)s] [req=%(req_id)s] %(message)s"

    def _make_handler() -> logging.StreamHandler:
        h = logging.StreamHandler(stream=sys.stdout)
        h.setFormatter(logging.Formatter(fmt))
        h.addFilter(RequestIdFilter())
        return h

    root_logger = logging.getLogger()
    if not root_logger.handlers:
        root_logger.addHandler(_make_handler())
    else:
        for h in root_logger.handlers:
            if not any(isinstance(f, RequestIdFilter) for f in h.filters):
                h.addFilter(RequestIdFilter())
                h.setFormatter(logging.Formatter(fmt))

    root_logger.setLevel(root_level)

    # Suppress uvicorn's own access logger — the app middleware handles request logging
    logging.getLogger("uvicorn.access").propagate = False
    logging.getLogger("uvicorn.access").setLevel(logging.CRITICAL)

    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).setLevel(root_level)

    for app_name in ("app", "app.requests", "app.main", "app.lifespan"):
        lg = logging.getLogger(app_name)
        lg.setLevel(root_level)
        if not lg.handlers:
            lg.addHandler(_make_handler())
        else:
            for h in lg.handlers:
                if not any(isinstance(f, RequestIdFilter) for f in h.filters):
                    h.addFilter(RequestIdFilter())
                    h.setFormatter(logging.Formatter(fmt))
        lg.propagate = True
```

### 2c — Replace the `_log_requests` middleware

Replace the middleware function (lines 57–78) inside `create_app()`. The key change: extract/generate `req_id`, call `set_request_id()`, wrap in try/finally with `reset_request_id(token)`. Move `duration_ms` and `logger.info()` inside the `try` before `return response`:

```python
    @app.middleware("http")
    async def _log_requests(request: Request, call_next):
        logger = logging.getLogger("app.requests")
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        token = set_request_id(req_id)
        start = time.time()
        try:
            response = await call_next(request)
            duration_ms = (time.time() - start) * 1000.0
            logger.info(
                "%s %s -> %s (%.1fms)",
                request.method,
                request.url.path,
                response.status_code,
                duration_ms,
            )
            response.headers["X-Request-ID"] = req_id
            return response
        except Exception:
            logger.exception(
                "unhandled exception handling request %s %s",
                request.method,
                request.url.path,
            )
            raise
        finally:
            reset_request_id(token)
```

### 2d — Replace the `lifespan()` function

Replace the lifespan function (lines 22–36). Adds: `use_stub_llm` warning, active provider INFO, DB connection probe:

```python
@asynccontextmanager
async def lifespan(_: FastAPI):
    """Run optional startup work while keeping app startup test-friendly."""

    logger = logging.getLogger("app.lifespan")
    logger.info("startup: beginning lifespan startup sequence")

    if settings.use_stub_llm:
        logger.warning("USE_STUB_LLM=true — no real LLM calls will be made")
    else:
        logger.info(
            "Active LLM provider: %s / %s",
            settings.llm_provider,
            settings.llm_model,
        )

    if settings.auto_create_schema:
        logger.warning("auto_create_schema enabled — creating DB schema if missing")
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)

    try:
        async with engine.connect():
            pass
        logger.info("DB connection established")
    except Exception:
        logger.exception("DB connection failed at startup")

    yield

    logger.info("shutdown: lifespan completed")
```

- [ ] **Step 1: Apply all four changes above to `backend/app/main.py`**

- [ ] **Step 2: Run existing tests**

```bash
cd backend && ../.venv/bin/pytest -q
```

Expected: all tests pass.

- [ ] **Step 3: Smoke test and verify format**

```bash
cd /home/mikha/projects/story-mixer && make smoke-stream 2>&1 | head -30
```

Expected: lines contain `[req=<8-char-id>]` for HTTP requests; startup shows provider and DB lines.

- [ ] **Step 4: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: attach RequestIdFilter to all log handlers, extend middleware with request-ID"
```

---

## Task 3: Auth and rate-limit logging in `app/api/deps.py`

**Files:**
- Modify: `backend/app/api/deps.py`

- [ ] **Step 1: Add a module logger and logging calls**

Add `logger = logging.getLogger(__name__)` after the imports. Then update `get_current_user` and `check_rate_limit`. The full file replacement (preserving all existing docstrings):

```python
"""FastAPI dependency providers for auth and rate limiting."""

from __future__ import annotations

import logging
from datetime import datetime

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.persistence.db import get_session, session_factory
from app.persistence.models import User
from app.services.auth_service import verify_token
from app.services.rate_limit_service import check_rate_limit_and_record

logger = logging.getLogger(__name__)


class RateLimitExceeded(Exception):
    """Raised when a user exceeds their hourly generation request limit."""

    def __init__(self, retry_after: datetime) -> None:
        self.retry_after = retry_after


async def get_current_user(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_session),
) -> User:
    """Resolve Bearer token to a User record. Raises 401 on any auth failure."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization[7:]
    try:
        payload = verify_token(token)
    except pyjwt.ExpiredSignatureError:
        logger.warning("Auth token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        logger.warning("Auth token invalid")
        raise HTTPException(status_code=401, detail="Invalid token")

    user = await db.get(User, payload["user_id"])
    if user is None:
        logger.warning("Auth token valid but user_id=%s not found in DB", payload["user_id"])
        raise HTTPException(status_code=401, detail="User not found")

    logger.info("Auth token validated: user_id=%s email=%s", user.id, user.email)
    return user


async def check_rate_limit(
    current_user: User = Depends(get_current_user),
) -> None:
    """Enforce per-user sliding-window rate limit; insert a generation_requests row on pass.

    Uses a fresh session (not the one from get_current_user) to avoid an
    InvalidRequestError when calling db.begin() on a session that already has an
    active transaction from get_current_user's queries.

    Raises RateLimitExceeded (handled in main.py) if the limit is reached.
    The insert happens before story generation starts — a failing request still counts.
    """
    async with session_factory() as db:
        async with db.begin():
            result = await check_rate_limit_and_record(
                db, current_user.id, settings.rate_limit_per_hour
            )

    if result is False:
        raise HTTPException(status_code=401, detail="User not found")
    if result is not None:
        logger.warning(
            "Rate limit exceeded for user_id=%s retry_after=%s",
            current_user.id,
            result.strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        raise RateLimitExceeded(result)
```

- [ ] **Step 2: Run existing auth tests**

```bash
cd backend && ../.venv/bin/pytest tests/test_auth_domain.py tests/test_auth_service.py tests/test_rate_limit_service.py -q
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/deps.py
git commit -m "feat: add auth and rate-limit logging in deps"
```

---

## Task 4: Story endpoint and SSE stream logging in `app/api/v1/stories.py`

**Files:**
- Modify: `backend/app/api/v1/stories.py`

- [ ] **Step 1: Add log calls to the endpoint and stream function**

Replace `generate_long_form_story` (lines 62–73):

```python
@router.post("/generate-long-form")
async def generate_long_form_story(
    request: LongFormRequest,
    _rate_limit: None = Depends(check_rate_limit),
) -> StreamingResponse:
    """Stream a multi-chapter story through the outline → write → critic pipeline."""

    logger.info(
        "Story generation requested: chapters=%d critic=%s",
        request.chapter_count,
        request.enable_critic,
    )
    orchestrator = build_long_form_orchestrator()
    return StreamingResponse(
        _stream_long_form_events(orchestrator.stream(request=request)),
        media_type="text/event-stream",
    )
```

Replace `_stream_long_form_events` (lines 76–92). The `except Exception` catches errors; `except BaseException` (which catches `asyncio.CancelledError` / client disconnect) logs the disconnect:

```python
async def _stream_long_form_events(events: AsyncIterator[dict]) -> AsyncIterator[str]:
    """Serialize long-form pipeline events into RFC-compliant SSE frames."""

    logger.info("SSE stream started")
    try:
        async for event in events:
            name = event.get("event", "message")
            data = event.get("payload", {})
            yield f"event: {name}\ndata: {json.dumps(data)}\n\n"
        logger.info("SSE stream ended normally")
    except Exception as error:
        logger.exception("Unhandled exception while streaming long-form generation")
        payload = {
            "error": "internal_server_error",
            "detail": str(error),
            "user_message": "Long-form story generation failed. Please retry.",
        }
        with contextlib.suppress(Exception):
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"
        logger.info("SSE stream ended with error")
    except BaseException:
        logger.info("SSE stream ended: client disconnected")
        raise
```

- [ ] **Step 2: Run tests**

```bash
cd backend && ../.venv/bin/pytest -q
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/api/v1/stories.py
git commit -m "feat: add story request and SSE stream lifecycle logging"
```

---

## Task 5: Outline agent logging in `app/services/outline_agent.py`

**Files:**
- Modify: `backend/app/services/outline_agent.py`

The existing `logger.debug` (line 110) logs provider/model before the `ainvoke` call (line 111). Replace those two lines and add a log after `result` is received:

- [ ] **Step 1: Replace the debug log block**

Replace lines 110–111 (the `logger.debug` and `result = await ...` lines) with:

```python
        logger.info("Outline agent: provider=%s model=%s", settings.llm_provider, settings.llm_model)
        logger.debug("Outline prompt: %d chars", len(prompt))
        result: _OutlineSpec = await structured.ainvoke(prompt)  # type: ignore[assignment]
        logger.info("Outline response received: %d chapters parsed", len(result.chapters))
```

- [ ] **Step 2: Run tests**

```bash
cd backend && ../.venv/bin/pytest -q
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/outline_agent.py
git commit -m "feat: promote outline agent logs to INFO, add response log"
```

---

## Task 6: Critic agent logging in `app/services/critic_agent.py`

**Files:**
- Modify: `backend/app/services/critic_agent.py`

The existing `logger.debug` block (lines 97–102) logs before `ainvoke`. Replace it and add a verdict log after `result` is received.

- [ ] **Step 1: Replace the debug log block**

Replace lines 97–103 (the `logger.debug(...)` through `result: _CriticOutput = await ...`) with:

```python
        logger.info(
            "Critic agent: chapter=%d provider=%s model=%s",
            chapter_outline.number,
            settings.llm_provider,
            settings.llm_judge_model,
        )
        logger.debug("Critic prompt: chapter=%d %d chars", chapter_outline.number, len(prompt))
        result: _CriticOutput = await structured.ainvoke(prompt)  # type: ignore[assignment]
        logger.info(
            "Critic verdict: chapter=%d %s confidence=%.0f%% summary=%r",
            chapter_outline.number,
            "accepted" if result.passed else "rejected",
            result.confidence * 100,
            result.summary,
        )
```

- [ ] **Step 2: Run tests**

```bash
cd backend && ../.venv/bin/pytest -q
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/critic_agent.py
git commit -m "feat: promote critic agent logs to INFO, add verdict log"
```

---

## Task 7: Provider gateway timing in `app/services/provider_gateway.py`

**Files:**
- Modify: `backend/app/services/provider_gateway.py`

Add `import time` to the imports (line 6 area, after `import logging`). Then update both methods in `HybridLangChainGateway`.

- [ ] **Step 1: Add `import time`**

Add `import time` after `import logging` (line 5).

- [ ] **Step 2: Update `stream_text` in `HybridLangChainGateway`**

Replace the `logger.debug` block and the `try/except/fallback` (lines 60–97) with:

```python
        logger.debug(
            "stream_text: provider=%s model=%s prompt=%d chars",
            settings.llm_provider,
            settings.llm_model,
            len(prompt.user_prompt),
        )

        chat_model = build_chat_model()
        messages = [
            SystemMessage(content=prompt.system_prompt),
            HumanMessage(content=prompt.user_prompt),
        ]
        _t0 = time.time()
        _total_chars = 0
        try:
            async for chunk in chat_model.astream(messages):
                text = getattr(chunk, "content", "")
                if isinstance(text, list):
                    text = "".join(str(part) for part in text)
                if text:
                    _total_chars += len(str(text))
                    yield CompletionChunk(text=str(text))
            logger.debug(
                "stream_text complete: %.1fs %d chars",
                time.time() - _t0,
                _total_chars,
            )
            return
        except (
            httpx.ReadError,
            httpx.RemoteProtocolError,
            httpx.ConnectError,
            httpx.TimeoutException,
        ) as error:
            logger.warning(
                "LLM stream transport error provider=%s model=%s; "
                "falling back to one-shot completion: %s",
                settings.llm_provider,
                settings.llm_model,
                error,
            )

        fallback_text = await self.generate_text(prompt=prompt)
        if fallback_text:
            yield CompletionChunk(text=fallback_text)
```

- [ ] **Step 3: Update `generate_text` in `HybridLangChainGateway`**

Replace the `logger.debug` block and the response handling (lines 105–122) with:

```python
        logger.debug(
            "generate_text: provider=%s model=%s prompt=%d chars",
            settings.llm_provider,
            settings.llm_model,
            len(prompt.user_prompt),
        )

        chat_model = build_chat_model()
        messages = [
            SystemMessage(content=prompt.system_prompt),
            HumanMessage(content=prompt.user_prompt),
        ]
        _t0 = time.time()
        response = await chat_model.ainvoke(messages)
        content = getattr(response, "content", "")
        if isinstance(content, list):
            result = "".join(str(part) for part in content)
        else:
            result = str(content)
        logger.debug(
            "generate_text complete: %.1fs %d chars",
            time.time() - _t0,
            len(result),
        )
        return result
```

- [ ] **Step 4: Run tests**

```bash
cd backend && ../.venv/bin/pytest -q
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/provider_gateway.py
git commit -m "feat: add stream/generate timing logs to provider gateway"
```

---

## Task 8: Orchestrator pipeline timing in `app/services/long_form_orchestrator.py`

The orchestrator already logs most events via `_log()` (which calls `logger.info/warning`). What's missing: pipeline-level start/complete with timing, chapter elapsed seconds, max-revisions warning, and an explicit `logger.info` for the "critic disabled" branch.

**Files:**
- Modify: `backend/app/services/long_form_orchestrator.py`

- [ ] **Step 1: Add `import time`**

Add `import time` to the imports if not already present (check around line 1–20).

- [ ] **Step 2: Add pipeline start timing**

After line 139 (`calibration = request.calibration_profile()`), add:

```python
        _pipeline_start = time.time()
        logger.info(
            "Pipeline started: chapters=%d critic=%s",
            request.chapter_count,
            request.enable_critic,
        )
```

- [ ] **Step 3: Add chapter start timing**

At the start of the `for chapter_outline in outline:` loop body (line 169), before any existing code, add:

```python
            _chapter_start = time.time()
```

- [ ] **Step 4: Add elapsed to chapter draft log**

Find line 218 (the `_log()` call for "Chapter N draft received"):

```python
                yield _log(request_id, "LLM", "Orchestrator", f"Chapter {chapter_outline.number} draft received ({len(draft_text)} chars)")
```

Replace with:

```python
                yield _log(
                    request_id, "LLM", "Orchestrator",
                    f"Chapter {chapter_outline.number} draft received "
                    f"({len(draft_text)} chars, {time.time() - _chapter_start:.1f}s)"
                )
```

- [ ] **Step 5: Add explicit logger.info for critic-disabled branch**

Find line 222 (the critic-disabled `_log()` call):

```python
                    yield _log(request_id, "Orchestrator", "Critic", f"Critic disabled — accepting chapter {chapter_outline.number} as-is")
```

Add a `logger.info()` call immediately before the existing `yield _log(...)`:

```python
                    logger.info("Critic disabled — accepting chapter %d as-is", chapter_outline.number)
                    yield _log(request_id, "Orchestrator", "Critic", f"Critic disabled — accepting chapter {chapter_outline.number} as-is")
```

- [ ] **Step 6: Add max-revisions warning**

Find line 247:

```python
                if critic_result.passed or revision_count >= request.revision_limit:
                    break
```

Replace with:

```python
                if critic_result.passed:
                    break
                if revision_count >= request.revision_limit:
                    logger.warning(
                        "Max revisions reached for chapter %d (limit=%d), accepting current draft",
                        chapter_outline.number,
                        request.revision_limit,
                    )
                    break
```

- [ ] **Step 7: Add pipeline complete log**

Before the final `yield _evt(_EV_COMPLETE, ...)` (line 297), add:

```python
        logger.info(
            "Pipeline complete: %d chapters in %.1fs",
            len(completed),
            time.time() - _pipeline_start,
        )
```

- [ ] **Step 8: Run all tests including the log events test**

```bash
cd backend && ../.venv/bin/pytest tests/test_long_form_log_events.py -v
cd backend && ../.venv/bin/pytest -q
```

Expected: all pass. The SSE log events test tests `_log()` SSE events, not Python log records — it is unaffected.

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/long_form_orchestrator.py
git commit -m "feat: add pipeline start/complete timing and max-revisions warning to orchestrator"
```

---

## Task 9: Session lifecycle logging in `app/persistence/db.py`

**Files:**
- Modify: `backend/app/persistence/db.py`

- [ ] **Step 1: Add logger and session lifecycle logs**

Replace the entire file:

```python
"""Database engine and session utilities for PostgreSQL persistence."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import settings

logger = logging.getLogger(__name__)


def build_engine() -> AsyncEngine:
    """Create one async engine so all repository operations share connection policy."""

    return create_async_engine(settings.database_url, pool_pre_ping=True)


engine = build_engine()
session_factory = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncIterator[AsyncSession]:
    """Provide one transactional session per request for repository consistency."""

    logger.debug("DB session opened")
    try:
        async with session_factory() as session:
            yield session
    finally:
        logger.debug("DB session closed")
```

- [ ] **Step 2: Run tests**

```bash
cd backend && ../.venv/bin/pytest -q
```

- [ ] **Step 3: Run smoke test and verify output end-to-end**

```bash
cd /home/mikha/projects/story-mixer && make smoke-stream 2>&1 | head -60
```

Expected log lines to verify:
- `[req=-]` on startup lines, `[req=<8-char-id>]` on request lines
- `USE_STUB_LLM=true` appears as `WARNING`
- `Outline agent: provider=...` appears at `INFO`
- `Pipeline started:` appears at `INFO`
- `Chapter 1/5 draft received (... chars, ...s)` appears at `INFO`
- `Pipeline complete:` appears at `INFO`

- [ ] **Step 4: Final commit**

```bash
git add backend/app/persistence/db.py
git commit -m "feat: add session lifecycle debug logging to db module"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `make test` passes with no regressions
- [ ] `make smoke-stream` output shows `[req=<8-char-id>]` on every log line for the request
- [ ] Startup logs show `USE_STUB_LLM=true` as WARNING (smoke test uses stub)
- [ ] Pipeline start, chapter draft timing, and pipeline complete visible at INFO
- [ ] `LOG_LEVEL=DEBUG make smoke-stream` shows session open/close, prompt char counts, stream timing
