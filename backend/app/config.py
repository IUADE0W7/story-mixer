"""Configuration values used by the LoreForge backend."""

from __future__ import annotations

import os

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _read_wsl_host_ip() -> str | None:
    """Return the Windows host IP from the WSL default gateway, which is the reliable
    route to the Windows host regardless of the DNS nameserver configuration."""

    try:
        with open("/proc/net/route", encoding="utf-8") as route_file:
            for line in route_file:
                fields = line.strip().split()
                # Default route: destination 00000000, flags include gateway (0003)
                if len(fields) >= 3 and fields[1] == "00000000" and fields[0] != "Iface":
                    # Gateway is stored as a little-endian hex 32-bit integer.
                    gateway_hex = fields[2]
                    gateway_int = int(gateway_hex, 16)
                    octets = (
                        gateway_int & 0xFF,
                        (gateway_int >> 8) & 0xFF,
                        (gateway_int >> 16) & 0xFF,
                        (gateway_int >> 24) & 0xFF,
                    )
                    ip = ".".join(str(o) for o in octets)
                    if ip != "0.0.0.0":
                        return ip
    except OSError:
        return None

    return None


def _default_ollama_base_url() -> str:
    """Pick an Ollama base URL that works for both native Linux/macOS and WSL."""

    windows_host_ip = os.getenv("WINDOWS_HOST_IP", "").strip()
    if windows_host_ip:
        return f"http://{windows_host_ip}:11434"

    is_wsl = bool(os.getenv("WSL_DISTRO_NAME") or os.getenv("WSL_INTEROP"))
    if is_wsl:
        wsl_host_ip = _read_wsl_host_ip()
        if wsl_host_ip:
            return f"http://{wsl_host_ip}:11434"
        return "http://host.docker.internal:11434"

    return "http://localhost:11434"


class AppSettings(BaseSettings):
    """Load environment-backed settings once so services stay deterministic."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "LoreForge API"
    app_version: str = "0.1.0"
    auto_create_schema: bool = False
    use_stub_llm: bool = False
    enable_real_provider_smoke: bool = False
    real_provider_smoke_prompt: str = (
        "Write a compact two-sentence noir opening with calibrated narrative tone."
    )
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/loreforge",
    )
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None
    ollama_base_url: str = Field(default_factory=_default_ollama_base_url)
    # Logging level for the application (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    log_level: str = "INFO"
    jwt_secret: str
    jwt_expiry_hours: int = 24
    rate_limit_per_hour: int = 10


settings = AppSettings()
