#!/usr/bin/env bash
# Deploys the pushed state of GitHub (default branch main) on the home laptop itself, for when
# the PC at hand has no `legion-home` SSH alias (see docs/hosting.md). Run it on the laptop:
#   bash ~/legion-pixel/scripts/deploy-on-server.sh [branch]
# It swaps the folder it lives in, so everything runs from a function bash has read in full.
# Running games end on deploy.
set -euo pipefail

main() {
  local branch=${1:-main}
  local dir=$HOME/legion-pixel
  local tarball=https://github.com/melknoo/ai_legion_td/archive/refs/heads/$branch.tar.gz

  [ -f "$dir/deploy/home/.env" ] || { echo "no $dir/deploy/home/.env (tunnel token)"; exit 1; }

  echo "== download $branch"
  rm -rf "$dir.new" && mkdir "$dir.new"
  curl -fsSL "$tarball" | tar -xz --strip-components=1 -C "$dir.new"
  # The tunnel token never goes through git.
  cp "$dir/deploy/home/.env" "$dir.new/deploy/home/.env"
  rm -rf "$dir.old" && mv "$dir" "$dir.old" && mv "$dir.new" "$dir"

  echo "== build + restart"
  cd "$dir/deploy/home"
  docker compose up -d --build --remove-orphans
  docker image prune -f >/dev/null

  echo "== check"
  for _ in $(seq 1 20); do
    curl -sf -o /dev/null http://127.0.0.1:8080/health && break
    sleep 1
  done
  curl -sf -o /dev/null http://127.0.0.1:8080/health || { echo "game container does not answer; previous version: $dir.old"; exit 1; }
  echo "done. Changed existing sprites? Purge the Cloudflare cache (docs/hosting.md)."
}

main "$@"
