SHELL := /bin/bash

PYTHON := /home/mikha/projects/story-mixer/.venv/bin/python
BACKEND_DIR := /home/mikha/projects/story-mixer/backend

DB_USER ?= mikha
DB_PASSWORD ?= postgres
DB_NAME ?= loreforge
DB_HOST ?= 127.0.0.1
DB_PORT ?= 5432
DATABASE_URL ?= postgresql+asyncpg://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)

.PHONY: venv deps db-start db-ensure migrate migrate-sql test smoke-stream

venv:
	python3 -m venv /home/mikha/projects/story-mixer/.venv
	$(PYTHON) -m pip install --upgrade pip

deps:
	cd $(BACKEND_DIR) && $(PYTHON) -m pip install -e .

db-start:
	sudo service postgresql start

db-ensure:
	sudo -u postgres psql -c "CREATE ROLE $(DB_USER) LOGIN PASSWORD '$(DB_PASSWORD)';" || true
	sudo -u postgres psql -c "ALTER ROLE $(DB_USER) WITH LOGIN PASSWORD '$(DB_PASSWORD)';"
	sudo -u postgres createdb -O $(DB_USER) $(DB_NAME) || true

migrate:
	cd $(BACKEND_DIR) && DATABASE_URL='$(DATABASE_URL)' $(PYTHON) -m alembic upgrade head

migrate-sql:
	cd $(BACKEND_DIR) && DATABASE_URL='$(DATABASE_URL)' $(PYTHON) -m alembic upgrade head --sql

test:
	cd $(BACKEND_DIR) && $(PYTHON) -m pytest -q

smoke-stream:
	cd $(BACKEND_DIR) && \
	DATABASE_URL='$(DATABASE_URL)' USE_STUB_LLM=true $(PYTHON) -m uvicorn app.main:app --host 127.0.0.1 --port 8001 >/tmp/loreforge-api.log 2>&1 & \
	SERVER_PID=$$!; \
	trap "kill $$SERVER_PID >/dev/null 2>&1 || true" EXIT; \
	sleep 2; \
	curl -sS -N -X POST 'http://127.0.0.1:8001/api/v1/stories/generate' \
	  -H 'Content-Type: application/json' \
	  --data '{"context":{"user_prompt":"Write a tense opening scene in a storm-lit city.","genre":"noir","audience":"adult","continuity_notes":[]},"vibe":{"aggression":72,"reader_respect":85,"morality":40},"provider":{"provider":"openai","model":"gpt-4o-mini","judge_model":"gpt-4o-mini","temperature":0.8},"stream":true,"max_words":300,"revision_limit":2}' \
	  | sed -n '1,24p';

