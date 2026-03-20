"""Provider gateway implementations for generation streaming and completion."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator

import httpx
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.services.contracts import CompletionChunk, LLMGateway, PromptEnvelope
from app.services.model_factory import build_chat_model

logger = logging.getLogger(__name__)


class LocalStubGateway(LLMGateway):
    """Development gateway that simulates provider output while APIs are wired later."""

    async def stream_text(
        self,
        prompt: PromptEnvelope,
    ) -> AsyncIterator[CompletionChunk]:
        """Emit deterministic chunks so SSE behavior can be validated without an LLM key."""

        base = self._build_preview_text(prompt)
        for token in base.split(" "):
            yield CompletionChunk(text=f"{token} ")

    async def generate_text(
        self,
        prompt: PromptEnvelope,
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
    ) -> AsyncIterator[CompletionChunk]:
        """Stream provider output incrementally so the UI can render prose in real time."""

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

    async def generate_text(
        self,
        prompt: PromptEnvelope,
    ) -> str:
        """Run one-shot generation for revision and non-streaming workflows."""

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
