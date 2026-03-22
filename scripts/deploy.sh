#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/loreforge}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

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

echo "[4/6] Applying database migrations"
cd "${DEPLOY_DIR}/backend"
DATABASE_URL="${DATABASE_URL}" "${DEPLOY_DIR}/.venv/bin/alembic" upgrade head

echo "[5/6] Updating frontend dependencies and building"
cd "${DEPLOY_DIR}/frontend"
npm ci
npm run build

echo "[6/6] Restarting services"
sudo systemctl restart loreforge-backend
sudo systemctl restart loreforge-frontend
sudo systemctl restart caddy

echo "[7/7] Service status"
sudo systemctl --no-pager --full status loreforge-backend | sed -n '1,12p'
sudo systemctl --no-pager --full status loreforge-frontend | sed -n '1,12p'
sudo systemctl --no-pager --full status caddy | sed -n '1,12p'

echo
echo "Deploy complete."

