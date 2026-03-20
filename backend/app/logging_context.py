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
