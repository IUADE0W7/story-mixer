"""Guarded integration smoke test for live provider connectivity."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


def test_real_provider_smoke_endpoint_disabled_by_default() -> None:
    """Return 404 when smoke endpoint is disabled to keep it non-public by default."""

    settings.enable_real_provider_smoke = False
    payload = {
        "provider": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "judge_model": "gpt-4o-mini",
            "temperature": 0.4,
        },
        "prompt": "Smoke test prompt.",
    }

    with TestClient(app) as client:
        response = client.post("/api/v1/stories/smoke/provider", json=payload)

    assert response.status_code == 404


@pytest.mark.integration
def test_real_provider_smoke_endpoint() -> None:
    """Run a live provider smoke request only when explicitly enabled by env flags."""

    if os.getenv("RUN_REAL_PROVIDER_SMOKE", "false").lower() != "true":
        pytest.skip("Set RUN_REAL_PROVIDER_SMOKE=true to run live provider smoke test.")

    provider = os.getenv("REAL_SMOKE_PROVIDER", "openai")
    model = os.getenv("REAL_SMOKE_MODEL", "gpt-4o-mini")
    judge_model = os.getenv("REAL_SMOKE_JUDGE_MODEL", model)
    prompt = os.getenv(
        "REAL_SMOKE_PROMPT",
        settings.real_provider_smoke_prompt,
    )

    settings.enable_real_provider_smoke = True
    settings.use_stub_llm = False

    payload = {
        "provider": {
            "provider": provider,
            "model": model,
            "judge_model": judge_model,
            "temperature": 0.4,
        },
        "prompt": prompt,
    }

    with TestClient(app) as client:
        response = client.post("/api/v1/stories/smoke/provider", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["chars"] > 0
