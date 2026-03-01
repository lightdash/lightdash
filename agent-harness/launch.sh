#!/usr/bin/env bash
# Launches a single agent instance with isolated ports, database, and PM2 processes.
# Idempotent — safe to run multiple times for the same agent.
#
# Usage: ./agent-harness/launch.sh <agent-id> [--worktree]
#   agent-id: integer 1-5
#   --worktree: create a git worktree for isolated file changes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parse arguments ────────────────────────────────────────────────────────
AGENT_ID="${1:-}"
USE_WORKTREE=false

for arg in "$@"; do
    case "$arg" in
        --worktree) USE_WORKTREE=true ;;
    esac
done

if [[ -z "$AGENT_ID" ]] || ! [[ "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "Usage: $0 <agent-id> [--worktree]" >&2
    echo "  agent-id must be 1-5" >&2
    exit 1
fi

log() { echo "==> [agent-$AGENT_ID] $*" >&2; }

# ── Compute port offsets ───────────────────────────────────────────────────
FE_PORT=$((3000 + AGENT_ID * 10))
API_PORT=$((8000 + AGENT_ID * 10))
SCHEDULER_PORT=$((8000 + AGENT_ID * 10 + 1))
DEBUG_PORT=$((9200 + AGENT_ID * 10))
DB_PORT="${AGENT_DB_PORT:-15432}"
MINIO_PORT="${AGENT_MINIO_PORT:-19000}"
BROWSER_PORT="${AGENT_BROWSER_PORT:-13001}"

log "Ports: frontend=$FE_PORT api=$API_PORT debug=$DEBUG_PORT"

# ── Step 1: Ensure shared infra is running ─────────────────────────────────
log "Ensuring shared infrastructure is running..."
"$SCRIPT_DIR/setup-infra.sh"

# ── Step 2: Create agent database from template ───────────────────────────
AGENT_DB="agent_${AGENT_ID}"
PSQL="psql -h localhost -p $DB_PORT -U postgres -d postgres"

if $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname = '$AGENT_DB'" | grep -q 1; then
    log "Database '$AGENT_DB' already exists. Skipping creation."
else
    log "Creating database '$AGENT_DB' from template..."
    # Disconnect any sessions from the template to allow copying
    $PSQL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'lightdash_template' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
    $PSQL -c "CREATE DATABASE $AGENT_DB TEMPLATE lightdash_template"
    log "Database '$AGENT_DB' created."
fi

# ── Step 3: Create MinIO bucket ────────────────────────────────────────────
MINIO_BUCKET="agent-${AGENT_ID}"
log "Ensuring MinIO bucket '$MINIO_BUCKET' exists..."

# Use the MinIO HTTP API to create the bucket (PUT /<bucket>)
MINIO_ENDPOINT="http://localhost:${MINIO_PORT}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -u "minioadmin:minioadmin" \
    "${MINIO_ENDPOINT}/${MINIO_BUCKET}/" 2>/dev/null) || true

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "409" ]; then
    log "MinIO bucket '$MINIO_BUCKET' is ready."
else
    log "Warning: MinIO bucket creation returned HTTP $HTTP_STATUS (may already exist or MinIO not ready)"
fi

# ── Step 4: Git worktree (optional) ───────────────────────────────────────
WORK_DIR="$REPO_ROOT"
if [ "$USE_WORKTREE" = true ]; then
    WORKTREE_DIR="$HOME/worktrees/agent-${AGENT_ID}"
    WORKTREE_BRANCH="agent-${AGENT_ID}"

    if [ -d "$WORKTREE_DIR" ]; then
        log "Worktree already exists at $WORKTREE_DIR"
    else
        log "Creating git worktree at $WORKTREE_DIR..."
        cd "$REPO_ROOT"
        git worktree add "$WORKTREE_DIR" -b "$WORKTREE_BRANCH" 2>/dev/null || \
            git worktree add "$WORKTREE_DIR" "$WORKTREE_BRANCH" 2>/dev/null || \
            git worktree add "$WORKTREE_DIR"
        log "Installing dependencies in worktree..."
        cd "$WORKTREE_DIR" && pnpm install
    fi
    WORK_DIR="$WORKTREE_DIR"
fi

# ── Step 5: Generate .env.agent.<id> ──────────────────────────────────────
ENV_FILE="$WORK_DIR/.env.agent.${AGENT_ID}"
log "Generating $ENV_FILE..."

AGENT_ID="$AGENT_ID" \
API_PORT="$API_PORT" \
FE_PORT="$FE_PORT" \
DB_PORT="$DB_PORT" \
MINIO_PORT="$MINIO_PORT" \
BROWSER_PORT="$BROWSER_PORT" \
REPO_ROOT="$WORK_DIR" \
    envsubst < "$SCRIPT_DIR/env.template" > "$ENV_FILE"

# ── Step 6: Generate PM2 ecosystem config ─────────────────────────────────
ECOSYSTEM_FILE="$WORK_DIR/ecosystem.agent.${AGENT_ID}.config.cjs"
log "Generating $ECOSYSTEM_FILE..."

AGENT_ID="$AGENT_ID" \
FE_PORT="$FE_PORT" \
DEBUG_PORT="$DEBUG_PORT" \
    envsubst < "$SCRIPT_DIR/ecosystem.agent.template.cjs" > "$ECOSYSTEM_FILE"

# ── Step 7: Start PM2 processes ───────────────────────────────────────────
log "Starting PM2 processes..."
cd "$WORK_DIR"
npx pm2 start "$ECOSYSTEM_FILE"

# ── Step 8: Wait for health check ─────────────────────────────────────────
log "Waiting for API health check on port $API_PORT..."
HEALTH_URL="http://localhost:${API_PORT}/api/v1/health"
TIMEOUT=60
ELAPSED=0

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null) || true
    if [ "$HTTP_CODE" = "200" ]; then
        log "Health check passed!"
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
done

if [ "$ELAPSED" -ge "$TIMEOUT" ]; then
    log "Warning: Health check did not pass within ${TIMEOUT}s. The API may still be starting."
    log "Check logs with: ./agent-harness/agent-cli.sh $AGENT_ID logs api"
fi

# ── Step 9: Print summary ────────────────────────────────────────────────
echo ""
log "Agent $AGENT_ID is ready!"
log "  Frontend:  http://localhost:${FE_PORT}"
log "  API:       http://localhost:${API_PORT}"
log "  Database:  agent_${AGENT_ID} on localhost:${DB_PORT}"
log "  Env file:  $ENV_FILE"
log "  PM2 config: $ECOSYSTEM_FILE"
if [ "$USE_WORKTREE" = true ]; then
    log "  Worktree:  $WORKTREE_DIR"
fi
log ""
log "Useful commands:"
log "  ./agent-harness/agent-cli.sh $AGENT_ID status"
log "  ./agent-harness/agent-cli.sh $AGENT_ID logs api"
log "  ./agent-harness/verify.sh $AGENT_ID"
log "  ./agent-harness/teardown.sh $AGENT_ID"
