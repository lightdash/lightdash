#!/usr/bin/env bash
# Multi-instance port allocation and registry for Lightdash development.
#
# Manages port assignments so multiple worktrees can run simultaneously
# without port conflicts. Each worktree gets a "slot" with computed port offsets.
#
# Shared services (minio, headless-browser, mailpit, nats) run once on fixed
# ports via docker-compose.dev.shared.yml. Only PostgreSQL and app-level ports
# (API, frontend, scheduler, etc.) are allocated per instance.
#
# Registry location: ~/.lightdash/dev-instances/<instance-id>.json
#
# Usage:
#   dev-ports.sh claim [--instance-id NAME]   Claim a port slot (idempotent)
#   dev-ports.sh release [--instance-id NAME] Release a port slot
#   dev-ports.sh show [--instance-id NAME]    Print current port assignments
#   dev-ports.sh list                          List all active instances
#   dev-ports.sh env [--instance-id NAME]     Output sourceable env var exports
#   dev-ports.sh gc                            Release instances with missing worktree paths

set -euo pipefail

if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: python3 is required but not found. Install it or activate your venv." >&2
    exit 1
fi

REGISTRY_DIR="$HOME/.lightdash/dev-instances"

# Shared service ports (fixed, single instance for all worktrees)
SHARED_MINIO_PORT=9000
SHARED_MINIO_CONSOLE_PORT=9001
SHARED_BROWSER_PORT=3001
SHARED_MAILPIT_WEB_PORT=8025
SHARED_MAILPIT_SMTP_PORT=1025
SHARED_NATS_PORT=4222
SHARED_NATS_MONITOR_PORT=8222

get_instance_id() {
    local id="${INSTANCE_ID:-}"
    if [ -z "$id" ]; then
        id="$(basename "$(pwd)")"
    fi
    echo "$id"
}

parse_args() {
    SUBCOMMAND="${1:-}"
    shift || true
    INSTANCE_ID=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --instance-id)
                INSTANCE_ID="${2:-}"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
}

compute_ports() {
    local slot="$1"
    # Slot 0 = default ports (backward compatible with single-instance)
    # Slot N = base + N * offset
    #
    # Only per-instance ports are computed here.
    # Shared services (minio, browser, mailpit, nats) use fixed ports.
    #
    # Note: with stride 10, cross-slot collisions are theoretically possible
    # (e.g. slot 3 FRONTEND_PORT=3030 vs slot 0 SDK_TEST_PORT=3030).
    # validate_slot_ports() checks lsof at claim time to catch these at runtime.
    PG_PORT=$((5432 + slot * 100))
    FRONTEND_PORT=$((3000 + slot * 10))
    API_PORT=$((8080 + slot * 10))
    SCHEDULER_PORT=$((8081 + slot * 10))
    DEBUG_PORT=$((9229 + slot * 10))
    SDK_TEST_PORT=$((3030 + slot * 10))
    SPOTLIGHT_PORT=$((8969 + slot * 10))
    PROMETHEUS_PORT=$((9090 + slot * 10))
}

