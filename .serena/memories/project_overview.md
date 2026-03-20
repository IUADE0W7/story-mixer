# LoreForge — Project Overview

## Purpose
Calibrated narrative generation platform. Users set vibe sliders (Aggression, Reader Respect, Morality, Source Fidelity) and chapter settings to shape AI-generated long-form stories. Backend runs a multi-agent pipeline: outline agent → chapter writer (streaming) → critic agent (revision loop) → SSE response.

## Tech Stack
### Backend
- Python 3.12+, FastAPI, SQLAlchemy (async), Alembic, LangChain
- PostgreSQL via asyncpg
- Pydantic v2, strict typing, async throughout
- LLM providers: Ollama, OpenAI, Anthropic, Gemini

### Frontend
- Next.js 15, React 19, TypeScript, Tailwind CSS, Radix UI
- App Router, SSE streaming via EventSource

## Repository Layout
```
story-mixer/
├── frontend/          # Next.js 15 + React 19
├── backend/           # FastAPI + SQLAlchemy + Alembic
├── .venv/             # Python venv (not committed)
├── Makefile           # Top-level task runner
└── CLAUDE.md
```

## Backend Structure (`backend/app/`)
- `main.py` — FastAPI app factory
- `api/` — Route handlers (stories, health)
- `services/` — Business logic:
  - `long_form_orchestrator.py` — coordinates outline → write → critic pipeline
  - `outline_agent.py` — chapter outline from vibe/brief
  - `critic_agent.py` — evaluates drafts, drives revision loop
  - `provider_gateway.py` — LLM provider abstraction
  - `auth_service.py`, `rate_limit_service.py`, `model_factory.py`, `contracts.py`
- `domain/` — Pydantic models: `long_form_contracts.py`, `vibe_models.py`, `story_contracts.py`, `auth.py`, `genre_options.py`
- `persistence/` — SQLAlchemy models (Alembic-managed)
- `config.py` — Settings from env vars

## Frontend Structure (`frontend/src/`)
- `app/` — Next.js App Router pages
- `components/` — React components (VibeController, story output)
- `lib/` — Utilities, streaming helpers
- `locales/` — i18n (en, uk, ru, kk)
