#!/usr/bin/env bash
# Conductor workspace archive hook.
# Stops PM2 processes and per-instance Docker services. Shared services stay running.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log() { echo "==> [conductor:${CONDUCTOR_WORKSPACE_NAME:-archive}] $*"; }

# Load port allocation
eval "$(./scripts/dev-ports.sh env)"

log "Stopping PM2 processes for '$LD_INSTANCE_ID'..."
pm2 delete "${LD_INSTANCE_ID}-api" "${LD_INSTANCE_ID}-scheduler" "${LD_INSTANCE_ID}-frontend" \
    "${LD_INSTANCE_ID}-common-watch" "${LD_INSTANCE_ID}-warehouses-watch" \
    "${LD_INSTANCE_ID}-sdk-test" "${LD_INSTANCE_ID}-spotlight" 2>/dev/null || true

log "Stopping per-instance PostgreSQL..."
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml down

log "Releasing port slot..."
./scripts/dev-ports.sh release

log "Workspace '${CONDUCTOR_WORKSPACE_NAME:-$LD_INSTANCE_ID}' archived."
