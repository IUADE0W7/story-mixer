#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/loreforge}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

if [[ ! -d "${DEPLOY_DIR}/.git" ]]; then
	echo "Missing git repository at ${DEPLOY_DIR}" >&2
	exit 1
fi

echo "==============================================="
echo " LoreForge Deploy (No Docker)"
echo "==============================================="
echo "Dir   : ${DEPLOY_DIR}"
echo "Branch: ${DEPLOY_BRANCH}"
echo

cd "${DEPLOY_DIR}"

echo "[1/6] Pulling latest code"
git fetch origin "${DEPLOY_BRANCH}"
git checkout "${DEPLOY_BRANCH}"
git pull --ff-only origin "${DEPLOY_BRANCH}"

if [[ ! -f "${DEPLOY_DIR}/.env" ]]; then
	echo "Missing ${DEPLOY_DIR}/.env" >&2
	exit 1
fi

# shellcheck disable=SC1090
set -a
source "${DEPLOY_DIR}/.env"
set +a

if [[ -z "${JWT_SECRET:-}" ]]; then
	echo "Missing JWT_SECRET in ${DEPLOY_DIR}/.env" >&2
	echo "Set JWT_SECRET and run deploy again." >&2
	exit 1
fi

# Ensure Google OAuth client IDs are present
if [[ -z "${GOOGLE_CLIENT_ID:-}" || -z "${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}" ]]; then
	echo "Missing Google OAuth client IDs in ${DEPLOY_DIR}/.env" >&2
	echo "Please set GOOGLE_CLIENT_ID and NEXT_PUBLIC_GOOGLE_CLIENT_ID in ${DEPLOY_DIR}/.env and run deploy again." >&2
	exit 1
fi

POSTGRES_USER="${POSTGRES_USER:-loreforge}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
POSTGRES_DB="${POSTGRES_DB:-loreforge}"
DATABASE_URL="postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"

echo "[2/6] Updating backend dependencies"
. "${DEPLOY_DIR}/.venv/bin/activate"
pip install --upgrade pip
pip install -e backend

echo "[3/6] Validating backend configuration"
cd "${DEPLOY_DIR}/backend"
if ! DATABASE_URL="${DATABASE_URL}" "${DEPLOY_DIR}/.venv/bin/python" - <<'PY'
from pydantic import ValidationError

from app.config import AppSettings

try:
	AppSettings()
except ValidationError as exc:
	print("Backend settings validation failed.")
	for error in exc.errors():
		field_path = ".".join(str(part) for part in error.get("loc", []))
		print(f"- {field_path}: {error.get('msg', 'invalid value')}")
	raise SystemExit(1)
PY
then
	echo "Fix ${DEPLOY_DIR}/.env and run deploy again." >&2
	exit 1
fi

echo "[4/7] Checking database connectivity"
if ! POSTGRES_USER="${POSTGRES_USER}" POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" POSTGRES_DB="${POSTGRES_DB}" "${DEPLOY_DIR}/.venv/bin/python" - <<'PY'
import os

import psycopg

user = os.environ["POSTGRES_USER"]
password = os.environ["POSTGRES_PASSWORD"]
dbname = os.environ["POSTGRES_DB"]

try:
	with psycopg.connect(
		host="127.0.0.1",
		port=5432,
		user=user,
		password=password,
		dbname=dbname,
	) as conn:
		with conn.cursor() as cur:
			cur.execute("SELECT 1")
except Exception as exc:  # pragma: no cover - deploy-time guard
	print("Database connection precheck failed.")
	print(str(exc))
	print("Sync role password with .env using:")
	print(
		"sudo -u postgres psql "
		f"-v role_name=\"{user}\" "
		f"-v role_password=\"{password}\" "
		"-c \"DO $$ BEGIN EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role_name', :'role_password'); END $$;\""
	)
	raise SystemExit(1)
PY
then
	echo "Database check failed. Resolve credentials and run deploy again." >&2
	exit 1
fi

echo "[5/7] Applying database migrations"
cd "${DEPLOY_DIR}/backend"
DATABASE_URL="${DATABASE_URL}" "${DEPLOY_DIR}/.venv/bin/alembic" upgrade head

echo "[6/7] Updating frontend dependencies and building"
cd "${DEPLOY_DIR}/frontend"
npm ci
npm run build

