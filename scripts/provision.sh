#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/IUADE0W7/story-mixer}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/loreforge}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Run this script as root (sudo)." >&2
    exit 1
fi

echo "==============================================="
echo " LoreForge Hetzner Provision (No Docker)"
echo "==============================================="
echo "Host: $(hostname)"
echo "Repo: ${REPO_URL}"
echo "Dir : ${DEPLOY_DIR}"
echo "User: ${DEPLOY_USER}"
echo

echo "[1/11] Updating system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

echo "[2/11] Installing base dependencies"
apt-get install -y \
    ca-certificates \
    curl \
    git \
    jq \
    ufw \
    postgresql \
    postgresql-contrib \
    python3 \
    python3-venv \
    python3-pip \
    caddy \
    fail2ban

echo "[3/11] Installing Node.js 20"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE '^v(2[0-9]|1[89])\.'; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "Checking Python version"
if ! python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 12) else 1)'; then
    echo "Python 3.12+ is required. Current version: $(python3 --version)" >&2
    exit 1
fi

echo "[4/11] Configuring firewall and fail2ban"
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

cat >/etc/fail2ban/jail.d/sshd.local <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable fail2ban
systemctl restart fail2ban

echo "[5/11] Creating deploy user"
if ! id "${DEPLOY_USER}" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "${DEPLOY_USER}"
fi

echo "[6/11] Cloning/updating repository"
if [[ -d "${DEPLOY_DIR}/.git" ]]; then
    git -C "${DEPLOY_DIR}" fetch --all --prune
    git -C "${DEPLOY_DIR}" checkout "${DEPLOY_BRANCH}"
    git -C "${DEPLOY_DIR}" pull --ff-only origin "${DEPLOY_BRANCH}"
else
    git clone --branch "${DEPLOY_BRANCH}" "${REPO_URL}" "${DEPLOY_DIR}"
fi
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_DIR}"

echo "[7/11] Preparing environment file"
if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
    cp "${DEPLOY_DIR}/.env.production.example" "${DEPLOY_DIR}/.env"
fi
chown "${DEPLOY_USER}:${DEPLOY_USER}" "${DEPLOY_DIR}/.env"
chmod 600 "${DEPLOY_DIR}/.env"

# shellcheck disable=SC1090
source "${DEPLOY_DIR}/.env"

POSTGRES_USER="${POSTGRES_USER:-loreforge}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
POSTGRES_DB="${POSTGRES_DB:-loreforge}"
DOMAIN="${DOMAIN:-yourdomain.com}"
DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"

if ! grep -q '^JWT_SECRET=' "${DEPLOY_DIR}/.env"; then
    GENERATED_JWT_SECRET="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
    printf '\nJWT_SECRET=%s\n' "${GENERATED_JWT_SECRET}" >>"${DEPLOY_DIR}/.env"
fi

# Ensure Google OAuth client IDs exist in the env file. If missing, add placeholders.
if ! grep -q '^GOOGLE_CLIENT_ID=' "${DEPLOY_DIR}/.env"; then
    printf '\n# Google OAuth client IDs (set via Google Cloud Console)\nGOOGLE_CLIENT_ID=\nNEXT_PUBLIC_GOOGLE_CLIENT_ID=\n' >>"${DEPLOY_DIR}/.env"
else
    # If GOOGLE_CLIENT_ID is present but NEXT_PUBLIC_GOOGLE_CLIENT_ID is missing,
    # propagate the value so frontend has access, unless it's explicitly set.
    if ! grep -q '^NEXT_PUBLIC_GOOGLE_CLIENT_ID=' "${DEPLOY_DIR}/.env"; then
        GOOGLE_VAL=$(grep -E '^GOOGLE_CLIENT_ID=' "${DEPLOY_DIR}/.env" | sed -E 's/^GOOGLE_CLIENT_ID=//')
        printf '\nNEXT_PUBLIC_GOOGLE_CLIENT_ID=%s\n' "${GOOGLE_VAL}" >>"${DEPLOY_DIR}/.env"
    fi
fi

echo "[8/11] Configuring PostgreSQL"
systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql \
    -v role_name="${POSTGRES_USER}" \
    -v role_password="${POSTGRES_PASSWORD}" \
    <<'SQL'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name') THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', :'role_name', :'role_password');
    ELSE
        EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role_name', :'role_password');
    END IF;
