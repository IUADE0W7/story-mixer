# Hetzner Deployment Design

**Date:** 2026-03-20
**Status:** Approved

## Overview

Deploy LoreForge (Next.js frontend + FastAPI backend + PostgreSQL) to a Hetzner VPS running Ubuntu 24.04 LTS using Docker Compose with Caddy as the reverse proxy for automatic HTTPS.

## Architecture

All four services share a private Docker network (`loreforge_net`). Only Caddy exposes ports 80 and 443 to the host. Backend, frontend, and Postgres are network-internal only.

```text
Internet
   │
   ▼
Caddy :80/:443  (TLS auto via Let's Encrypt)
   ├── /api/v1/* ──► backend:8000  (FastAPI/Uvicorn)
   └── /*         ──► frontend:3000 (Next.js Node server)
                            │
                       backend:8000
                            │
                       postgres:5432
```

## Services

### Postgres

- Image: `postgres:16-alpine`
- Credentials via env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Persistent volume: `postgres_data`
- No port exposed to host
- Defines a `healthcheck` using `pg_isready -U ${POSTGRES_USER}` so dependent services can use `condition: service_healthy`

### Backend

- Built from `docker/Dockerfile.backend` (Python 3.12-slim)
- Uses an entrypoint shell script `docker/backend-entrypoint.sh`:

  ```bash
  #!/bin/sh
  alembic upgrade head
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
  ```

  The `exec` replaces the shell process so Uvicorn receives SIGTERM from `docker stop` directly (graceful shutdown).
- `alembic/env.py` already translates `postgresql+asyncpg://` → `postgresql+psycopg://` for the migration sync engine — no change needed
- Env vars: `DATABASE_URL`, `XAI_API_KEY` (xAI Grok via `langchain-xai`), optional provider keys
- `depends_on: postgres` with `condition: service_healthy` — ensures Postgres accepts connections before migrations run
- **Single DB user for migrations and runtime**: deliberate trade-off for a single-instance VPS (simplicity over privilege separation). Acceptable here; revisit if moving to multi-instance.

### Frontend

- Built from `docker/Dockerfile.frontend` (Node 22-alpine, multi-stage)
  - Stage 1: `npm ci && npm run build` — `BACKEND_URL` is **not** needed at build time; Next.js rewrites read it at server startup, not during `next build`
  - Stage 2: copy `.next` output, run `next start --hostname 0.0.0.0` (binds to all interfaces so Caddy can reach it on the Docker network)
- `BACKEND_URL=http://backend:8000` is injected at container runtime via `docker-compose.yml`
- `next.config.ts` updated to read `BACKEND_URL` env var at runtime (falls back to `http://localhost:8001` — matching the existing hardcoded value in `next.config.ts`)
- `depends_on: backend` (start ordering only — if backend fails to start, frontend still starts and Caddy proxying of `/api/v1/*` will return errors until backend recovers)

### Caddy

