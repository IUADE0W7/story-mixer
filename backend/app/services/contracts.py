"""Protocol interfaces that decouple FastAPI transport from LLM orchestration."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field


class PromptEnvelope(BaseModel):
    """Prompt packet built by the orchestration layer before hitting an LLM provider."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    system_prompt: str = Field(min_length=1)
    user_prompt: str = Field(min_length=1)
    metadata: dict[str, object] = Field(default_factory=dict)


class CompletionChunk(BaseModel):
    """A streamed unit of text produced by a provider adapter."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str
    finish_reason: str | None = None


class LLMGateway(Protocol):
    """Provider-agnostic adapter used by the orchestration layer."""

    def stream_text(
        self,
        prompt: PromptEnvelope,
    ) -> AsyncIterator[CompletionChunk]:
        """Stream tokens or partial chunks from the configured provider."""

    async def generate_text(
        self,
        prompt: PromptEnvelope,
    ) -> str:
        """Return a non-streaming completion when streaming is disabled."""


class OutlineAgent(Protocol):
    """Outline generator used by the orchestration layer."""

    async def generate_outline(
        self,
        request: object,
        calibration: object,
    ) -> list[object]:
        """Return a structured chapter outline for the request."""