END $$;
SQL

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1 || \
    sudo -u postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"

echo "[9/11] Installing app dependencies"
su - "${DEPLOY_USER}" -c "cd '${DEPLOY_DIR}' && python3 -m venv .venv"
su - "${DEPLOY_USER}" -c "cd '${DEPLOY_DIR}' && . .venv/bin/activate && pip install --upgrade pip && pip install -e backend"
su - "${DEPLOY_USER}" -c "cd '${DEPLOY_DIR}/frontend' && . ${DEPLOY_DIR}/.env && npm ci && npm run build"

echo "[10/11] Creating systemd services"
cat >/etc/systemd/system/loreforge-backend.service <<EOF
[Unit]
Description=LoreForge Backend (FastAPI)
After=network.target postgresql.service

[Service]
Type=simple
User=${DEPLOY_USER}
Group=${DEPLOY_USER}
WorkingDirectory=${DEPLOY_DIR}/backend
ExecStart=/bin/bash -lc 'set -a; source ${DEPLOY_DIR}/.env; set +a; export DATABASE_URL=${DATABASE_URL}; exec ${DEPLOY_DIR}/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/loreforge-frontend.service <<EOF
[Unit]
Description=LoreForge Frontend (Next.js)
After=network.target loreforge-backend.service

[Service]
Type=simple
User=${DEPLOY_USER}
Group=${DEPLOY_USER}
WorkingDirectory=${DEPLOY_DIR}/frontend_current
Environment=NODE_ENV=production
Environment=BACKEND_URL=http://127.0.0.1:8000
ExecStart=/bin/bash -lc 'set -a; source ${DEPLOY_DIR}/.env; set +a; export BACKEND_URL=http://127.0.0.1:8000; if [ -f "${DEPLOY_DIR}/frontend_current/.next/standalone/server.js" ]; then exec /usr/bin/node "${DEPLOY_DIR}/frontend_current/.next/standalone/server.js"; else exec /usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000; fi'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

if [[ "${DOMAIN}" == "yourdomain.com" || -z "${DOMAIN}" ]]; then
    cat >/etc/caddy/Caddyfile <<'EOF'
:80 {
    reverse_proxy /api/v1/* 127.0.0.1:8000
    reverse_proxy * 127.0.0.1:3000
}
EOF
else
    cat >/etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    # API
    reverse_proxy /api/v1/* 127.0.0.1:8000

    # Frontend app
    reverse_proxy * 127.0.0.1:3000

    # Cache headers: immutable hashed assets and short-lived HTML
    @nextstatic path /_next/static/*
    header @nextstatic Cache-Control "public, max-age=31536000, immutable"

    @nextchunks path /_next/static/chunks/*
    header @nextchunks Cache-Control "public, max-age=31536000, immutable"

    @root path /
    header @root Cache-Control "public, max-age=60"
}
EOF
fi

echo "[11/11] Enabling and starting services"
cat >/etc/sudoers.d/loreforge-deploy <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD:/usr/bin/systemctl restart loreforge-backend,/usr/bin/systemctl restart loreforge-frontend,/usr/bin/systemctl restart caddy,/usr/bin/systemctl status loreforge-backend,/usr/bin/systemctl status loreforge-frontend,/usr/bin/systemctl status caddy
EOF
chmod 440 /etc/sudoers.d/loreforge-deploy

systemctl daemon-reload
systemctl enable loreforge-backend loreforge-frontend caddy
systemctl restart loreforge-backend loreforge-frontend caddy

echo
echo "Provisioning complete."
echo
echo "Next steps:"
echo "1) Edit ${DEPLOY_DIR}/.env with real DOMAIN, API keys and Google OAuth client IDs (GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID)"
echo "2) Point DNS A record for ${DOMAIN} to this server IP"
echo "3) Deploy updates with: su - ${DEPLOY_USER} -c 'cd ${DEPLOY_DIR} && bash scripts/deploy.sh'"
if [[ "${DOMAIN}" == "yourdomain.com" || -z "${DOMAIN}" ]]; then
    echo "4) Set a real DOMAIN in ${DEPLOY_DIR}/.env and run: sudo systemctl restart caddy"
fi
echo
echo "Caddy handles TLS issuance and automatic certificate renewal."

