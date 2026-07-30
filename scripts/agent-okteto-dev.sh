#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OKTETO_CONTEXT_URL="${OKTETO_CONTEXT:-https://lightdash.okteto.dev}"
OKTETO_MANIFEST="$REPO_ROOT/okteto.dev.yaml"
OKTETO_SERVICE="lightdash-dev"
POOL_NAMESPACE_PREFIX="dev-warm-"
COLD_NAMESPACE_PREFIX="dev-cold-"
POOL_CLAIM_CONFIGMAP="lightdash-agent-claim"
POOL_READY_CONFIGMAP="lightdash-agent-ready"
READY_TIMEOUT_SECONDS="${OKTETO_READY_TIMEOUT_SECONDS:-300}"
SYNC_START_TIMEOUT_SECONDS="${OKTETO_SYNC_START_TIMEOUT_SECONDS:-600}"
POLL_INTERVAL_SECONDS="${OKTETO_POLL_INTERVAL_SECONDS:-5}"
SETUP_DOC="docs/agent-okteto.md"
TOKEN_ENV_VAR="LIGHTDASH_OKTETO_TOKEN"
KUBECTL_CONFIGURED=false

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: ./scripts/agent-okteto-dev.sh <start|wait|url>

Requires LIGHTDASH_OKTETO_TOKEN. Commands safely skip when it is unset.

  start  Claim or create this agent session's Okteto environment.
  wait   Wait for file synchronization and application health.
  url    Print the public URL for this Claude session.
EOF
}

require_command() {
    local command_name="$1"
    command -v "$command_name" >/dev/null 2>&1 ||
        fail "Missing required command '$command_name'. See $SETUP_DOC."
}

extract_session_id() {
    local hook_input="$1" session_id

    session_id="$(
        printf '%s\n' "$hook_input" |
            sed -nE 's/.*"session_id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' |
            head -n 1
    )"

    [ -n "$session_id" ] || return 1
    [[ "$session_id" =~ ^[A-Za-z0-9._:-]+$ ]] || return 1

    printf '%s' "$session_id"
}

hook_start() {
    local hook_input hook_output ready_line session_id

    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] || return 0

    hook_input="$(cat)"
    if [ -z "${CLAUDE_ENV_FILE:-}" ]; then
        hook_setup_failed "CLAUDE_ENV_FILE is unavailable."
        return
    fi
    if ! session_id="$(extract_session_id "$hook_input")"; then
        hook_setup_failed "Claude SessionStart input has no usable session_id."
        return
    fi

    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    if ! printf 'export LIGHTDASH_AGENT_SESSION_ID=%s\n' \
        "$session_id" >>"$CLAUDE_ENV_FILE"; then
        hook_setup_failed "Could not persist the Claude session ID."
        return
    fi

    if ! hook_output="$(bash "$SCRIPT_DIR/agent-okteto-dev.sh" start 2>&1)"; then
        printf '%s\n' "$hook_output" >&2
        hook_setup_failed "Okteto startup failed."
        return
    fi

    ready_line="$(
        printf '%s\n' "$hook_output" |
            grep '^READY: https://' |
            tail -n 1 ||
            true
    )"
    if [ -z "$ready_line" ]; then
        printf '%s\n' "$hook_output" >&2
        hook_setup_failed "Okteto startup finished without a ready URL."
        return
    fi

    printf '%s\n' "$ready_line"
}

hook_setup_failed() {
    local detail="$1"

    printf '%s\n' "$detail" >&2
    printf '%s\n' \
        '{"continue":false,"stopReason":"Lightdash Okteto setup failed before Claude could start. Check the SessionStart hook error and docs/agent-okteto.md, fix the setup, then resume the session."}'
}

hook_prompt() {
    local hook_input session_id

    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] || return 0

    hook_input="$(cat)"
    session_id="$(extract_session_id "$hook_input")" || {
        echo "Lightdash Okteto setup is not ready: no usable Claude session ID." >&2
        exit 2
    }

    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    if ! bash "$SCRIPT_DIR/agent-okteto-dev.sh" check-ready >/dev/null 2>&1; then
        echo "Lightdash Okteto setup did not reach READY. Fix the SessionStart setup error, then resubmit the prompt." >&2
        exit 2
    fi
}

