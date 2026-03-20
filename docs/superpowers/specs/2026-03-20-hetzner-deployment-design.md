# Hetzner Deployment Design

**Date:** 2026-03-20
**Status:** Approved

## Overview

Deploy LoreForge (Next.js frontend + FastAPI backend + PostgreSQL) to a Hetzner VPS running Ubuntu 24.04 LTS using Docker Compose with Caddy as the reverse proxy for automatic HTTPS.

## Architecture

```
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

All four services share a private Docker network (`loreforge_net`). Only Caddy exposes ports 80 and 443 to the host. Backend, frontend, and Postgres are network-internal only.

## Services

### Postgres
- Image: `postgres:16-alpine`
- Credentials via env: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Persistent volume: `postgres_data`
- No port exposed to host

### Backend
- Built from `docker/Dockerfile.backend` (Python 3.12-slim)
- Entrypoint: `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Migrations run automatically on each container start
- Env vars: `DATABASE_URL`, `XAI_API_KEY`, optional provider keys
- `depends_on: postgres` with healthcheck (prevents migrations running before Postgres is ready)

### Frontend
- Built from `docker/Dockerfile.frontend` (Node 22-alpine, multi-stage)
  - Stage 1: `npm ci && npm run build`
  - Stage 2: copy `.next` output, run `next start`
- Env var: `BACKEND_URL=http://backend:8000` consumed by `next.config.ts` rewrite
- `next.config.ts` updated to read backend URL from `BACKEND_URL` env var (falls back to `http://localhost:8001` for local dev)
- `depends_on: backend`

### Caddy
- Image: `caddy:2-alpine`
- Mounts `Caddyfile` (routing rules) and persistent `caddy_data` volume (TLS certs)
- Ports: `80:80`, `443:443`
- Domain configured via `DOMAIN` env var in `Caddyfile`
- Automatic Let's Encrypt TLS once DNS A record points to server

## Files Produced

| File | Purpose |
|------|---------|
| `docker/Dockerfile.backend` | Python 3.12-slim image for FastAPI |
| `docker/Dockerfile.frontend` | Multi-stage Node 22 build for Next.js |
| `docker-compose.yml` | Orchestrates all 4 services |
| `Caddyfile` | Reverse proxy routing + automatic TLS |
| `.env.production.example` | Template for production secrets |
| `scripts/provision.sh` | One-time server setup script |
| `scripts/deploy.sh` | Manual redeploy script |

## Environment Variables (`.env.production.example`)

```env
DOMAIN=yourdomain.com
POSTGRES_USER=loreforge
POSTGRES_PASSWORD=changeme
POSTGRES_DB=loreforge
XAI_API_KEY=
# Optional providers:
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
```

## Provisioning Script (`scripts/provision.sh`)

Runs once as root on a fresh Hetzner Ubuntu 24.04 instance:

1. `apt update && apt upgrade -y`
2. Install Docker (official repo) + Docker Compose plugin
3. Install git, ufw
4. Configure UFW firewall: allow 22, 80, 443; deny everything else
5. Create non-root `deploy` user, add to `docker` group
6. Clone repo to `/opt/loreforge`
7. Print next-step instructions (copy `.env`, fill secrets, run deploy)

The script is idempotent — safe to re-run without breaking a live deployment.

## Deploy Script (`scripts/deploy.sh`)

Runs as `deploy` user for every update:

1. `git pull origin main`
2. `docker compose pull` (refresh base images)
3. `docker compose up -d --build`
4. `docker compose ps` (verify running state)

## DNS Setup (post-domain-registration)

After registering a domain, create an A record pointing to the Hetzner server's public IP. Caddy will automatically obtain a Let's Encrypt certificate on the next request.

## Decisions & Trade-offs

- **Caddy over Nginx**: Automatic TLS with zero cert management. Single `Caddyfile` vs Nginx + Certbot cron.
- **Migrations on startup**: Simple for a single-instance VPS. For multi-instance, extract to a separate init container.
- **Manual deploy**: Sufficient for now. GitHub Actions CI/CD can be added later without changing the Docker setup.
- **next.config.ts env var**: The backend URL is only used server-side (Next.js rewrites run on the Node process), so `BACKEND_URL` does not need to be a `NEXT_PUBLIC_` variable.
