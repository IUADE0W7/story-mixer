"""Story generation routes with SSE streaming support."""

from __future__ import annotations

import contextlib
import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.config import settings
from app.domain.long_form_contracts import LongFormRequest
from app.domain.story_contracts import ProviderSelection
from app.services.contracts import PromptEnvelope
from app.services.critic_agent import LocalChapterCritic, StructuredChapterCritic
from app.services.long_form_orchestrator import LongFormOrchestrator
from app.services.model_factory import verify_ollama_connectivity
from app.services.outline_agent import LocalOutlineAgent, StructuredOutlineAgent
from app.services.provider_gateway import HybridLangChainGateway, LocalStubGateway
from app.api.deps import check_rate_limit

router = APIRouter(prefix="/stories", tags=["stories"])
logger = logging.getLogger(__name__)


class ProviderSmokeRequest(BaseModel):
    """Minimal payload used to verify live provider connectivity on demand."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    provider: ProviderSelection
    prompt: str = Field(min_length=1, max_length=1_200)


def build_long_form_orchestrator() -> LongFormOrchestrator:
    """Build a long-form orchestrator with stub or production agents."""

    llm_gateway = LocalStubGateway() if settings.use_stub_llm else HybridLangChainGateway()
    if settings.use_stub_llm:
        outline_agent = LocalOutlineAgent()
        critic_agent  = LocalChapterCritic()
    else:
        outline_agent = StructuredOutlineAgent()
        critic_agent  = StructuredChapterCritic()
    return LongFormOrchestrator(
        llm_gateway=llm_gateway,
        outline_agent=outline_agent,
        critic_agent=critic_agent,
    )


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
) -> StreamingResponse:
    """Stream a multi-chapter story through the outline → write → critic pipeline."""

    orchestrator = build_long_form_orchestrator()
    return StreamingResponse(
        _stream_long_form_events(orchestrator.stream(request=request)),
        media_type="text/event-stream",
    )


async def _stream_long_form_events(events: AsyncIterator[dict]) -> AsyncIterator[str]:
    """Serialize long-form pipeline events into RFC-compliant SSE frames."""

    try:
        async for event in events:
            name = event.get("event", "message")
            data = event.get("payload", {})
            yield f"event: {name}\ndata: {json.dumps(data)}\n\n"
    except Exception as error:
        logger.exception("Unhandled exception while streaming long-form generation")
        payload = {
            "error": "internal_server_error",
            "detail": str(error),
            "user_message": "Long-form story generation failed. Please retry.",
        }
        with contextlib.suppress(Exception):
            yield f"event: error\ndata: {json.dumps(payload)}\n\n"


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


@router.post("/smoke/provider")
async def real_provider_smoke(request: ProviderSmokeRequest) -> dict[str, object]:
    """Run a guarded live-provider smoke call outside normal generation orchestration."""

    if not settings.enable_real_provider_smoke:
        raise HTTPException(status_code=404, detail="Smoke endpoint is disabled.")

    gateway = HybridLangChainGateway()
    try:
        completion = await gateway.generate_text(
            prompt=PromptEnvelope(
                system_prompt=(
                    "You are a calibrated narrative model. Keep output concise, coherent, "
                    "and aligned to the user instruction."
                ),
                user_prompt=request.prompt,
                metadata={"smoke": True},
            ),
            provider=request.provider,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        logger.exception("Provider smoke request failed")
        raise HTTPException(status_code=502, detail="Provider smoke request failed.") from error

    return {
        "ok": bool(completion.strip()),
        "provider": request.provider.provider,
        "model": request.provider.model,
        "chars": len(completion),
        "preview": completion[:220],
    }
