# Task Completion Checklist

When finishing a task, run the following as applicable:

## Backend changes
1. `make test` — run pytest suite
2. If schema changed: create Alembic migration (`alembic revision --autogenerate -m "description"`)
3. If new routes added: ensure they're in `backend/app/api/` and registered in `main.py`

## Frontend changes
1. `cd frontend && npm run lint` — next lint
2. `cd frontend && npm run e2e` — Playwright tests (if UI flow affected)

## Both
- Ensure `USE_STUB_LLM=true` works for smoke tests (`make smoke-stream`)
- Never commit `.env` files
- Use `make` targets where available
