"""Provider gateway implementations for generation streaming and completion."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

import httpx
from langchain_core.messages import HumanMessage, SystemMessage

from app.domain.story_contracts import ProviderSelection
from app.services.contracts import CompletionChunk, LLMGateway, PromptEnvelope
from app.services.model_factory import build_chat_model

logger = logging.getLogger(__name__)


class LocalStubGateway(LLMGateway):
    """Development gateway that simulates provider output while APIs are wired later."""

    async def stream_text(
        self,
        prompt: PromptEnvelope,
        provider: ProviderSelection,
    ) -> AsyncIterator[CompletionChunk]:
        """Emit deterministic chunks so SSE behavior can be validated without an LLM key."""

        base = self._build_preview_text(prompt)
        for token in base.split(" "):
            yield CompletionChunk(text=f"{token} ")

    async def generate_text(
        self,
        prompt: PromptEnvelope,
        provider: ProviderSelection,
    ) -> str:
        """Return deterministic text for revision and non-streaming flows in development."""

        return self._build_preview_text(prompt)

    def _build_preview_text(self, prompt: PromptEnvelope) -> str:
        """Keep development output stable so orchestration behavior is testable."""

        preview = (
            "LoreForge draft preview: calibrated tone active. "
            "This placeholder text should be replaced with a LangChain-backed provider adapter. "
            "Prompt excerpt: "
        )
        excerpt = prompt.user_prompt[:280].replace("\n", " ")
        return f"{preview}{excerpt}"


class HybridLangChainGateway(LLMGateway):
    """Generate and stream text through provider-specific LangChain adapters."""

    async def stream_text(
        self,
        prompt: PromptEnvelope,
        provider: ProviderSelection,
    ) -> AsyncIterator[CompletionChunk]:
        """Stream provider output incrementally so the UI can render prose in real time."""

        logger.debug(
            "LLM stream prompt provider=%s model=%s system_prompt=%r user_prompt=%r",
            provider.provider,
            provider.model,
            prompt.system_prompt,
            prompt.user_prompt,
        )

        chat_model = build_chat_model(provider)
        messages = [
            SystemMessage(content=prompt.system_prompt),
            HumanMessage(content=prompt.user_prompt),
        ]
        try:
            async for chunk in chat_model.astream(messages):
                text = getattr(chunk, "content", "")
                if isinstance(text, list):
                    text = "".join(str(part) for part in text)
                if text:
                    yield CompletionChunk(text=str(text))
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
                provider.provider,
                provider.model,
                error,
            )

        fallback_text = await self.generate_text(prompt=prompt, provider=provider)
        if fallback_text:
            yield CompletionChunk(text=fallback_text)

    async def generate_text(
        self,
        prompt: PromptEnvelope,
        provider: ProviderSelection,
    ) -> str:
        """Run one-shot generation for revision and non-streaming workflows."""

        logger.debug(
            "LLM generate prompt provider=%s model=%s system_prompt=%r user_prompt=%r",
            provider.provider,
            provider.model,
            prompt.system_prompt,
            prompt.user_prompt,
        )

        chat_model = build_chat_model(provider)
        messages = [
            SystemMessage(content=prompt.system_prompt),
            HumanMessage(content=prompt.user_prompt),
        ]
        response = await chat_model.ainvoke(messages)
        content = getattr(response, "content", "")
        if isinstance(content, list):
            return "".join(str(part) for part in content)
        return str(content)
