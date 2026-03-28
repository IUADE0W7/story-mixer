"""Factory utilities for creating provider-specific LangChain chat models."""

from __future__ import annotations

import socket
from urllib.parse import urlparse

import httpx
from langchain_core.language_models.chat_models import BaseChatModel

from app.config import settings


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


def build_chat_model() -> BaseChatModel:
    """Create a configured chat model from app config so orchestration code stays provider-agnostic."""

    model_name = settings.llm_model
    provider_name = settings.llm_provider.strip().lower()
    temperature = settings.llm_temperature

    if provider_name == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when provider is openai.")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=model_name,
            temperature=temperature,
            api_key=settings.openai_api_key,
        )

    if provider_name == "anthropic":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is required when provider is anthropic.")
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model_name,
            temperature=temperature,
            api_key=settings.anthropic_api_key,
        )

    if provider_name == "gemini":
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is required when provider is gemini.")
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=settings.google_api_key,
        )

    if provider_name == "xai":
        if not settings.xai_api_key:
            raise ValueError("XAI_API_KEY is required when provider is xai.")
        from langchain_xai import ChatXAI

        return ChatXAI(
            model=model_name,
            temperature=temperature,
            xai_api_key=settings.xai_api_key,
        )

    if provider_name == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(
            model=model_name,
            temperature=temperature,
            base_url=settings.ollama_base_url,
        )

    raise ValueError(
        "Unsupported provider. Expected one of: openai, anthropic, gemini, ollama, xai."
    )
