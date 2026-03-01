#!/usr/bin/env bash
# Tears down a per-agent Lightdash instance.
# Usage: ./agent-harness/teardown.sh <agent-id>
#
# Stops PM2 processes, drops the database, removes the MinIO bucket,
# and cleans up generated config files.
# Safety: only touches resources with the agent's ID.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_ID="${1:?Usage: $0 <agent-id 1-5>}"

if [[ ! "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "ERROR: Agent ID must be 1-5, got '$AGENT_ID'" >&2
    exit 1
fi

DB_PORT="${AGENT_DB_PORT:-15432}"
DB_NAME="agent_${AGENT_ID}"
BUCKET_NAME="agent-${AGENT_ID}"
PSQL="psql -h localhost -p $DB_PORT -U postgres"

log() { echo "==> [agent-$AGENT_ID] $*" >&2; }

# --- 1. Stop and delete PM2 processes ---
log "Stopping PM2 processes..."
for proc in api frontend common-watch warehouses-watch; do
    npx pm2 delete "agent-${AGENT_ID}-${proc}" 2>/dev/null || true
done

# --- 2. Drop database (disconnect active sessions first) ---
log "Dropping database '$DB_NAME'..."
$PSQL -d postgres -c "
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid()
" 2>/dev/null || true

$PSQL -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME" 2>/dev/null || true

# --- 3. Remove MinIO bucket ---
log "Removing MinIO bucket '$BUCKET_NAME'..."
docker compose -p agent-infra -f "$SCRIPT_DIR/docker-compose.agent.yml" \
    exec -T minio mc rb --force "local/$BUCKET_NAME" 2>/dev/null || true

# --- 4. Remove generated config files ---
log "Cleaning up config files..."
rm -f "$SCRIPT_DIR/.env.agent.$AGENT_ID"
rm -f "$SCRIPT_DIR/ecosystem.agent.$AGENT_ID.config.cjs"

# --- 5. Remove worktree if it exists ---
WORKTREE_DIR="$HOME/worktrees/agent-$AGENT_ID"
if [ -d "$WORKTREE_DIR" ]; then
    log "Removing git worktree at $WORKTREE_DIR..."
    git -C "$REPO_ROOT" worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
fi

log "Agent $AGENT_ID has been torn down."