# Next.js standalone server requires static/public assets copied into standalone tree.
if [[ -f "${DEPLOY_DIR}/frontend/.next/standalone/server.js" ]]; then
	echo "[6.1] Preparing standalone static/public assets"
	mkdir -p "${DEPLOY_DIR}/frontend/.next/standalone/.next"
	rm -rf "${DEPLOY_DIR}/frontend/.next/standalone/.next/static"
	cp -a "${DEPLOY_DIR}/frontend/.next/static" "${DEPLOY_DIR}/frontend/.next/standalone/.next/static"
	if [[ -d "${DEPLOY_DIR}/frontend/public" ]]; then
		rm -rf "${DEPLOY_DIR}/frontend/.next/standalone/public"
		cp -a "${DEPLOY_DIR}/frontend/public" "${DEPLOY_DIR}/frontend/.next/standalone/public"
	fi
fi

# Create atomic frontend release: copy built artifacts to a timestamped release and swap symlink
RELEASE_TS=$(date +%s)
RELEASE_DIR="${DEPLOY_DIR}/releases/${RELEASE_TS}"
echo "[6.2] Creating frontend release ${RELEASE_DIR}"
mkdir -p "${RELEASE_DIR}"
# Copy frontend sources and built artifacts (exclude node_modules and .git)
if command -v rsync >/dev/null 2>&1; then
	# Exclude only top-level node_modules so standalone runtime deps are preserved.
	rsync -a --delete --exclude='/.git' --exclude='/node_modules' "${DEPLOY_DIR}/frontend/" "${RELEASE_DIR}/frontend/"
else
	echo "rsync not found; falling back to cp for release copy"
	mkdir -p "${RELEASE_DIR}/frontend"
	cp -a "${DEPLOY_DIR}/frontend/." "${RELEASE_DIR}/frontend/"
	rm -rf "${RELEASE_DIR}/frontend/.git" "${RELEASE_DIR}/frontend/node_modules"
fi
# Ensure the symlink `frontend_current` atomically points to new release
ln -sfn "${RELEASE_DIR}/frontend" "${DEPLOY_DIR}/frontend_current"
echo "[6.3] Frontend symlinked to ${DEPLOY_DIR}/frontend_current"

# Keep only the newest 5 releases to avoid unbounded disk growth.
if [[ -d "${DEPLOY_DIR}/releases" ]]; then
	echo "[6.3.1] Pruning old frontend releases (keep 5)"
	ls -1dt "${DEPLOY_DIR}/releases"/* 2>/dev/null | tail -n +6 | xargs -r rm -rf
fi

# If Next.js produced a standalone build, update the systemd unit to start the standalone server
echo "[6.4] Ensuring systemd unit uses frontend_current"
if [[ "${EUID}" -eq 0 ]] || sudo -n true >/dev/null 2>&1; then
	sudo bash -c "cat >/etc/systemd/system/loreforge-frontend.service <<'UNIT'
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
UNIT"
	sudo systemctl daemon-reload
else
	echo "Skipping systemd unit rewrite (sudo without password not available)."
fi


# Update Caddyfile if DOMAIN is set to a real domain
if [[ -n "${DOMAIN:-}" && "${DOMAIN}" != "yourdomain.com" ]]; then
    if [[ "${EUID}" -eq 0 ]] || sudo -n true >/dev/null 2>&1; then
		echo "[6.2] Updating /etc/caddy/Caddyfile for ${DOMAIN}"
		sudo bash -c "cat >/etc/caddy/Caddyfile <<EOF
${DOMAIN} {
	# API
	reverse_proxy /api/v1/* 127.0.0.1:8000

	# Frontend
	reverse_proxy * 127.0.0.1:3000

	# Cache headers for Next.js hashed assets
	@nextstatic path /_next/static/*
	header @nextstatic Cache-Control \"public, max-age=31536000, immutable\"

	@nextchunks path /_next/static/chunks/*
	header @nextchunks Cache-Control \"public, max-age=31536000, immutable\"

	# Keep HTML short-lived so clients pick up new builds quickly
	@root path /
	header @root Cache-Control \"public, max-age=60\"
}
EOF"
		echo "Validating Caddyfile"
		if ! sudo caddy validate --config /etc/caddy/Caddyfile; then
			echo "Caddyfile validation failed" >&2
			exit 1
		fi
		sudo systemctl restart caddy
    else
		echo "Skipping Caddyfile rewrite (sudo without password not available)."
    fi
fi

echo "[7/7] Restarting services"
sudo systemctl restart loreforge-backend
sudo systemctl restart loreforge-frontend
sudo systemctl restart caddy

echo "Service status"
sudo systemctl --no-pager --full status loreforge-backend | sed -n '1,12p'
sudo systemctl --no-pager --full status loreforge-frontend | sed -n '1,12p'
sudo systemctl --no-pager --full status caddy | sed -n '1,12p'

echo
echo "Deploy complete."

