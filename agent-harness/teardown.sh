#!/usr/bin/env bash
# Tears down a single agent instance.
# Stops PM2 processes, drops database, removes MinIO bucket, cleans up files.
#
# Safety: Only touches resources with the agent's ID. Cannot affect other agents.
#
# Usage: ./agent-harness/teardown.sh <agent-id>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_ID="${1:-}"

if [[ -z "$AGENT_ID" ]] || ! [[ "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "Usage: $0 <agent-id>" >&2
    echo "  agent-id must be 1-5" >&2
    exit 1
fi

log() { echo "==> [agent-$AGENT_ID] $*" >&2; }

DB_PORT="${AGENT_DB_PORT:-15432}"
MINIO_PORT="${AGENT_MINIO_PORT:-19000}"

# ── Step 1: Stop and delete PM2 processes ─────────────────────────────────
log "Stopping PM2 processes with prefix 'agent-${AGENT_ID}-'..."
PM2_PROCS=$(npx pm2 jlist 2>/dev/null | node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
    data.filter(p => p.name.startsWith('agent-${AGENT_ID}-')).forEach(p => console.log(p.name));
" 2>/dev/null) || true

if [ -n "$PM2_PROCS" ]; then
    echo "$PM2_PROCS" | while read -r proc; do
        log "  Deleting PM2 process: $proc"
        npx pm2 delete "$proc" 2>/dev/null || true
    done
else
    log "  No PM2 processes found."
fi

# ── Step 2: Drop agent database ───────────────────────────────────────────
AGENT_DB="agent_${AGENT_ID}"
PSQL="psql -h localhost -p $DB_PORT -U postgres -d postgres"

if $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname = '$AGENT_DB'" 2>/dev/null | grep -q 1; then
    log "Disconnecting active sessions from '$AGENT_DB'..."
    $PSQL -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$AGENT_DB' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true

    log "Dropping database '$AGENT_DB'..."
    $PSQL -c "DROP DATABASE $AGENT_DB" 2>/dev/null || log "Warning: could not drop database '$AGENT_DB'"
else
    log "Database '$AGENT_DB' does not exist. Skipping."
fi

# ── Step 3: Remove MinIO bucket ───────────────────────────────────────────
MINIO_BUCKET="agent-${AGENT_ID}"
MINIO_ENDPOINT="http://localhost:${MINIO_PORT}"

log "Removing MinIO bucket '$MINIO_BUCKET'..."
# Use mc if available, otherwise skip
if command -v mc >/dev/null 2>&1; then
    mc alias set agent-minio "$MINIO_ENDPOINT" minioadmin minioadmin 2>/dev/null || true
    mc rb --force "agent-minio/${MINIO_BUCKET}" 2>/dev/null || log "Warning: could not remove MinIO bucket"
else
    # Try with curl - delete objects first, then bucket
    curl -s -X DELETE -u "minioadmin:minioadmin" "${MINIO_ENDPOINT}/${MINIO_BUCKET}/" 2>/dev/null || true
    log "Note: Install 'mc' (MinIO Client) for reliable bucket cleanup"
fi

# ── Step 4: Remove generated files ────────────────────────────────────────
for file in \
    "$REPO_ROOT/.env.agent.${AGENT_ID}" \
    "$REPO_ROOT/ecosystem.agent.${AGENT_ID}.config.cjs"; do
    if [ -f "$file" ]; then
        log "Removing $file"
        rm -f "$file"
    fi
done

# ── Step 5: Remove git worktree (if exists) ───────────────────────────────
WORKTREE_DIR="$HOME/worktrees/agent-${AGENT_ID}"
if [ -d "$WORKTREE_DIR" ]; then
    log "Removing git worktree at $WORKTREE_DIR..."
    cd "$REPO_ROOT"
    git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || {
        log "Warning: Could not remove worktree cleanly. Forcing removal..."
        rm -rf "$WORKTREE_DIR"
        git worktree prune 2>/dev/null || true
    }
fi

log "Agent $AGENT_ID has been torn down."
