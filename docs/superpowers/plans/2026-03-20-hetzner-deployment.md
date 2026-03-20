# Hetzner Deployment Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy LoreForge to a Hetzner Ubuntu 24.04 VPS using Docker Compose with Caddy for automatic HTTPS.

**Architecture:** Four Docker services (postgres, backend, frontend, caddy) on a shared private network. Only Caddy exposes host ports 80/443. Backend runs Alembic migrations on startup then starts Uvicorn. Frontend is built with Next.js standalone output and proxies `/api/v1/*` to the backend using a runtime env var.

**Tech Stack:** Docker Compose v2, Caddy 2, Python 3.12-slim, Node 22-alpine, postgres:16-alpine, Next.js 15 standalone output.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `.dockerignore` | Create | Root-level ignore file for both Docker builds |
| `frontend/next.config.ts` | Modify | Add `output: 'standalone'` and read `BACKEND_URL` from env |
| `docker/backend-entrypoint.sh` | Create | Shell script: migrate then `exec uvicorn` |
| `docker/Dockerfile.backend` | Create | Python 3.12-slim image; installs backend package |
| `docker/Dockerfile.frontend` | Create | Multi-stage Node 22 build; standalone Next.js output |
| `docker-compose.yml` | Create | Orchestrates all 4 services with volumes and healthchecks |
| `Caddyfile` | Create | Reverse proxy routing + automatic Let's Encrypt TLS |
| `.env.production.example` | Create | Template for production secrets |
| `scripts/provision.sh` | Create | One-time Hetzner Ubuntu 24.04 setup script |
| `scripts/deploy.sh` | Create | Manual redeploy script (git pull + rebuild) |

---

### Task 1: Root .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create `.dockerignore` at the repo root**

```
# Python
.venv/
**/__pycache__/
**/*.pyc
**/*.pyo
**/*.pyd
backend/tests/
backend/.pytest_cache/
**/*.egg-info/

# Node
frontend/node_modules/
frontend/.next/

# Env / secrets — never bake into images
.env
.env.*
!.env.production.example

# Git and docs
.git/
docs/

# Misc
*.log
.DS_Store
```

- [ ] **Step 2: Verify syntax (no tool needed — just confirm the file exists)**

```bash
cat .dockerignore
```

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: add root .dockerignore for Docker builds"
```

---

### Task 2: Update next.config.ts

**Files:**
- Modify: `frontend/next.config.ts`

The current file hardcodes `http://localhost:8001`. We add `output: 'standalone'` for Docker-optimised production builds and read `BACKEND_URL` at server startup.

- [ ] **Step 1: Update `frontend/next.config.ts`**

Replace the entire file contents with:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8001";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Verify the build still works locally**

```bash
cd frontend && npm run build
```

Expected: build completes without errors. The `.next/standalone/` directory is created.

- [ ] **Step 3: Verify the standalone directory was created**

```bash
ls frontend/.next/standalone/
```

Expected: `server.js` present in the standalone output.

- [ ] **Step 4: Commit**

```bash
git add frontend/next.config.ts
git commit -m "feat: add standalone output and BACKEND_URL env var to next.config"
```

---

### Task 3: Backend Docker artifacts

**Files:**
- Create: `docker/backend-entrypoint.sh`
- Create: `docker/Dockerfile.backend`

- [ ] **Step 1: Create `docker/` directory**

```bash
mkdir -p docker
```

- [ ] **Step 2: Create `docker/backend-entrypoint.sh`**

```bash
#!/bin/sh
set -e

echo "Running Alembic migrations..."
alembic upgrade head

echo "Starting Uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The `exec` replaces the shell process so Uvicorn receives `SIGTERM` from `docker stop` (graceful shutdown).

- [ ] **Step 3: Make the entrypoint executable**

```bash
chmod +x docker/backend-entrypoint.sh
```

- [ ] **Step 4: Create `docker/Dockerfile.backend`**

Build context is the repo root (`.`). All paths are relative to root.

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install build tools needed by some Python packages
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy backend source and install package + dependencies
COPY backend/ .
RUN pip install --no-cache-dir .

# Copy entrypoint script
COPY docker/backend-entrypoint.sh /entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
```

- [ ] **Step 5: Verify the Dockerfile builds**

