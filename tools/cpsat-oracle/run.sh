#!/usr/bin/env bash
# CP-SAT quality oracle — end-to-end runner.
#   1. ensures a local venv with ortools (created on first run);
#   2. regenerates the fixtures from the product code in THIS repo;
#   3. runs the oracle (TS solver vs CP-SAT, 30s budget per case).
# TMPDIR is kept under the repo: /tmp on the dev VM is a small tmpfs.
set -euo pipefail

ORACLE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ORACLE_DIR/../.." && pwd)"
cd "$REPO_ROOT"

export TMPDIR="$ORACLE_DIR/.tmp"
mkdir -p "$TMPDIR"

VENV="$ORACLE_DIR/.venv"
if [ ! -x "$VENV/bin/python" ]; then
  echo "[oracle] creating venv + installing ortools (first run only)..."
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet -r "$ORACLE_DIR/requirements.txt"
fi

echo "[oracle] regenerating fixtures from product code..."
node --import tsx "$ORACLE_DIR/export_fixtures.ts"

echo "[oracle] running oracle..."
"$VENV/bin/python" "$ORACLE_DIR/oracle.py"
