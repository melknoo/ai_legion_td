#!/usr/bin/env bash
# Deploys the working tree to the home laptop behind the Cloudflare Tunnel (see docs/hosting.md).
# Needs the SSH alias `legion-home` in ~/.ssh/config. Running games end on deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=legion-home
DIR=legion-pixel
URL=https://legion.schleiweb.de/

echo "== typecheck + tests"
npm run typecheck --silent
npm test --silent

echo "== upload"
# Unpack into a fresh folder so files deleted here vanish there too; the tunnel token stays.
tar --exclude=node_modules --exclude=dist --exclude=reference --exclude=.git \
  --exclude='.env' --exclude='*.log' -czf - . 2>/dev/null \
  | ssh "$HOST" "rm -rf ~/$DIR.new && mkdir ~/$DIR.new && tar -xzf - -C ~/$DIR.new 2>/dev/null \
      && cp ~/$DIR/deploy/home/.env ~/$DIR.new/deploy/home/.env \
      && rm -rf ~/$DIR.old && mv ~/$DIR ~/$DIR.old && mv ~/$DIR.new ~/$DIR"

echo "== build + restart"
ssh "$HOST" "cd ~/$DIR/deploy/home && docker compose up -d --build --remove-orphans && docker image prune -f >/dev/null"

echo "== check"
for _ in $(seq 1 20); do
  ssh "$HOST" "curl -sf -o /dev/null http://127.0.0.1:8080/" && break
  sleep 1
done
ssh "$HOST" "curl -sf -o /dev/null http://127.0.0.1:8080/" || { echo "game container does not answer"; exit 1; }
echo "public: $(curl -s -o /dev/null -w '%{http_code}' "$URL" || true) $URL"
echo "done. Changed existing sprites? Purge the Cloudflare cache (docs/hosting.md)."
