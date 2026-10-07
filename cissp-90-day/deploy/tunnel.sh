#!/bin/bash
# Expose the tracker running on THIS machine to the internet through a free
# Cloudflare quick tunnel, so you can open it from your phone when you are away.
#
#   1. start the server:   APP_PASSWORD=secret node server.js
#   2. in another shell:   ./deploy/tunnel.sh
#   3. open the printed https://....trycloudflare.com link on your phone
#
# The link lives only while this script runs and changes every time it starts.
# For a permanent address use a cloud deploy (deploy/aws, azure, gcp) instead.
set -euo pipefail

PORT="${PORT:-8080}"

if [ -z "${APP_PASSWORD:-}" ]; then
  echo "WARNING: APP_PASSWORD is not set in this shell. Make sure the server was started with"
  echo "         APP_PASSWORD=<something strong>, otherwise anyone with the link can edit your tracker."
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it:"
  echo "  macOS:   brew install cloudflared"
  echo "  Windows: winget install Cloudflare.cloudflared"
  echo "  Debian/Ubuntu:"
  echo "    curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cf.deb && sudo dpkg -i /tmp/cf.deb"
  echo "Alternative: ngrok (ngrok http $PORT) or Tailscale for a private VPN."
  exit 1
fi

if ! curl -fs "http://127.0.0.1:$PORT/healthz" >/dev/null; then
  echo "Nothing is listening on port $PORT. Start the server first: node server.js"
  exit 1
fi

echo "Opening a tunnel to http://127.0.0.1:$PORT — look for the https://....trycloudflare.com line below."
exec cloudflared tunnel --url "http://127.0.0.1:$PORT"
