"""Factory utilities for creating provider-specific LangChain chat models."""

from __future__ import annotations

import socket
from urllib.parse import urlparse

import httpx
from langchain_core.language_models.chat_models import BaseChatModel

from app.config import settings
from app.domain.story_contracts import ProviderSelection


def verify_ollama_connectivity(base_url: str | None = None, timeout_seconds: float = 2.0) -> None:
    """Fail fast when the Ollama endpoint is not reachable or API-ready."""

    target_url = base_url or settings.ollama_base_url
    parsed = urlparse(target_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 11434

    try:
        with socket.create_connection((host, port), timeout=timeout_seconds):
            pass
    except OSError as exc:
        raise ValueError(
            f"Ollama server unreachable at {target_url}: {exc}"
        ) from exc

    health_url = target_url.rstrip("/") + "/api/tags"
    try:
        response = httpx.get(health_url, timeout=timeout_seconds)
        if response.status_code >= 400:
            raise ValueError(
                f"Ollama API unhealthy at {health_url}: HTTP {response.status_code}"
            )
    except httpx.HTTPError as exc:
        raise ValueError(
            f"Ollama API unreachable at {health_url}: {exc}"
        ) from exc


def build_chat_model(provider: ProviderSelection, *, for_judge: bool = False) -> BaseChatModel:
    """Create a configured chat model so orchestration code stays provider-agnostic."""

    model_name = provider.judge_model if for_judge else provider.model
    provider_name = provider.provider.strip().lower()

    if provider_name == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when provider is openai.")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model_name,
            temperature=provider.temperature,
            api_key=settings.openai_api_key,
        )

    if provider_name == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when provider is anthropic.")
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model_name,
            temperature=provider.temperature,
            api_key=settings.anthropic_api_key,
        )

    if provider_name == "gemini":
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is required when provider is gemini.")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=provider.temperature,
            google_api_key=settings.google_api_key,
        )

    if provider_name == "ollama":
        # Quick connectivity check so failed Ollama connections surface immediately.
        verify_ollama_connectivity(timeout_seconds=2)

        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=model_name,
            temperature=provider.temperature,
            base_url=settings.ollama_base_url,
        )

    raise ValueError(
        "Unsupported provider. Expected one of: openai, anthropic, gemini, ollama."
    )
