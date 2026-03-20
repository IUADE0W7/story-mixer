# Backend Logging Design

**Date:** 2026-03-20
**Status:** Approved

## Goal

Cover all backend layers with logging that makes the application observable from the terminal — no log aggregation service. Every log line for a given story generation run must be correlatable by a request ID.

## Constraints

- Keep Python stdlib `logging` (no loguru, structlog)
- No new runtime dependencies
- No changes to existing test suite (`test_long_form_log_events.py` tests SSE events, not log records)
- Clean terminal output, human-readable

---

## Architecture

### New module: `app/logging_context.py`

A `ContextVar[str]` holds the request ID for the current async context. A `logging.Filter` reads it and stamps every log record automatically.

```python
# app/logging_context.py
import logging
from contextvars import ContextVar

_request_id: ContextVar[str] = ContextVar("request_id", default="-")

def set_request_id(value: str) -> None:
    _request_id.set(value)

def get_request_id() -> str:
    return _request_id.get()

class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.req_id = _request_id.get()
        return True
```

The filter is attached to the root handler once at startup in `main.py`. No per-logger wiring needed.

### Format change (`main.py`)

```
%(asctime)s %(levelname)-8s [%(name)s] [req=%(req_id)s] %(message)s
```

### Request middleware (`main.py`)

The existing `_log_requests` middleware is extended to:
1. Read `X-Request-ID` header if present; otherwise generate a short UUID (first 8 chars)
2. Call `set_request_id()` to store it in the `ContextVar`
3. Return the ID in the `X-Request-ID` response header

---

## Log Coverage

### API layer — `app/api/v1/stories.py`

| Event | Level |
|-------|-------|
| Story generation request received (chapter count, vibe summary) | INFO |
| SSE stream started | INFO |
| SSE stream ended (normal / client disconnect) | INFO |
| Rate limit hit (user id, limit, retry-after) | WARNING |
| Auth token present/absent | DEBUG |
| Auth token validated, user id resolved | INFO |
| Auth token invalid | WARNING |

### Orchestrator — `app/services/long_form_orchestrator.py`

| Event | Level |
|-------|-------|
| Pipeline started (chapter count, vibe params) | INFO |
| Outline generation started | INFO |
| Outline complete (chapter count) | INFO |
| Chapter N/total write started | INFO |
| Chapter N draft received (char count, elapsed seconds) | INFO |
| Critic decision: accepted (confidence %) | INFO |
| Critic decision: rejected (confidence %, summary) | INFO |
| Revision triggered (chapter N, attempt X of max) | INFO |
| Max revisions reached for chapter N — accepting draft | WARNING |
| Pipeline complete (total chapters, total elapsed) | INFO |
| Outline generation failed | ERROR (exception) |
| Chapter write failed | ERROR (exception) |

### Outline agent — `app/services/outline_agent.py`

| Event | Level |
|-------|-------|
| Provider + model selected | INFO (promote from DEBUG) |
| Outline prompt sent (prompt char count) | DEBUG |
| Outline response received (chapter count parsed) | INFO |

### Critic agent — `app/services/critic_agent.py`

| Event | Level |
|-------|-------|
| Provider + model selected | INFO (promote from DEBUG) |
| Critic disabled — skipping evaluation | INFO |
| Evaluation sent (chapter N) | DEBUG |
| Verdict received (accepted/rejected, confidence %, summary) | INFO |
| Critic call failed — falling back to accept | WARNING |

### Provider gateway — `app/services/provider_gateway.py`

| Event | Level |
|-------|-------|
| Stream call: provider, model, prompt char count | DEBUG |
| Stream complete: elapsed seconds, response char count | DEBUG |
| Generate call: provider, model, prompt char count | DEBUG |
| Generate complete: elapsed seconds, response char count | DEBUG |
| HTTP transport error + fallback (existing) | WARNING |

### Persistence layer — `app/persistence/`

| Event | Level |
|-------|-------|
| DB session opened | DEBUG |
| DB session closed | DEBUG |
| Story record created (story id) | INFO |
| Story record updated (story id, field) | INFO |
| Query error | ERROR (exception) |

### Startup — `app/main.py` lifespan

| Event | Level |
|-------|-------|
| Active LLM provider + model | INFO |
| DB connection established | INFO |
| `USE_STUB_LLM=true` active | WARNING |
| Auto-create schema running (existing) | WARNING |

---

## Log Level Conventions

| Level | Used for |
|-------|----------|
| DEBUG | Per-call detail (prompt lengths, session lifecycle, response sizes) |
| INFO | Every meaningful state transition |
| WARNING | Degraded but recoverable (fallback accept, max revisions, stub LLM, transport error) |
| ERROR / `exception()` | Unrecoverable failures only |

---

## Example Terminal Output

```
2026-03-20 14:21:58 INFO     [app.main]                            [req=-]    Active provider: anthropic / claude-sonnet-4-6
2026-03-20 14:21:58 INFO     [app.main]                            [req=-]    DB connection established
2026-03-20 14:22:00 INFO     [app.requests]                        [req=a3f1c2d8] POST /api/v1/stories/generate → 200 (12ms)
2026-03-20 14:22:00 INFO     [app.api.v1.stories]                  [req=a3f1c2d8] Story generation requested: 5 chapters, aggression=7 morality=3
2026-03-20 14:22:00 INFO     [app.services.long_form_orchestrator] [req=a3f1c2d8] Pipeline started: 5 chapters
2026-03-20 14:22:00 INFO     [app.services.long_form_orchestrator] [req=a3f1c2d8] Outline generation started
2026-03-20 14:22:01 INFO     [app.services.outline_agent]          [req=a3f1c2d8] Provider: anthropic, model: claude-sonnet-4-6
2026-03-20 14:22:02 INFO     [app.services.long_form_orchestrator] [req=a3f1c2d8] Outline complete: 5 chapters
2026-03-20 14:22:02 INFO     [app.services.long_form_orchestrator] [req=a3f1c2d8] Writing chapter 1/5
2026-03-20 14:22:04 INFO     [app.services.long_form_orchestrator] [req=a3f1c2d8] Chapter 1/5 draft received (1842 chars, 2.1s)
2026-03-20 14:22:04 INFO     [app.services.critic_agent]           [req=a3f1c2d8] Chapter 1 accepted — confidence 87%
2026-03-20 14:22:18 WARNING  [app.services.long_form_orchestrator] [req=a3f1c2d8] Max revisions reached for chapter 3, accepting current draft
2026-03-20 14:22:30 INFO     [app.services.long_form_orchestrator] [req=a3f1c2d8] Pipeline complete: 5 chapters in 28.4s
2026-03-20 14:22:30 INFO     [app.persistence.stories]             [req=a3f1c2d8] Story saved (id=42)
```

---

## Out of Scope

- JSON/structured log format (no aggregation service needed)
- Log rotation / file handlers
- Distributed tracing (OpenTelemetry spans)
- Frontend logging