get_taken_slots() {
    local slots=""
    if [ -d "$REGISTRY_DIR" ]; then
        for f in "$REGISTRY_DIR"/*.json; do
            [ -f "$f" ] || continue
            local s
            s=$(python3 -c "import json; print(json.load(open('$f'))['slot'])" 2>/dev/null || true)
            if [ -n "$s" ]; then
                slots="$slots $s"
            fi
        done
    fi
    echo "$slots"
}

find_next_slot() {
    local taken
    taken=$(get_taken_slots)
    local slot=0
    while true; do
        if ! echo "$taken" | grep -qw "$slot"; then
            echo "$slot"
            return
        fi
        slot=$((slot + 1))
    done
}

check_port_available() {
    local port="$1"
    if lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; then
        return 1
    fi
    return 0
}

validate_slot_ports() {
    local slot="$1"
    compute_ports "$slot"

    # Only check per-instance ports (shared services are not our concern)
    local all_ports="$PG_PORT $FRONTEND_PORT $API_PORT $SCHEDULER_PORT $DEBUG_PORT $SDK_TEST_PORT $SPOTLIGHT_PORT $PROMETHEUS_PORT"

    for port in $all_ports; do
        if ! check_port_available "$port"; then
            return 1
        fi
    done
    return 0
}

write_instance_file() {
    local id="$1"
    local slot="$2"
    local worktree_path="$3"

    compute_ports "$slot"

    local compose_project="ld-$(echo "$id" | tr '[:upper:]' '[:lower:]')"
    local file="$REGISTRY_DIR/${id}.json"

    # Escape backslashes and quotes in paths for valid JSON
    local safe_path="${worktree_path//\\/\\\\}"
    safe_path="${safe_path//\"/\\\"}"

    cat > "$file" << ENDJSON
{
  "slot": ${slot},
  "instanceId": "${id}",
  "worktreePath": "${safe_path}",
  "composeProject": "${compose_project}",
  "ports": {
    "pg": ${PG_PORT},
    "frontend": ${FRONTEND_PORT},
    "api": ${API_PORT},
    "scheduler": ${SCHEDULER_PORT},
    "debug": ${DEBUG_PORT},
    "sdkTest": ${SDK_TEST_PORT},
    "spotlight": ${SPOTLIGHT_PORT},
    "prometheus": ${PROMETHEUS_PORT}
  },
  "shared": {
    "minio": ${SHARED_MINIO_PORT},
    "minioConsole": ${SHARED_MINIO_CONSOLE_PORT},
    "browser": ${SHARED_BROWSER_PORT},
    "mailpitWeb": ${SHARED_MAILPIT_WEB_PORT},
    "mailpitSmtp": ${SHARED_MAILPIT_SMTP_PORT},
    "nats": ${SHARED_NATS_PORT},
    "natsMonitor": ${SHARED_NATS_MONITOR_PORT}
  },
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
ENDJSON
}

cmd_claim() {
    local id
    id=$(get_instance_id)
    local file="$REGISTRY_DIR/${id}.json"

    mkdir -p "$REGISTRY_DIR"

    # Idempotent: if already claimed, return existing
    if [ -f "$file" ]; then
        echo "Instance '$id' already claimed (slot $(python3 -c "import json; print(json.load(open('$file'))['slot'])"))"
        cat "$file"
        return 0
    fi

    # Acquire a lock to prevent race conditions when multiple sessions
    # on the same worktree run claim simultaneously.
    # mkdir is atomic on POSIX — it either succeeds or fails, no partial state.
    local lockdir="$REGISTRY_DIR/.claim-lock"
    local lock_acquired=false
    for i in $(seq 1 20); do
        if mkdir "$lockdir" 2>/dev/null; then
            lock_acquired=true
            # Ensure lock is released on exit (even on error/signal)
            trap "rmdir '$REGISTRY_DIR/.claim-lock' 2>/dev/null || true" EXIT
            break
        fi
        # Check for stale lock (older than 30 seconds)
        if [ -d "$lockdir" ]; then
            local lock_age
            if [[ "$OSTYPE" == "darwin"* ]]; then
                lock_age=$(( $(date +%s) - $(stat -f %m "$lockdir" 2>/dev/null || echo "0") ))
            else
                lock_age=$(( $(date +%s) - $(stat -c %Y "$lockdir" 2>/dev/null || echo "0") ))
            fi
            if [ "$lock_age" -gt 30 ]; then
                rmdir "$lockdir" 2>/dev/null || true
                continue
            fi
        fi
        sleep 0.5
    done

    if [ "$lock_acquired" = false ]; then
        echo "ERROR: Could not acquire lock after 10s. Another claim may be in progress." >&2
        exit 1
    fi

    # Re-check after acquiring lock (another session may have claimed while we waited)
    if [ -f "$file" ]; then
        rmdir "$lockdir" 2>/dev/null || true
        echo "Instance '$id' already claimed (slot $(python3 -c "import json; print(json.load(open('$file'))['slot'])"))"
        cat "$file"
        return 0
    fi

    # Find next available slot, re-reading taken slots each iteration
    # to avoid claiming a slot already assigned to another instance.
    local max_attempts=10
    local attempt=0
    local slot
    slot=$(find_next_slot)
    while [ "$attempt" -lt "$max_attempts" ]; do
        local taken
        taken=$(get_taken_slots)
        if echo "$taken" | grep -qw "$slot"; then
            echo "Slot $slot already taken, trying next..." >&2
            slot=$((slot + 1))
            attempt=$((attempt + 1))
            continue
        fi
        if validate_slot_ports "$slot"; then
            break
        fi
        echo "Slot $slot has port conflicts, trying next..." >&2
        slot=$((slot + 1))
        attempt=$((attempt + 1))
    done

    if [ "$attempt" -ge "$max_attempts" ]; then
        rmdir "$lockdir" 2>/dev/null || true
        echo "ERROR: Could not find a slot without port conflicts after $max_attempts attempts" >&2
        exit 1
    fi

    write_instance_file "$id" "$slot" "$(pwd)"

    # Release lock
    rmdir "$lockdir" 2>/dev/null || true

    echo "Claimed slot $slot for instance '$id'"
    cat "$file"
}

cmd_release() {
    local id
    id=$(get_instance_id)
    local file="$REGISTRY_DIR/${id}.json"

    if [ ! -f "$file" ]; then
        echo "Instance '$id' is not claimed"
        return 0
    fi

    rm "$file"
    echo "Released instance '$id'"
}

cmd_show() {
    local id
    id=$(get_instance_id)
    local file="$REGISTRY_DIR/${id}.json"

    if [ ! -f "$file" ]; then
        echo "Instance '$id' is not claimed. Run 'dev-ports.sh claim' first." >&2
        exit 1
    fi

    cat "$file"
}

cmd_list() {
    mkdir -p "$REGISTRY_DIR"

    echo "Shared services (all instances):"
    echo "    MinIO:     localhost:${SHARED_MINIO_PORT} (console: ${SHARED_MINIO_CONSOLE_PORT})"
    echo "    Browser:   localhost:${SHARED_BROWSER_PORT}"
    echo "    Mailpit:   http://localhost:${SHARED_MAILPIT_WEB_PORT} (SMTP: ${SHARED_MAILPIT_SMTP_PORT})"
    echo "    NATS:      localhost:${SHARED_NATS_PORT} (monitor: ${SHARED_NATS_MONITOR_PORT})"
    echo ""

    local found=false
    for f in "$REGISTRY_DIR"/*.json; do
        [ -f "$f" ] || continue
        found=true

        python3 -c "
import json
d = json.load(open('$f'))
p = d['ports']
print(f\"  Instance: {d['instanceId']} (slot {d['slot']})\")
print(f\"    Worktree:  {d['worktreePath']}\")
print(f\"    Compose:   {d['composeProject']}\")
print(f\"    Frontend:  http://localhost:{p['frontend']}\")
print(f\"    API:       http://localhost:{p['api']}\")
print(f\"    Postgres:  localhost:{p['pg']}\")
print()
"
    done

    if [ "$found" = false ]; then
        echo "No active instances"
    fi
}

cmd_env() {
    local id
    id=$(get_instance_id)
    local file="$REGISTRY_DIR/${id}.json"

    if [ ! -f "$file" ]; then
        echo "Instance '$id' is not claimed. Run 'dev-ports.sh claim' first." >&2
        exit 1
    fi

    python3 -c "
import json
d = json.load(open('$file'))
p = d['ports']
s = d['shared']
print(f\"export LD_INSTANCE_ID={d['instanceId']}\")
print(f\"export LD_COMPOSE_PROJECT={d['composeProject']}\")
print(f\"export LD_VOLUME_PREFIX={d['composeProject']}\")
print(f\"export LD_CONTAINER_PREFIX={d['composeProject']}\")
# Per-instance ports
print(f\"export LD_PG_PORT={p['pg']}\")
print(f\"export PORT={p['api']}\")
print(f\"export FE_PORT={p['frontend']}\")
print(f\"export SCHEDULER_PORT={p['scheduler']}\")
print(f\"export DEBUG_PORT={p['debug']}\")
print(f\"export SDK_TEST_PORT={p['sdkTest']}\")
print(f\"export SPOTLIGHT_PORT={p['spotlight']}\")
print(f\"export LIGHTDASH_PROMETHEUS_PORT={p['prometheus']}\")
print(f\"export PGPORT={p['pg']}\")
print(f\"export SITE_URL=http://localhost:{p['frontend']}\")
# Shared service ports (fixed across all instances)
print(f\"export S3_ENDPOINT=http://localhost:{s['minio']}\")
print(f\"export HEADLESS_BROWSER_PORT={s['browser']}\")
print(f\"export EMAIL_SMTP_PORT={s['mailpitSmtp']}\")
"
}

cmd_gc() {
    mkdir -p "$REGISTRY_DIR"

    local cleaned=0
    for f in "$REGISTRY_DIR"/*.json; do
        [ -f "$f" ] || continue

        local worktree_path
        worktree_path=$(python3 -c "import json; print(json.load(open('$f'))['worktreePath'])" 2>/dev/null || true)
        local instance_id
        instance_id=$(python3 -c "import json; print(json.load(open('$f'))['instanceId'])" 2>/dev/null || true)

        if [ -n "$worktree_path" ] && [ ! -d "$worktree_path" ]; then
            echo "Releasing stale instance '$instance_id' (worktree $worktree_path no longer exists)"
            rm "$f"
            cleaned=$((cleaned + 1))
        fi
    done

    if [ "$cleaned" -eq 0 ]; then
        echo "No stale instances found"
    else
        echo "Cleaned up $cleaned stale instance(s)"
    fi
}

# Main
parse_args "$@"

case "${SUBCOMMAND}" in
    claim)   cmd_claim ;;
    release) cmd_release ;;
    show)    cmd_show ;;
    list)    cmd_list ;;
    env)     cmd_env ;;
    gc)      cmd_gc ;;
    *)
        echo "Usage: $0 {claim|release|show|list|env|gc} [--instance-id NAME]" >&2
        exit 1
        ;;
esac
