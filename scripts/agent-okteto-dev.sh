#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OKTETO_CONTEXT_URL="${OKTETO_CONTEXT:-https://lightdash.okteto.dev}"
OKTETO_MANIFEST="$REPO_ROOT/okteto.dev.yaml"
OKTETO_SERVICE="lightdash-dev"
READY_TIMEOUT_SECONDS="${OKTETO_READY_TIMEOUT_SECONDS:-300}"
SYNC_START_TIMEOUT_SECONDS="${OKTETO_SYNC_START_TIMEOUT_SECONDS:-600}"
POLL_INTERVAL_SECONDS="${OKTETO_POLL_INTERVAL_SECONDS:-5}"
SETUP_DOC="docs/agent-okteto.md"
TOKEN_ENV_VAR="LIGHTDASH_OKTETO_TOKEN"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: ./scripts/agent-okteto-dev.sh <start|wait|url>

Requires LIGHTDASH_OKTETO_TOKEN. Commands safely skip when it is unset.

  start  Create or reuse this Claude session's Okteto environment.
  wait   Wait for file synchronization and application health.
  url    Print the public URL for this Claude session.
EOF
}

require_command() {
    local command_name="$1"
    command -v "$command_name" >/dev/null 2>&1 ||
        fail "Missing required command '$command_name'. See $SETUP_DOC."
}

# Reads the SessionStart hook JSON on stdin and prints a validated session_id.
# Returns non-zero (without exiting) when it is missing or malformed so callers
# can decide whether that is fatal.
extract_session_id() {
    local hook_input session_id

    hook_input="$(cat)"
    session_id="$(
        printf '%s\n' "$hook_input" |
            sed -nE 's/.*"session_id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' |
            head -n 1
    )"

    [ -n "$session_id" ] || return 1
    [[ "$session_id" =~ ^[A-Za-z0-9._:-]+$ ]] || return 1

    printf '%s' "$session_id"
}

capture_session_env() {
    local session_id

    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] || return 0

    [ -n "${CLAUDE_ENV_FILE:-}" ] ||
        fail "CLAUDE_ENV_FILE is unavailable in the SessionStart hook."

    session_id="$(extract_session_id)" ||
        fail "Claude SessionStart input has no usable session_id."

    printf 'export LIGHTDASH_AGENT_SESSION_ID=%s\n' "$session_id" >>"$CLAUDE_ENV_FILE"
}

# Launches `start` as a detached background process so the SessionStart hook
# returns immediately and never blocks session startup. Best-effort: any problem
# skips the auto-start rather than breaking the session. The captured session_id
# is exported so the background start computes the same namespace hash as the
# model's later `wait`/`url` calls.
hook_start() {
    local session_id pidfile pid

    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] || return 0

    session_id="$(extract_session_id)" || return 0
    [ -n "$session_id" ] || return 0

    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    load_session_config
    mkdir -p "$RUN_DIR"

    # Environment already syncing (e.g. on resume) — nothing to launch.
    if tmux_session_exists; then
        return 0
    fi

    # Dedupe near-simultaneous hook fires: skip if a prior background start is
    # still alive. A stale pidfile fails the liveness check and we proceed.
    pidfile="$RUN_DIR/hook-start.pid"
    if [ -f "$pidfile" ]; then
        pid="$(cat "$pidfile" 2>/dev/null || true)"
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            return 0
        fi
    fi

    nohup bash "$SCRIPT_DIR/agent-okteto-dev.sh" start \
        </dev/null >>"$RUN_DIR/hook-start.log" 2>&1 &
    printf '%s\n' "$!" >"$pidfile"
    disown 2>/dev/null || true

    echo "Okteto development environment starting in the background."
}

agent_session_id() {
    local workspace_root

    if [ -n "${LIGHTDASH_AGENT_SESSION_ID:-}" ]; then
        printf '%s' "$LIGHTDASH_AGENT_SESSION_ID"
    elif [ -n "${CLAUDE_CODE_REMOTE_SESSION_ID:-}" ]; then
        printf '%s' "$CLAUDE_CODE_REMOTE_SESSION_ID"
    else
        workspace_root="$(git -C "$REPO_ROOT" rev-parse --show-toplevel 2>/dev/null)" ||
            fail "Agent session and workspace identity are unavailable."
        printf 'workspace:%s' "$workspace_root"
    fi
}

hash_value() {
    local value="$1"

    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$value" | sha256sum | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then
        printf '%s' "$value" | shasum -a 256 | awk '{print $1}'
    else
        fail "Missing sha256sum or shasum. See $SETUP_DOC."
    fi
}

load_session_config() {
    local id context_host

    id="$(agent_session_id)"
    SESSION_HASH="$(hash_value "$id")"
    SESSION_HASH="${SESSION_HASH:0:16}"
    OKTETO_NAMESPACE="agent-$SESSION_HASH"
    TMUX_SESSION="ld-okteto-$SESSION_HASH"

    context_host="${OKTETO_CONTEXT_URL#*://}"
    context_host="${context_host%%/*}"
    PUBLIC_URL="https://lightdash-${OKTETO_NAMESPACE}.${context_host}"

    RUN_DIR="${TMPDIR:-/tmp}/lightdash-agent-okteto/$SESSION_HASH"
    LOG_FILE="$RUN_DIR/okteto-up.log"
}

require_runtime() {
    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] ||
        fail "$TOKEN_ENV_VAR is not set. See $SETUP_DOC."

    require_command curl
    require_command kubectl
    require_command okteto
    require_command tmux
}

