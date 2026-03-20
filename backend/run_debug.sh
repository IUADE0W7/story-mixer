#!/usr/bin/env bash
set -euo pipefail

# Run the backend under debugpy so a debugger (e.g. VS Code) can attach.
# Usage: ./run_debug.sh [host] [port]
# Defaults: host=127.0.0.1 port=8001

HOST="${1:-127.0.0.1}"
PORT="${2:-8001}"
LOG_LEVEL="${LOG_LEVEL:-DEBUG}"

# Python executable to use (defaults to project .venv)
PYTHON="${PYTHON:-.venv/bin/python}"

if [ ! -x "${PYTHON}" ]; then
  echo "Python executable not found or not executable: ${PYTHON}" >&2
  echo "Activate your virtualenv or set PYTHON to the interpreter path." >&2
  exit 2
fi

if ! "${PYTHON}" -c "import debugpy" >/dev/null 2>&1; then
  echo "debugpy is not installed in ${PYTHON}. Install it with:" >&2
  echo "  ${PYTHON} -m pip install debugpy" >&2
  exit 3
fi

echo "Starting backend with debugpy listening on 0.0.0.0:5678 (will wait for client), LOG_LEVEL=${LOG_LEVEL}"
exec env LOG_LEVEL="${LOG_LEVEL}" "${PYTHON}" -m debugpy --listen 0.0.0.0:5678 --wait-for-client -m uvicorn app.main:app --host "${HOST}" --port "${PORT}" --reload
