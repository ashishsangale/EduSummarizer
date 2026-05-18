#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found."
  exit 1
fi

# Use one Python interpreter for both installs and backend runtime.
if [[ -x "$ROOT_DIR/.venv/bin/python" ]]; then
  PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
else
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required but not found."
    exit 1
  fi
  PYTHON_BIN="$(command -v python3)"
fi

if ! "$PYTHON_BIN" -c "import uvicorn" >/dev/null 2>&1; then
  echo "uvicorn is not installed for $PYTHON_BIN"
  echo "Install backend deps with: $PYTHON_BIN -m pip install -r backend/requirements.txt"
  exit 1
fi

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting backend on http://localhost:8000"
"$PYTHON_BIN" -m uvicorn backend.main:app --reload &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:3000"
(
  cd frontend
  npm run dev
) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