```bash
docker build -f docker/Dockerfile.backend -t loreforge-backend-test .
```

Expected: build succeeds, image tagged `loreforge-backend-test`.

- [ ] **Step 6: Clean up test image**

```bash
docker rmi loreforge-backend-test
```

- [ ] **Step 7: Commit**

```bash
git add docker/backend-entrypoint.sh docker/Dockerfile.backend
git commit -m "feat: add backend Dockerfile and entrypoint script"
```

---

### Task 4: Frontend Dockerfile

**Files:**
- Create: `docker/Dockerfile.frontend`

Build context is the repo root (`.`). Stage 1 builds the Next.js app; Stage 2 runs the standalone server.

- [ ] **Step 1: Create `docker/Dockerfile.frontend`**

```dockerfile
# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first for layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ .
RUN npm run build

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output is self-contained: includes Node server + minimal node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 2: Verify the Dockerfile builds**

```bash
docker build -f docker/Dockerfile.frontend -t loreforge-frontend-test .
```

Expected: build succeeds in two stages, final image tagged `loreforge-frontend-test`.

- [ ] **Step 3: Clean up test image**

```bash
docker rmi loreforge-frontend-test
```

- [ ] **Step 4: Commit**

```bash
git add docker/Dockerfile.frontend
git commit -m "feat: add frontend multi-stage Dockerfile with standalone output"
```

---

### Task 5: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
networks:
  loreforge_net:
    driver: bridge

volumes:
  postgres_data:
  caddy_data:
  caddy_config:

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - loreforge_net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 10
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      XAI_API_KEY: ${XAI_API_KEY:-}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
      OPENAI_API_KEY: ${OPENAI_API_KEY:-}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY:-}
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - loreforge_net
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    environment:
      BACKEND_URL: http://backend:8000
    depends_on:
      - backend
    networks:
      - loreforge_net
    restart: unless-stopped

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: ${DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - loreforge_net
    restart: unless-stopped
```

- [ ] **Step 2: Create a minimal `.env` for local validation**

```bash
cat > .env.test <<'EOF'
DOMAIN=localhost
POSTGRES_USER=loreforge
POSTGRES_PASSWORD=testpassword
POSTGRES_DB=loreforge
XAI_API_KEY=test
EOF
```

- [ ] **Step 3: Validate the compose file**

```bash
env $(cat .env.test | xargs) docker compose config
```

Expected: full resolved YAML printed with no errors. `DATABASE_URL` should show the interpolated value.

- [ ] **Step 4: Remove test env file**

