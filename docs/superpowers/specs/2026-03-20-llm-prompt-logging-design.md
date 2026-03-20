# LLM Prompt Logging — Design Spec
_Date: 2026-03-20_

## Goal

Add DEBUG-level logging of full LLM prompts (system + user) sent by the backend, to support iterating on prompt quality during development.

## Scope

Single file change: `backend/app/services/provider_gateway.py`
Class: `HybridLangChainGateway`
Methods: `stream_text`, `generate_text`

`LocalStubGateway` is excluded — it has no real prompt routing.

## Design

In each method, add a `logger.debug` call immediately before the LLM is invoked. The log entry emits both the system and user prompts in full, with human-readable separators:

```python
logger.debug(
    "stream_text prompt\n--- system ---\n%s\n--- user ---\n%s",
    prompt.system_prompt,
    prompt.user_prompt,
)
```

The same pattern applies to `generate_text` (with label `generate_text prompt`).

## Activation

Set `LOG_LEVEL=DEBUG` in the environment (or `log_level = DEBUG` in `.env`). `main.py`'s `_configure_logging()` reads `AppSettings.log_level` and sets the Python root logger level from it, so all module loggers including `app.services.provider_gateway` will emit DEBUG records when this is set. No other wiring is needed.

## Fallback path

`stream_text` falls back to `self.generate_text(prompt=prompt)` on transport errors. This means on a fallback the prompt will be logged twice — once via the `stream_text` log, once via `generate_text`. This is intentional and requires no special handling; the duplicate entry serves as a useful signal that a fallback occurred.

## Format rationale

- `--- system ---` / `--- user ---` separators make the two sections easy to distinguish in terminal output
- Full text (no truncation) per the requirement — useful for spotting issues in long prompts
- Placed before the LLM call so the prompt is visible even if the call fails

## What is not changing

- `AppSettings` — no new config fields
- `LocalStubGateway` — no changes
- Log level of existing metadata logs (provider, model, char count) — still DEBUG, unaffected