hook_stop() {
    local hook_input hook_output last_message ready_line ready_url session_id

    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] || return 0

    hook_input="$(cat)"
    session_id="$(extract_session_id "$hook_input")" || {
        echo "Cannot verify Lightdash Okteto readiness: no usable Claude session ID." >&2
        exit 2
    }
    export LIGHTDASH_AGENT_SESSION_ID="$session_id"

    if ! hook_output="$(bash "$SCRIPT_DIR/agent-okteto-dev.sh" start 2>&1)"; then
        printf '%s\n' "$hook_output" >&2
        echo "The Lightdash Okteto environment must be ready before the final response." >&2
        exit 2
    fi

    ready_line="$(
        printf '%s\n' "$hook_output" |
            grep '^READY: https://' |
            tail -n 1 ||
            true
    )"
    ready_url="${ready_line#READY: }"
    last_message="$(
        printf '%s\n' "$hook_input" |
            jq -r '.last_assistant_message // empty'
    )" || {
        echo "Cannot inspect the final response. See $SETUP_DOC." >&2
        exit 2
    }

    if [ -z "$ready_line" ] ||
        ! printf '%s' "$last_message" | grep -Fq "$ready_url"; then
        printf '%s\n' "$ready_line" >&2
        echo "The final response must include the ready testing URL." >&2
        exit 2
    fi
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
    local id saved_namespace saved_url

    id="$(agent_session_id)"
    SESSION_HASH="$(hash_value "$id")"
    SESSION_HASH="${SESSION_HASH:0:16}"
    TMUX_SESSION="ld-okteto-$SESSION_HASH"
    RUN_DIR="${TMPDIR:-/tmp}/lightdash-agent-okteto/$SESSION_HASH"
    LOG_FILE="$RUN_DIR/okteto-up.log"
    NAMESPACE_FILE="$RUN_DIR/namespace"
    URL_FILE="$RUN_DIR/url"
    READY_FILE="$RUN_DIR/ready"

    saved_namespace=""
    if [ -f "$NAMESPACE_FILE" ]; then
        saved_namespace="$(cat "$NAMESPACE_FILE" 2>/dev/null || true)"
    fi
    if [[ "$saved_namespace" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]]; then
        set_active_namespace "$saved_namespace"
    else
        set_active_namespace "${COLD_NAMESPACE_PREFIX}${SESSION_HASH:0:8}"
    fi

    saved_url=""
    if [ -f "$URL_FILE" ]; then
        saved_url="$(cat "$URL_FILE" 2>/dev/null || true)"
    fi
    if [[ "$saved_url" =~ ^https://[A-Za-z0-9.-]+$ ]]; then
        PUBLIC_URL="$saved_url"
    fi
}

set_active_namespace() {
    local namespace="$1" context_host

    OKTETO_NAMESPACE="$namespace"
    context_host="${OKTETO_CONTEXT_URL#*://}"
    context_host="${context_host%%/*}"
    PUBLIC_URL="https://lightdash-${OKTETO_NAMESPACE}.${context_host}"
}

save_active_namespace() {
    mkdir -p "$RUN_DIR"
    printf '%s\n' "$OKTETO_NAMESPACE" >"$NAMESPACE_FILE"
    printf '%s\n' "$PUBLIC_URL" >"$URL_FILE"
}

require_client_runtime() {
    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] ||
        fail "$TOKEN_ENV_VAR is not set. See $SETUP_DOC."

    require_command curl
    require_command jq
    require_command kubectl
    require_command okteto
}

