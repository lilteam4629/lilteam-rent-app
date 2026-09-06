#!/usr/bin/env bash
# Mirrors the main app's auto-deploy pattern (lilteam-deploy.timer/.service):
# pull, and only rebuild the container if something actually changed. Safe
# to run every minute — it's a no-op when there's nothing new.
set -euo pipefail

REPO_DIR="/opt/lilteam/rent-app"
cd "$REPO_DIR"

BEFORE="$(git rev-parse HEAD)"
git fetch --quiet origin main
git reset --hard --quiet origin/main
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
  exit 0
fi

echo "[lilteam-rent-deploy] $BEFORE -> $AFTER, rebuilding"
docker compose up -d --build