```bash
rm .env.test
```

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml with all 4 services"
```

---

### Task 6: Caddyfile

**Files:**
- Create: `Caddyfile`

- [ ] **Step 1: Create `Caddyfile`**

```caddyfile
{$DOMAIN} {
    # API requests go to FastAPI backend
    reverse_proxy /api/v1/* backend:8000

    # Everything else goes to Next.js frontend
    reverse_proxy * frontend:3000
}
```

`{$DOMAIN}` is Caddy's syntax for environment variable substitution. The `DOMAIN` env var is set by docker-compose.yml from `.env`.

- [ ] **Step 2: Validate Caddyfile syntax using the Caddy Docker image**

```bash
docker run --rm -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -e DOMAIN=example.com \
  caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

Expected: `Valid configuration` (or similar success message).

- [ ] **Step 3: Commit**

```bash
git add Caddyfile
git commit -m "feat: add Caddyfile for Caddy reverse proxy with automatic TLS"
```

---

### Task 7: .env.production.example

**Files:**
- Create: `.env.production.example`

- [ ] **Step 1: Create `.env.production.example`**

```env
# ── Domain ────────────────────────────────────────────────────────────────────
# Your registered domain pointing to this server's public IP
DOMAIN=yourdomain.com

# ── Postgres ──────────────────────────────────────────────────────────────────
# IMPORTANT: Use only alphanumeric characters and underscores in the password.
# Special characters (@, /, #, ?, %, :) break the DATABASE_URL interpolation.
POSTGRES_USER=loreforge
POSTGRES_PASSWORD=changeme_use_alphanumeric_only
POSTGRES_DB=loreforge

# DATABASE_URL is constructed automatically in docker-compose.yml from the
# POSTGRES_* variables above. Do NOT set it manually here.

# ── LLM Provider ─────────────────────────────────────────────────────────────
# xAI Grok (primary provider)
XAI_API_KEY=

# Optional additional providers (leave blank if unused):
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
```

- [ ] **Step 2: Verify the example file is in .dockerignore's exception list**

The root `.dockerignore` contains `!.env.production.example` which allows it to be committed and optionally included in the build context. Confirm:

```bash
grep 'env.production.example' .dockerignore
```

Expected: `!.env.production.example`

- [ ] **Step 3: Commit**

```bash
git add .env.production.example
git commit -m "chore: add .env.production.example template for production deployment"
```

---

### Task 8: scripts/provision.sh

**Files:**
- Create: `scripts/provision.sh`

This script runs **once as root** on a fresh Hetzner Ubuntu 24.04 instance. It is idempotent.

- [ ] **Step 1: Create `scripts/` directory**

```bash
mkdir -p scripts
```

- [ ] **Step 2: Create `scripts/provision.sh`**

```bash
#!/bin/bash
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# Update REPO_URL before running on the server
REPO_URL="https://github.com/YOUR_ORG/story-mixer.git"
DEPLOY_DIR="/opt/loreforge"
DEPLOY_USER="deploy"

echo "╔══════════════════════════════════════════════════════╗"
echo "║     LoreForge Hetzner Provisioning Script            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Running as: $(whoami) on $(hostname)"
echo ""

# ── 1. System update ──────────────────────────────────────────────────────────
echo "[1/7] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# ── 2. Install Docker (official repo) ─────────────────────────────────────────
echo "[2/7] Installing Docker..."
if command -v docker &>/dev/null; then
    echo "  Docker already installed: $(docker --version)"
else
    apt-get install -y ca-certificates curl
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo \
        "deb [arch=$(dpkg --print-architecture) \
        signed-by=/etc/apt/keyrings/docker.asc] \
        https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        | tee /etc/apt/sources.list.d/docker.list >/dev/null
    apt-get update -y
    apt-get install -y \
        docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
    echo "  Installed: $(docker --version)"
fi

systemctl enable docker
systemctl start docker

# ── 3. Install git and ufw ────────────────────────────────────────────────────
echo "[3/7] Installing git and ufw..."
apt-get install -y git ufw

# ── 4. Configure UFW firewall ─────────────────────────────────────────────────
echo "[4/7] Configuring UFW firewall..."
# Set default policy BEFORE enabling to avoid open-firewall window
ufw default deny incoming
ufw default allow outgoing
# Allow SSH BEFORE enabling or current session will drop
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
echo "  Firewall status:"
ufw status verbose

# NOTE: Docker bypasses UFW by directly manipulating iptables.
# Only Caddy exposes host ports (80, 443) in this setup — this is safe.
# Do NOT add ports: mappings to backend, frontend, or postgres in docker-compose.yml.

# ── 5. Create deploy user ─────────────────────────────────────────────────────
echo "[5/7] Creating deploy user..."
if id "$DEPLOY_USER" &>/dev/null; then
    echo "  User '$DEPLOY_USER' already exists."
else
    useradd -m -s /bin/bash "$DEPLOY_USER"
    echo "  Created user: $DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
echo "  '$DEPLOY_USER' added to docker group."

# ── 6. Clone repository ───────────────────────────────────────────────────────
echo "[6/7] Setting up repository at $DEPLOY_DIR..."
if [ -d "$DEPLOY_DIR/.git" ]; then
    echo "  Repository already exists, skipping clone."
else
    # For private repos: set up an SSH deploy key or GitHub PAT before this step.
    # See: https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys
    git clone "$REPO_URL" "$DEPLOY_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"

# ── 7. Print next steps ───────────────────────────────────────────────────────
echo ""
echo "[7/7] Provisioning complete!"
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                   NEXT STEPS                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "1. Create the .env file:"
echo "   cp $DEPLOY_DIR/.env.production.example $DEPLOY_DIR/.env"
echo "   chmod 600 $DEPLOY_DIR/.env"
echo "   chown $DEPLOY_USER:$DEPLOY_USER $DEPLOY_DIR/.env"
echo ""
echo "2. Edit $DEPLOY_DIR/.env and set:"
echo "   DOMAIN=your-registered-domain.com"
echo "   POSTGRES_PASSWORD=a_secure_alphanumeric_password"
echo "   XAI_API_KEY=your_xai_api_key"
echo ""
echo "3. Point your domain's DNS A record to this server's IP:"
echo "   $(curl -s ifconfig.me 2>/dev/null || echo '<run: curl ifconfig.me>')"
echo ""
echo "4. Run the first deployment:"
echo "   su - $DEPLOY_USER -c 'cd $DEPLOY_DIR && bash scripts/deploy.sh'"
echo ""
echo "Caddy will obtain a TLS certificate automatically on first request."
```

- [ ] **Step 3: Make it executable**

```bash
chmod +x scripts/provision.sh
```

- [ ] **Step 4: Check for shell syntax errors**

```bash
bash -n scripts/provision.sh
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add scripts/provision.sh
git commit -m "feat: add Hetzner provisioning script (provision.sh)"
```

---

### Task 9: scripts/deploy.sh

**Files:**
- Create: `scripts/deploy.sh`

Runs as the `deploy` user on the server for every update.

- [ ] **Step 1: Create `scripts/deploy.sh`**

```bash
#!/bin/bash
set -euo pipefail

DEPLOY_DIR="/opt/loreforge"

echo "╔══════════════════════════════════════════════════════╗"
echo "║           LoreForge Deploy                          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

cd "$DEPLOY_DIR"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo "[1/4] Pulling latest code from main..."
git pull origin main

# ── 2. Refresh base images for image-based services ───────────────────────────
echo "[2/4] Pulling latest caddy and postgres images..."
docker compose pull caddy postgres

# ── 3. Rebuild built services with fresh base images, then start ──────────────
echo "[3/4] Building backend and frontend (with base image refresh)..."
docker compose build --pull backend frontend

echo "      Starting all services..."
docker compose up -d

# ── 4. Show status ────────────────────────────────────────────────────────────
echo "[4/4] Service status:"
docker compose ps

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Deploy complete!                       ║"
echo "╚══════════════════════════════════════════════════════╝"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/deploy.sh
```

- [ ] **Step 3: Check for shell syntax errors**

```bash
bash -n scripts/deploy.sh
```

Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add scripts/deploy.sh
git commit -m "feat: add manual deploy script (deploy.sh)"
```

---

### Task 10: Local end-to-end build verification

This task verifies all Docker artifacts build successfully together before pushing.

- [ ] **Step 1: Create a local test `.env`**

```bash
cat > .env <<'EOF'
DOMAIN=localhost
POSTGRES_USER=loreforge
POSTGRES_PASSWORD=testpassword123
POSTGRES_DB=loreforge
XAI_API_KEY=test_key
EOF
chmod 600 .env
```

- [ ] **Step 2: Validate the full compose configuration**

```bash
docker compose config
```

Expected: full resolved YAML with no errors. Verify `DATABASE_URL` is correctly interpolated.

- [ ] **Step 3: Build all services**

```bash
docker compose build --pull
```

Expected: all four services build without errors. This may take several minutes on first run.

- [ ] **Step 4: Remove the local test `.env`**

```bash
rm .env
```

**Do not commit `.env`** — it is in `.gitignore` (or should be — verify with `git status`). If `.env` appears in `git status`, add it to `.gitignore` before proceeding.

```bash
git status  # .env should NOT appear as untracked
```

- [ ] **Step 5: Final commit with any remaining changes**

```bash
git status
# If everything is clean:
git log --oneline -10  # Review all commits in this feature
```

---

## Post-Deployment Checklist (manual — on the Hetzner server)

After running `provision.sh` and `deploy.sh` on the server:

1. **Check all containers are running:** `docker compose ps` — all should be `Up`
2. **Check backend logs for migration success:** `docker compose logs backend | grep -E 'migration|alembic|ERROR'`
3. **Check Caddy obtained TLS cert:** `docker compose logs caddy | grep -i 'certificate\|tls\|acme'`
4. **Test API endpoint:** `curl -s https://yourdomain.com/api/v1/health` (adjust path to your health endpoint)
5. **Test frontend loads:** Open `https://yourdomain.com` in browser
