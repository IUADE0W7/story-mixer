"""Story generation routes with SSE streaming support."""

from __future__ import annotations

import contextlib
import json
import logging
from collections.abc import AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.domain.long_form_contracts import LongFormRequest
from app.services.contracts import LLMGateway, OutlineAgent
from app.services.long_form_orchestrator import LongFormOrchestrator
from app.services.model_factory import verify_ollama_connectivity
from app.services.outline_agent import LocalOutlineAgent, StructuredOutlineAgent
from app.services.provider_gateway import HybridLangChainGateway, LocalStubGateway
from app.api.deps import check_rate_limit

router = APIRouter(prefix="/stories", tags=["stories"])
logger = logging.getLogger(__name__)

STREAM_FAILURES = (
    RuntimeError,
    ValueError,
    TypeError,
    OSError,
    httpx.HTTPError,
)


def get_llm_gateway() -> LLMGateway:
    """Return the configured provider gateway for story generation."""

    return LocalStubGateway() if settings.use_stub_llm else HybridLangChainGateway()


def get_outline_agent() -> OutlineAgent:
    """Return the configured outline agent for story generation."""

    return LocalOutlineAgent() if settings.use_stub_llm else StructuredOutlineAgent()


def get_long_form_orchestrator(
    llm_gateway: LLMGateway = Depends(get_llm_gateway),
    outline_agent: OutlineAgent = Depends(get_outline_agent),
) -> LongFormOrchestrator:
    """Assemble the story orchestrator through dependency injection."""

    return LongFormOrchestrator(llm_gateway=llm_gateway, outline_agent=outline_agent)


def _ollama_user_message() -> str:
    """Return an end-user focused message for Ollama connection problems."""

    return (
        "Cannot reach Ollama right now. Start Ollama, make sure model `gpt-oss:20b` is available, "
        "and verify the backend OLLAMA base URL is correct."
    )


@router.post("/generate-long-form")
async def generate_long_form_story(
    request: LongFormRequest,
    _rate_limit: None = Depends(check_rate_limit),
    orchestrator: LongFormOrchestrator = Depends(get_long_form_orchestrator),
) -> StreamingResponse:
    """Stream a multi-chapter story through the outline and chapter-writing pipeline."""

    logger.info("Story generation requested: chapters=%d", request.chapter_count)
    return StreamingResponse(
        _stream_long_form_events(orchestrator.stream(request=request)),
        media_type="text/event-stream",
    )


async def _stream_long_form_events(events: AsyncIterator[dict]) -> AsyncIterator[str]:
    """Serialize long-form pipeline events into RFC-compliant SSE frames."""

    logger.info("SSE stream started")
    try:
        async for event in events:
            name = event.get("event", "message")
            data = event.get("payload", {})
            yield f"event: {name}\ndata: {json.dumps(data)}\n\n"
        logger.info("SSE stream ended normally")
    except STREAM_FAILURES:
        logger.exception("Unhandled exception while streaming long-form generation")
        payload = {
            "error": "internal_server_error",
            "user_message": "Long-form story generation failed. Please retry.",
        }
        with contextlib.suppress(Exception):
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"
        logger.info("SSE stream ended with error")
    except BaseException:
        logger.info("SSE stream ended: client disconnected")
        raise


@router.get("/health/ollama")
async def ollama_health() -> dict[str, object]:
    """Check whether the configured Ollama endpoint is currently reachable."""

    try:
        verify_ollama_connectivity(timeout_seconds=2)
    except ValueError as error:
        logger.warning("Ollama health check failed: %s", error)
        raise HTTPException(
            status_code=503,
            detail={
                "ok": False,
                "provider": "ollama",
                "base_url": settings.ollama_base_url,
                "message": _ollama_user_message(),
                "error": str(error),
            },
        ) from error

    return {
        "ok": True,
        "provider": "ollama",
        "base_url": settings.ollama_base_url,
        "message": "Ollama connectivity check passed.",
    }


