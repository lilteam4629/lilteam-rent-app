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

# Finish the build before replacing the container that is serving customers.
# Keep the previous image and restore it automatically if health checks fail.
CURRENT_CONTAINER="$(docker compose ps -q rent-app)"
OLD_IMAGE_ID=""
OLD_IMAGE_NAME=""
if [ -n "$CURRENT_CONTAINER" ]; then
  OLD_IMAGE_ID="$(docker inspect --format '{{.Image}}' "$CURRENT_CONTAINER")"
  OLD_IMAGE_NAME="$(docker inspect --format '{{.Config.Image}}' "$CURRENT_CONTAINER")"
fi

docker compose build rent-app
docker compose up -d --no-build rent-app

for _ in $(seq 1 24); do
  if curl --fail --silent http://127.0.0.1:3001/health >/dev/null; then
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 5
done

echo "Deployment health check failed" >&2
docker compose logs --tail=100 rent-app >&2
if [ -n "$OLD_IMAGE_ID" ] && [ -n "$OLD_IMAGE_NAME" ]; then
  echo "Restoring the previous healthy image" >&2
  docker tag "$OLD_IMAGE_ID" "$OLD_IMAGE_NAME"
  docker compose up -d --no-build rent-app
fi
exit 1