prepare_runtime_dir() {
    mkdir -p "$RUN_DIR/okteto-home"
    export OKTETO_HOME="$RUN_DIR/okteto-home"
    export KUBECONFIG="$RUN_DIR/kubeconfig"
}

authenticate() {
    echo "Authenticating with Okteto..."
    if ! okteto context use \
        "$OKTETO_CONTEXT_URL" \
        --token "$LIGHTDASH_OKTETO_TOKEN" >/dev/null; then
        fail "Okteto authentication failed. Check $TOKEN_ENV_VAR and see $SETUP_DOC."
    fi
}

namespace_exists() {
    local namespaces

    namespaces="$(okteto namespace list -o json)" ||
        fail "Unable to list Okteto namespaces."
    printf '%s' "$namespaces" |
        tr -d '[:space:]' |
        grep -Fq "\"namespace\":\"$OKTETO_NAMESPACE\""
}

ensure_namespace() {
    if namespace_exists; then
        echo "Reusing Okteto namespace $OKTETO_NAMESPACE."
        return
    fi

    echo "Creating Okteto namespace $OKTETO_NAMESPACE..."
    okteto namespace create "$OKTETO_NAMESPACE" --use=false
}

tmux_session_exists() {
    tmux has-session -t "$TMUX_SESSION" 2>/dev/null
}

sync_is_ready() {
    local status_output

    status_output="$(
        okteto status "$OKTETO_SERVICE" \
            -f "$OKTETO_MANIFEST" \
            -n "$OKTETO_NAMESPACE" 2>&1
    )" || return 1

    printf '%s' "$status_output" |
        grep -Eq 'Synchronization status:[[:space:]]*100([.]0+)?%'
}

app_is_healthy() {
    curl --fail --silent --show-error \
        --max-time 10 \
        "$PUBLIC_URL/api/v1/health" >/dev/null 2>&1
}

show_log_tail() {
    if [ -s "$LOG_FILE" ]; then
        echo "Last Okteto output:" >&2
        tail -n 80 "$LOG_FILE" >&2
    fi
}

wait_until_ready() {
    local deadline last_report now

    deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
    last_report=$((SECONDS - 30))

    while ((SECONDS < deadline)); do
        if ! tmux_session_exists; then
            show_log_tail
            fail "Okteto file synchronization stopped. See $LOG_FILE."
        fi

        if sync_is_ready && app_is_healthy; then
            sleep 2
            if sync_is_ready && app_is_healthy; then
                echo "READY: $PUBLIC_URL"
                return
            fi
        fi

        now=$SECONDS
        if ((now - last_report >= 30)); then
            echo "Waiting for file synchronization and application health..."
            last_report=$now
        fi
        sleep "$POLL_INTERVAL_SECONDS"
    done

    show_log_tail
    fail "Timed out waiting for $PUBLIC_URL. See $LOG_FILE."
}

start_tmux_session() {
    local up_command pipe_command

    mkdir -p "$RUN_DIR"
    : >"$LOG_FILE"

    printf -v up_command \
        'exec okteto up %q -f %q -n %q' \
        "$OKTETO_SERVICE" \
        "$OKTETO_MANIFEST" \
        "$OKTETO_NAMESPACE"
    printf -v pipe_command 'cat >> %q' "$LOG_FILE"

    echo "Starting Okteto file synchronization..."
    tmux new-session \
        -d \
        -s "$TMUX_SESSION" \
        -c "$REPO_ROOT" \
        "$up_command"
    tmux pipe-pane -o -t "$TMUX_SESSION" "$pipe_command"
}

start_environment() {
    require_runtime
    prepare_runtime_dir
    authenticate
    ensure_namespace

    if tmux_session_exists; then
        echo "Reusing the active Okteto sync process."
        wait_until_ready
        return
    fi

    echo "Deploying the Lightdash development environment..."
    okteto deploy \
        -f "$OKTETO_MANIFEST" \
        -n "$OKTETO_NAMESPACE" \
        --wait \
        --timeout 8m

    start_tmux_session
    wait_until_ready
}

wait_for_environment() {
    local deadline

    require_runtime
    prepare_runtime_dir
    authenticate

    # The SessionStart hook starts the environment in the background, so the
    # sync session may not exist yet if `okteto deploy` is still running. Wait
    # for it to appear before waiting for readiness.
    deadline=$((SECONDS + SYNC_START_TIMEOUT_SECONDS))
    while ! tmux_session_exists; do
        if ((SECONDS >= deadline)); then
            fail "No active Okteto sync process after ${SYNC_START_TIMEOUT_SECONDS}s. See logs in $RUN_DIR and $SETUP_DOC."
        fi
        echo "Waiting for the Okteto deployment to start syncing..."
        sleep "$POLL_INTERVAL_SECONDS"
    done

    wait_until_ready
}

main() {
    local command_name="${1:-}"

    case "$command_name" in
        hook-env)
            capture_session_env
            ;;
        hook-start)
            hook_start
            ;;
        start | wait | url)
            if [ -z "${LIGHTDASH_OKTETO_TOKEN:-}" ]; then
                echo "SKIPPED: $TOKEN_ENV_VAR is not set."
                return
            fi

            load_session_config
            case "$command_name" in
                start) start_environment ;;
                wait) wait_for_environment ;;
                url) echo "$PUBLIC_URL" ;;
            esac
            ;;
        -h | --help | help | "")
            usage
            ;;
        *)
            usage >&2
            exit 1
            ;;
    esac
}

main "$@"
