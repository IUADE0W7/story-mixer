# Suggested Commands

## Setup
```bash
make venv          # create .venv
make deps          # install Python deps
make db-start      # start PostgreSQL (WSL: sudo service postgresql start)
make db-ensure     # create DB user + database
make migrate       # run Alembic migrations
```

## Running
```bash
# Backend dev server
cd backend
DATABASE_URL='postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge' \
  ../.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend dev server
cd frontend && npm run dev   # http://localhost:3000

# Smoke test (stub LLM, no provider keys needed)
make smoke-stream
```

## Testing
```bash
make test                     # pytest -q (unit + integration, no live providers)
make test-real-provider       # integration tests against real LLM provider

cd frontend && npm run e2e         # Playwright headless
cd frontend && npm run e2e:headed  # with browser
cd frontend && npm run e2e:ui      # Playwright interactive UI
cd frontend && npm run lint        # next lint
```

## Database
```bash
# Default URL
postgresql+asyncpg://mikha:postgres@127.0.0.1:5432/loreforge
```

## Environment Variables
- `USE_STUB_LLM=true` — local dev without provider keys
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OLLAMA_BASE_URL`
- Never commit `.env`; copy `.env.example` → `.env`
