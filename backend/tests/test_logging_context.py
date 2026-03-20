# backend/tests/test_logging_context.py
"""Unit tests for request-ID context propagation."""
import asyncio
import logging

import pytest

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


@pytest.mark.asyncio
async def test_contextvar_isolation_across_tasks():
    """Each asyncio Task gets its own copy of the ContextVar."""
    results: dict[str, str] = {}

    async def set_and_capture(name: str, value: str) -> None:
        token = set_request_id(value)
        await asyncio.sleep(0)
        results[name] = get_request_id()
        reset_request_id(token)

    await asyncio.gather(
        set_and_capture("task_a", "aaa"),
        set_and_capture("task_b", "bbb"),
    )

    assert results["task_a"] == "aaa"
    assert results["task_b"] == "bbb"