require_runtime() {
    require_client_runtime
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

list_namespaces() {
    okteto namespace list -o json |
        awk '
            found || /^[[:space:]]*\[/ || /^[[:space:]]*\{/ {
                found = 1
                print
            }
        ' |
        jq -r '
            if type == "array" then .
            elif (.items | type) == "array" then .items
            elif (.namespaces | type) == "array" then .namespaces
            else []
            end
            | .[]
            | if type == "string" then . else (.namespace // .name // empty) end
        '
}

namespace_exists() {
    local namespace="${1:-$OKTETO_NAMESPACE}"

    list_namespaces | grep -Fxq "$namespace"
}

ensure_namespace() {
    if namespace_exists; then
        echo "Reusing Okteto namespace $OKTETO_NAMESPACE."
        return
    fi

    echo "Creating Okteto namespace $OKTETO_NAMESPACE..."
    okteto namespace create "$OKTETO_NAMESPACE" --use=false
}

configure_kubectl_access() {
    local namespace="$1"

    [ "$KUBECTL_CONFIGURED" = false ] || return 0
    okteto namespace use "$namespace" >/dev/null
    okteto kubeconfig >/dev/null
    KUBECTL_CONFIGURED=true
}

discover_public_url() {
    local namespace="$1" host

    host="$(
        kubectl -n "$namespace" get ingress -o json 2>/dev/null |
            jq -r '.items[0].spec.rules[0].host // empty'
    )"
    [ -n "$host" ] || return 1
    PUBLIC_URL="https://$host"
}

pool_namespace_resources_are_ready() {
    local namespace="$1" pod_status

    pod_status="$(
        kubectl -n "$namespace" get pods -o json 2>/dev/null |
            jq -r '
                if (.items | length) == 0 then "false"
                else ([.items[].status.containerStatuses[]?.ready] | all)
                end
            '
    )"
    [ "$pod_status" = "true" ] && discover_public_url "$namespace"
}

pool_namespace_is_ready() {
    local namespace="$1"

    kubectl -n "$namespace" get configmap "$POOL_READY_CONFIGMAP" \
        >/dev/null 2>&1 &&
        pool_namespace_resources_are_ready "$namespace"
}

claim_owner() {
    local namespace="$1"

    kubectl -n "$namespace" get configmap "$POOL_CLAIM_CONFIGMAP" \
        -o jsonpath='{.data.session_hash}' 2>/dev/null || true
}

use_claimed_namespace() {
    local namespace="$1"

    set_active_namespace "$namespace"
    discover_public_url "$namespace" || return 1
    save_active_namespace
    echo "Using pre-provisioned Okteto namespace $OKTETO_NAMESPACE."
}

claim_pool_namespace() {
    local namespace owner first_pool_namespace

    first_pool_namespace="$(
        list_namespaces |
            grep "^${POOL_NAMESPACE_PREFIX}" |
            sort |
            head -n 1 ||
            true
    )"
    [ -n "$first_pool_namespace" ] || return 1
    configure_kubectl_access "$first_pool_namespace"

    while IFS= read -r namespace; do
        owner="$(claim_owner "$namespace")"
        if [ "$owner" = "$SESSION_HASH" ]; then
            if use_claimed_namespace "$namespace"; then
                return 0
            fi
        fi
    done < <(list_namespaces | grep "^${POOL_NAMESPACE_PREFIX}" | sort)

    while IFS= read -r namespace; do
        [ -z "$(claim_owner "$namespace")" ] || continue
        pool_namespace_is_ready "$namespace" || continue

        if kubectl -n "$namespace" create configmap "$POOL_CLAIM_CONFIGMAP" \
            --from-literal="session_hash=$SESSION_HASH" \
            --from-literal="claimed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            >/dev/null 2>&1; then
            kubectl -n "$namespace" delete configmap "$POOL_READY_CONFIGMAP" \
                --ignore-not-found >/dev/null 2>&1 || true
            if use_claimed_namespace "$namespace"; then
                return 0
            fi
            return 1
        fi
    done < <(list_namespaces | grep "^${POOL_NAMESPACE_PREFIX}" | sort)

    return 1
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
                mkdir -p "$RUN_DIR"
                printf 'READY: %s\n' "$PUBLIC_URL" >"$READY_FILE"
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
        'exec okteto up %q -f %q -n %q --env %q --env %q' \
        "$OKTETO_SERVICE" \
        "$OKTETO_MANIFEST" \
        "$OKTETO_NAMESPACE" \
        "LIGHTDASH_AGENT_SESSION_HASH=$SESSION_HASH" \
        "SITE_URL=$PUBLIC_URL"
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
    rm -f "$READY_FILE"
    require_runtime
    prepare_runtime_dir
    authenticate

    if tmux_session_exists; then
        echo "Reusing the active Okteto sync process."
        wait_until_ready
        return
    fi

    if claim_pool_namespace; then
        echo "Claimed a ready environment from the shared pool."
    else
        set_active_namespace "${COLD_NAMESPACE_PREFIX}${SESSION_HASH:0:8}"
        save_active_namespace
        ensure_namespace
        echo "No ready pooled environment was available; deploying one now..."
        okteto deploy \
            -f "$OKTETO_MANIFEST" \
            -n "$OKTETO_NAMESPACE" \
            --wait \
            --timeout 8m
        configure_kubectl_access "$OKTETO_NAMESPACE"
        discover_public_url "$OKTETO_NAMESPACE" ||
            fail "No public ingress found in $OKTETO_NAMESPACE."
        save_active_namespace
    fi

    start_tmux_session
    wait_until_ready
}

wait_for_environment() {
    local deadline

    require_runtime
    prepare_runtime_dir
    authenticate

    deadline=$((SECONDS + SYNC_START_TIMEOUT_SECONDS))
    while ! tmux_session_exists; do
        if ((SECONDS >= deadline)); then
            fail "No active Okteto sync process after ${SYNC_START_TIMEOUT_SECONDS}s. See logs in $RUN_DIR and $SETUP_DOC."
        fi
        echo "Waiting for the Okteto deployment to start syncing..."
        sleep "$POLL_INTERVAL_SECONDS"
    done

    if [ -f "$NAMESPACE_FILE" ]; then
        set_active_namespace "$(cat "$NAMESPACE_FILE")"
    fi
    if [ -f "$URL_FILE" ]; then
        PUBLIC_URL="$(cat "$URL_FILE")"
    fi
    wait_until_ready
}

main() {
    local command_name="${1:-}"

    case "$command_name" in
        hook-start)
            hook_start
            ;;
        hook-prompt)
            hook_prompt
            ;;
        hook-stop)
            hook_stop
            ;;
        start | wait | url | check-ready)
            if [ -z "${LIGHTDASH_OKTETO_TOKEN:-}" ]; then
                echo "SKIPPED: $TOKEN_ENV_VAR is not set."
                return
            fi

            load_session_config
            case "$command_name" in
                start) start_environment ;;
                wait) wait_for_environment ;;
                url) echo "$PUBLIC_URL" ;;
                check-ready) [ -s "$READY_FILE" ] ;;
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
