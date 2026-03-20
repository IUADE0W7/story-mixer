# Code Style and Conventions

## Python (backend)
- Python 3.12+, strict typing with Pydantic v2
- Async throughout — `async/await` + SQLAlchemy async sessions
- New API routes → `backend/app/api/`
- Business logic → `backend/app/services/`
- Domain types / Pydantic models → `backend/app/domain/`
- Alembic for all schema changes — never use `AUTO_CREATE_SCHEMA=true` in production
- Tests in `backend/tests/`; mark live-provider tests with `@pytest.mark.integration`

## TypeScript (frontend)
- React 19 + Next.js App Router — prefer Server Components where no interactivity needed
- Tailwind for styling; Radix UI for accessible primitives
- Vibe-control state lives in VibeController; lift only what needs sharing
- Streaming: use `EventSource` / `ReadableStream` — don't buffer full story before rendering
- i18n via locales in `frontend/src/locales/` (en, uk, ru, kk)

## General
- No `.env` commits; use `.env.example` pattern
- Prefer `make` targets over raw commands
