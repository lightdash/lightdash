#!/usr/bin/env bash
# Launches a per-agent Lightdash instance.
# Usage: ./agent-harness/launch.sh <agent-id> [--worktree]
#
# Agent ID must be 1-5. Creates isolated database, MinIO bucket,
# env file, PM2 config, and starts all processes.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- Parse arguments ---
AGENT_ID=""
USE_WORKTREE=false

for arg in "$@"; do
    case "$arg" in
        --worktree) USE_WORKTREE=true ;;
        [1-5]) AGENT_ID="$arg" ;;
        *)
            echo "Usage: $0 <agent-id 1-5> [--worktree]" >&2
            exit 1
            ;;
    esac
done

if [ -z "$AGENT_ID" ]; then
    echo "Usage: $0 <agent-id 1-5> [--worktree]" >&2
    exit 1
fi

log() { echo "==> [agent-$AGENT_ID] $*" >&2; }

# --- Port computation ---
FE_PORT=$((3000 + AGENT_ID * 10))
API_PORT=$((8000 + AGENT_ID * 10))
SCHEDULER_PORT=$((8000 + AGENT_ID * 10 + 1))
DEBUG_PORT=$((9200 + AGENT_ID * 10))
DB_PORT="${AGENT_DB_PORT:-15432}"
MINIO_PORT="${AGENT_MINIO_PORT:-19000}"
BROWSER_PORT="${AGENT_BROWSER_PORT:-13001}"

DB_NAME="agent_${AGENT_ID}"
BUCKET_NAME="agent-${AGENT_ID}"

PSQL="psql -h localhost -p $DB_PORT -U postgres"

# --- 1. Ensure shared infra is running ---
log "Ensuring shared infrastructure is running..."
"$SCRIPT_DIR/setup-infra.sh"

# --- 2. Create agent database from template ---
if $PSQL -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    log "Database '$DB_NAME' already exists."
else
    log "Creating database '$DB_NAME' from template..."
    $PSQL -d postgres -c "CREATE DATABASE $DB_NAME TEMPLATE lightdash_template"
fi

# --- 3. Create MinIO bucket ---
log "Ensuring MinIO bucket '$BUCKET_NAME' exists..."
# Use the MinIO mc client via the running container
docker compose -p agent-infra -f "$SCRIPT_DIR/docker-compose.agent.yml" \
    exec -T minio mc mb -p "local/$BUCKET_NAME" 2>/dev/null || true

# --- 4. Set up worktree if requested ---
WORK_ROOT="$REPO_ROOT"
if [ "$USE_WORKTREE" = true ]; then
    WORKTREE_DIR="$HOME/worktrees/agent-$AGENT_ID"
    WORKTREE_BRANCH="agent-$AGENT_ID-work"

    if [ -d "$WORKTREE_DIR" ]; then
        log "Worktree already exists at $WORKTREE_DIR"
    else
        log "Creating git worktree at $WORKTREE_DIR..."
        git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" -b "$WORKTREE_BRANCH" 2>/dev/null || \
            git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" "$WORKTREE_BRANCH"
    fi
    WORK_ROOT="$WORKTREE_DIR"
fi

# --- 5. Generate .env file ---
ENV_FILE="$SCRIPT_DIR/.env.agent.$AGENT_ID"
log "Generating $ENV_FILE..."

export AGENT_ID FE_PORT API_PORT DB_PORT MINIO_PORT BROWSER_PORT REPO_ROOT WORK_ROOT
sed \
    -e "s|\${AGENT_ID}|$AGENT_ID|g" \
    -e "s|\${API_PORT}|$API_PORT|g" \
    -e "s|\${FE_PORT}|$FE_PORT|g" \
    -e "s|\${DB_PORT}|$DB_PORT|g" \
    -e "s|\${MINIO_PORT}|$MINIO_PORT|g" \
    -e "s|\${BROWSER_PORT}|$BROWSER_PORT|g" \
    -e "s|\${REPO_ROOT}|$WORK_ROOT|g" \
    "$SCRIPT_DIR/env.template" > "$ENV_FILE"

# --- 6. Generate PM2 ecosystem config ---
PM2_CONFIG="$SCRIPT_DIR/ecosystem.agent.$AGENT_ID.config.cjs"
log "Generating $PM2_CONFIG..."

sed \
    -e "s|__AGENT_ID__|$AGENT_ID|g" \
    -e "s|__REPO_ROOT__|$WORK_ROOT|g" \
    -e "s|__ENV_FILE__|$ENV_FILE|g" \
    -e "s|__API_PORT__|$API_PORT|g" \
    -e "s|__FE_PORT__|$FE_PORT|g" \
    -e "s|__DEBUG_PORT__|$DEBUG_PORT|g" \
    "$SCRIPT_DIR/ecosystem.agent.template.cjs" > "$PM2_CONFIG"

# --- 7. Start PM2 processes ---
log "Starting PM2 processes..."
npx pm2 start "$PM2_CONFIG"

# --- 8. Wait for health check ---
log "Waiting for backend health check on port $API_PORT..."
HEALTH_URL="http://localhost:$API_PORT/api/v1/health"
retries=0
max_retries=60
while ! curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -ge "$max_retries" ]; then
        echo "ERROR: Backend not healthy after ${max_retries}s" >&2
        echo "Check logs with: ./agent-harness/agent-cli.sh $AGENT_ID logs api" >&2
        exit 1
    fi
    sleep 1
done

# --- 9. Print status ---
log ""
log "Agent $AGENT_ID is ready!"
log "  Frontend: http://localhost:$FE_PORT"
log "  Backend:  http://localhost:$API_PORT"
log "  Debug:    localhost:$DEBUG_PORT"
log "  Database: $DB_NAME (localhost:$DB_PORT)"
log "  Bucket:   $BUCKET_NAME"
if [ "$USE_WORKTREE" = true ]; then
    log "  Worktree: $WORKTREE_DIR"
fi
log ""
log "Login: demo@lightdash.com / demo_password!"
log ""
log "Commands:"
log "  ./agent-harness/agent-cli.sh $AGENT_ID status"
log "  ./agent-harness/agent-cli.sh $AGENT_ID logs api"
log "  ./agent-harness/verify.sh $AGENT_ID"
log "  ./agent-harness/teardown.sh $AGENT_ID"