- Image: `caddy:2-alpine`
- Mounts `Caddyfile` and two persistent volumes: `caddy_data` (TLS certs) and `caddy_config` (Caddy runtime config)
- Ports: `80:80`, `443:443`
- Domain configured via `DOMAIN` env var referenced in `Caddyfile`
- Automatic Let's Encrypt TLS once DNS A record points to server
- **Important:** losing `caddy_data` requires TLS cert re-issuance (Let's Encrypt rate-limits to 5 certs/week per domain). Back up this volume before destructive server operations.

## Files Produced

| File | Purpose |
|------|---------|
| `docker/Dockerfile.backend` | Python 3.12-slim image for FastAPI |
| `docker/backend-entrypoint.sh` | Shell entrypoint: migrate then exec uvicorn |
| `docker/Dockerfile.frontend` | Multi-stage Node 22 build for Next.js |
| `docker-compose.yml` | Orchestrates all 4 services |
| `Caddyfile` | Reverse proxy routing + automatic TLS |
| `.env.production.example` | Template for production secrets |
| `.dockerignore` (backend) | Excludes `.venv`, `__pycache__`, `.env*`, `tests/` from image |
| `.dockerignore` (frontend) | Excludes `node_modules`, `.next`, `.env*` from image |
| `scripts/provision.sh` | One-time server setup script |
| `scripts/deploy.sh` | Manual redeploy script |

## Environment Variables (`.env.production.example`)

```env
DOMAIN=yourdomain.com

# Postgres credentials — use only alphanumeric + _ in POSTGRES_PASSWORD
# (special characters like @, /, #, ? break URL interpolation)
POSTGRES_USER=loreforge
POSTGRES_PASSWORD=changeme_alphanumeric_only
POSTGRES_DB=loreforge

# DATABASE_URL is constructed automatically in docker-compose.yml:
# postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
# Do not set DATABASE_URL here.

# LLM provider — xAI Grok
XAI_API_KEY=

# Optional additional providers:
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
```

`DATABASE_URL` is constructed in `docker-compose.yml` via variable interpolation, eliminating manual credential sync. The password **must not contain** URL-special characters (`@`, `/`, `#`, `?`, `%`, `:`).

## Provisioning Script (`scripts/provision.sh`)

Runs once as root on a fresh Hetzner Ubuntu 24.04 instance:

1. `apt update && apt upgrade -y`
2. Install Docker (official repo, `install-docker.sh` method) + Docker Compose plugin
3. Install `git`, `ufw`
4. Configure UFW firewall (order matters — default-deny before enable to prevent open-firewall window):
   - `ufw default deny incoming`
   - `ufw default allow outgoing`
   - `ufw allow 22` (SSH — must be set before `ufw enable` or current session drops)
   - `ufw allow 80`
   - `ufw allow 443`
   - `ufw --force enable`
5. Create non-root `deploy` user, add to `docker` group
6. Clone repo to `/opt/loreforge` (HTTPS for public repo; SSH deploy key required for private repo — provision.sh prompts/documents this)
7. `chown -R deploy:deploy /opt/loreforge`
8. Print next-step instructions:
   - `cp /opt/loreforge/.env.production.example /opt/loreforge/.env`
   - `chmod 600 /opt/loreforge/.env && chown deploy:deploy /opt/loreforge/.env`
   - Edit `.env`: fill in `DOMAIN`, `POSTGRES_PASSWORD`, `XAI_API_KEY`
   - `su - deploy -c "cd /opt/loreforge && bash scripts/deploy.sh"`

**Docker + UFW note:** Docker bypasses UFW via direct iptables manipulation. Only Caddy exposes host ports in this setup, so this is safe. Any future `ports:` additions to internal services will bypass UFW silently — do not add host-port mappings to backend, frontend, or postgres.

The script is idempotent — safe to re-run without breaking a live deployment.

## Deploy Script (`scripts/deploy.sh`)

Runs as `deploy` user from `/opt/loreforge` for every update:

```bash
#!/bin/bash
set -euo pipefail
cd /opt/loreforge
git pull origin main
docker compose pull caddy postgres          # refresh pinned image-based services
docker compose build --pull backend frontend # rebuild + pull fresh base images
docker compose up -d
docker compose ps
```

Using `docker compose build --pull` ensures the `python:3.12-slim` and `node:22-alpine` base images are refreshed on each deploy (security patches). `docker compose pull` handles Caddy and Postgres image updates separately since they have no `build:` stanza.

## DNS Setup

After registering a domain, create an A record pointing to the Hetzner server's public IP. Caddy automatically obtains a Let's Encrypt certificate on the first request to port 80/443.

## Decisions & Trade-offs

- **Caddy over Nginx**: Automatic TLS with zero cert management. Single `Caddyfile` vs Nginx + Certbot cron.
- **Migrations on startup**: Simple for single-instance VPS; extract to a separate init container for multi-instance.
- **Single DB user**: App and migration user are the same. Deliberate VPS simplicity trade-off.
- **Manual deploy**: Sufficient for now; GitHub Actions CI/CD can be added later without changing the Docker setup.
- **`BACKEND_URL` runtime-only**: Next.js rewrites read env vars at server startup, not during `next build`. No ARG/ENV needed in the build stage.
- **UFW + Docker bypass**: Documented and mitigated by only exposing Caddy ports to the host.
- **Password character restriction**: Simpler than percent-encoding; acceptable for a single `.env` file managed by one operator.
