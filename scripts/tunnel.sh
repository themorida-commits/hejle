#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${1:-3000}"
BIN="$HOME/bin/cloudflared"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Run: curl -sL -o ~/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 && chmod +x ~/bin/cloudflared"
  exit 1
fi

if ! curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/" | grep -q '200'; then
  echo 'starting dev server...'
  nohup npm run dev >/tmp/hejle-dev.log 2>&1 &
  sleep 8
fi

echo "starting cloudflare tunnel on port ${PORT}..."
echo "press Ctrl+C to stop"
exec "$BIN" tunnel --url "http://localhost:${PORT}"
