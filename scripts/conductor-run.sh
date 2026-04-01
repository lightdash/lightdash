#!/usr/bin/env bash
# Conductor workspace run hook.
# Starts PM2 dev servers for this workspace instance.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log() { echo "==> [conductor:${CONDUCTOR_WORKSPACE_NAME:-run}] $*"; }

# Load port allocation
eval "$(./scripts/dev-ports.sh env)"

# Ensure Docker services are up (idempotent)
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d 2>/dev/null
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml --env-file .env.development up -d 2>/dev/null

# Wait for PostgreSQL
for i in $(seq 1 15); do
    docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres 2>/dev/null && break
    sleep 1
done

# Start PM2
log "Starting PM2 dev servers..."
pnpm pm2:start

log ""
log "Dev servers starting for '$LD_INSTANCE_ID'!"
log "  Frontend:   http://localhost:$FE_PORT"
log "  API:        http://localhost:$PORT"
log "  Login:      demo@lightdash.com / demo_password!"
