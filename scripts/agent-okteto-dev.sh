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
READY_TIMEOUT_SECONDS="${OKTETO_READY_TIMEOUT_SECONDS:-1700}"
SYNC_START_TIMEOUT_SECONDS="${OKTETO_SYNC_START_TIMEOUT_SECONDS:-600}"
POLL_INTERVAL_SECONDS="${OKTETO_POLL_INTERVAL_SECONDS:-5}"
SETUP_DOC="docs/agent-okteto.md"
TOKEN_ENV_VAR="LIGHTDASH_OKTETO_TOKEN"
KUBECTL_CONFIGURED=false

fail() {
    if [ -n "${STATE_FILE:-}" ]; then
        write_setup_state "FAILED" "$*" || true
    fi
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
    local failure_detail hook_input hook_output ready_line session_id

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
        failure_detail="$(
            printf '%s\n' "$hook_output" |
                grep '^ERROR:' |
                tail -n 1 |
                sed 's/^ERROR:[[:space:]]*//' ||
                true
        )"
        failure_detail="${failure_detail:-Okteto startup command exited unexpectedly. See the session setup log.}"
        load_session_config
        write_setup_state "FAILED" "$failure_detail"
        hook_setup_failed "$failure_detail"
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
    local hook_input session_id status_output

    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] || return 0

    hook_input="$(cat)"
    session_id="$(extract_session_id "$hook_input")" || {
        echo "Lightdash Okteto setup is not ready: no usable Claude session ID." >&2
        exit 2
    }

    export LIGHTDASH_AGENT_SESSION_ID="$session_id"
    if ! status_output="$(
        bash "$SCRIPT_DIR/agent-okteto-dev.sh" setup-status 2>&1
    )"; then
        printf '%s\n' "$status_output" >&2
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
    RUN_DIR="${TMPDIR:-/tmp}/lightdash-agent-okteto/$SESSION_HASH"
    LOG_FILE="$RUN_DIR/okteto-up.log"
    SYNC_PID_FILE="$RUN_DIR/okteto-up.pid"
    NAMESPACE_FILE="$RUN_DIR/namespace"
    URL_FILE="$RUN_DIR/url"
    READY_FILE="$RUN_DIR/ready"
    STATE_FILE="$RUN_DIR/state"
    FAILURE_FILE="$RUN_DIR/failure"
    WARM_IMAGE_FILE="$RUN_DIR/warm-image"
    ACTIVE_WARM_IMAGE="okteto.global/lightdash-dev-warm:latest"

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

    if [ -f "$WARM_IMAGE_FILE" ]; then
        set_active_warm_image "$(cat "$WARM_IMAGE_FILE" 2>/dev/null || true)" ||
            true
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

set_active_warm_image() {
    local image="$1"

    [[ "$image" =~ ^okteto\.global/lightdash-dev-warm@sha256:[a-f0-9]{64}$ ]] ||
        return 1
    ACTIVE_WARM_IMAGE="$image"
    mkdir -p "$RUN_DIR"
    printf '%s\n' "$ACTIVE_WARM_IMAGE" >"$WARM_IMAGE_FILE"
}

write_setup_state() {
    local state="$1" detail="${2:-}"

    mkdir -p "$RUN_DIR"
    printf '%s\n' "$state" >"$STATE_FILE"
    if [ -n "$detail" ]; then
        printf '%s\n' "$detail" >"$FAILURE_FILE"
    else
        rm -f "$FAILURE_FILE"
    fi
}

require_client_runtime() {
    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] ||
        fail "$TOKEN_ENV_VAR is not set. See $SETUP_DOC."

    require_command curl
    require_command jq
    require_command kubectl
    require_command okteto
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
    local namespace="$1" running_image warm_image

    warm_image="$(
        kubectl -n "$namespace" get configmap "$POOL_READY_CONFIGMAP" \
            -o jsonpath='{.data.warm_image}' 2>/dev/null ||
            true
    )"
    running_image="$(namespace_deployed_warm_image "$namespace" || true)"
    [[ "$warm_image" =~ ^okteto\.global/lightdash-dev-warm@sha256:[a-f0-9]{64}$ ]] &&
        [ "$warm_image" = "$running_image" ] &&
        pool_namespace_resources_are_ready "$namespace"
}

claim_owner() {
    local namespace="$1"

    kubectl -n "$namespace" get configmap "$POOL_CLAIM_CONFIGMAP" \
        -o jsonpath='{.data.session_hash}' 2>/dev/null || true
}

claim_warm_image() {
    local namespace="$1"

    kubectl -n "$namespace" get configmap "$POOL_CLAIM_CONFIGMAP" \
        -o jsonpath='{.data.warm_image}' 2>/dev/null || true
}

pool_warm_image() {
    local namespace="$1"

    kubectl -n "$namespace" get configmap "$POOL_READY_CONFIGMAP" \
        -o jsonpath='{.data.warm_image}' 2>/dev/null || true
}

use_claimed_namespace() {
    local namespace="$1" warm_image="${2:-}"

    set_active_namespace "$namespace"
    discover_public_url "$namespace" || return 1
    if [ -n "$warm_image" ]; then
        set_active_warm_image "$warm_image" || return 1
    fi
    save_active_namespace
    echo "Using pre-provisioned Okteto namespace $OKTETO_NAMESPACE."
}

claim_pool_namespace() {
    local namespace owner first_pool_namespace warm_image

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
            warm_image="$(claim_warm_image "$namespace")"
            if use_claimed_namespace "$namespace" "$warm_image"; then
                return 0
            fi
        fi
    done < <(list_namespaces | grep "^${POOL_NAMESPACE_PREFIX}" | sort)

    while IFS= read -r namespace; do
        [ -z "$(claim_owner "$namespace")" ] || continue
        pool_namespace_is_ready "$namespace" || continue
        warm_image="$(pool_warm_image "$namespace")"

        if kubectl -n "$namespace" create configmap "$POOL_CLAIM_CONFIGMAP" \
            --from-literal="session_hash=$SESSION_HASH" \
            --from-literal="claimed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --from-literal="warm_image=$warm_image" \
            >/dev/null 2>&1; then
            kubectl -n "$namespace" delete configmap "$POOL_READY_CONFIGMAP" \
                --ignore-not-found >/dev/null 2>&1 || true
            if use_claimed_namespace "$namespace" "$warm_image"; then
                return 0
            fi
            return 1
        fi
    done < <(list_namespaces | grep "^${POOL_NAMESPACE_PREFIX}" | sort)

    return 1
}

sync_process_exists() {
    local pid

    pid="$(cat "$SYNC_PID_FILE" 2>/dev/null)" || return 1
    [[ "$pid" =~ ^[0-9]+$ ]] || return 1
    # The recorded pid is the script(1) pty wrapper, which exits when okteto
    # does; older pidfiles may point at okteto directly
    ps -p "$pid" -o comm= 2>/dev/null | grep -Eq 'script|okteto'
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

namespace_deployed_warm_image() {
    local namespace="$1" digest image_id

    image_id="$(
        kubectl -n "$namespace" get pods \
            -l stack.okteto.com/service=lightdash-dev \
            -o json 2>/dev/null |
            jq -r '
                [
                    .items[].status.containerStatuses[]?
                    | select(.name == "lightdash-dev")
                    | .imageID
                ][0] // empty
            '
    )"
    digest="${image_id##*@}"
    [[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]] || return 1
    printf 'okteto.global/lightdash-dev-warm@%s' "$digest"
}

discover_deployed_warm_image() {
    local warm_image

    warm_image="$(namespace_deployed_warm_image "$OKTETO_NAMESPACE")" ||
        return 1
    set_active_warm_image "$warm_image"
}

show_log_tail() {
    if [ -s "$LOG_FILE" ]; then
        echo "Last Okteto output:" >&2
        tail -n 80 "$LOG_FILE" >&2
    fi
}

wait_until_ready() {
    local deadline last_report now

    deadline="${START_DEADLINE:-$((SECONDS + READY_TIMEOUT_SECONDS))}"
    last_report=$((SECONDS - 30))

    while ((SECONDS < deadline)); do
        if ! sync_process_exists; then
            show_log_tail
            fail "Okteto file synchronization stopped. See $LOG_FILE."
        fi

        if sync_is_ready && app_is_healthy; then
            sleep 2
            if sync_is_ready && app_is_healthy; then
                mkdir -p "$RUN_DIR"
                printf 'READY: %s\n' "$PUBLIC_URL" >"$READY_FILE"
                write_setup_state "READY"
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

debug_forward_port() {
    local attempts=0 port

    # Stable per-session port so concurrent sessions don't collide on the
    # manifest's default 9230 forward
    port=$((9300 + 16#${SESSION_HASH:0:4} % 500))
    if command -v lsof >/dev/null 2>&1; then
        while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 &&
            ((attempts < 50)); do
            port=$((port + 1))
            attempts=$((attempts + 1))
        done
    fi
    printf '%s' "$port"
}

start_sync_process() {
    local debug_port up_command pty_command

    mkdir -p "$RUN_DIR"
    : >"$LOG_FILE"

    debug_port="$(debug_forward_port)"
    printf -v up_command \
        'cd %q && DEV_WARM_IMAGE=%q OKTETO_DEBUG_PORT=%q exec okteto up %q -f %q -n %q --log-output plain --env %q --env %q --env %q' \
        "$REPO_ROOT" \
        "$ACTIVE_WARM_IMAGE" \
        "$debug_port" \
        "$OKTETO_SERVICE" \
        "$OKTETO_MANIFEST" \
        "$OKTETO_NAMESPACE" \
        "LIGHTDASH_AGENT_SESSION_HASH=$SESSION_HASH" \
        "SITE_URL=$PUBLIC_URL" \
        "DEV_WARM_IMAGE=$ACTIVE_WARM_IMAGE"

    # okteto up requires a terminal; script(1) supplies a pty without tmux.
    # util-linux script (Linux) and BSD script (macOS) take different args.
    if script --version >/dev/null 2>&1; then
        printf -v pty_command 'exec script -qefc %q /dev/null' "$up_command"
    else
        printf -v pty_command 'exec script -q /dev/null bash -c %q' "$up_command"
    fi

    echo "Starting Okteto file synchronization..."
    # setsid detaches the sync from the hook's process group so it survives
    # the SessionStart hook; unavailable on macOS, where nohup+disown suffices
    if command -v setsid >/dev/null 2>&1; then
        setsid nohup bash -c "$pty_command" >>"$LOG_FILE" 2>&1 </dev/null &
    else
        nohup bash -c "$pty_command" >>"$LOG_FILE" 2>&1 </dev/null &
    fi
    printf '%s\n' "$!" >"$SYNC_PID_FILE"
    disown
}

start_environment() {
    START_DEADLINE=$((SECONDS + READY_TIMEOUT_SECONDS))
    rm -f "$READY_FILE"
    write_setup_state "STARTING"
    require_client_runtime
    prepare_runtime_dir
    authenticate

    if sync_process_exists; then
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
        if ! okteto deploy \
            -f "$OKTETO_MANIFEST" \
            -n "$OKTETO_NAMESPACE" \
            --var "DEV_WARM_IMAGE=$ACTIVE_WARM_IMAGE" \
            --wait \
            --timeout 8m; then
            fail "Okteto deployment failed in $OKTETO_NAMESPACE."
        fi
        configure_kubectl_access "$OKTETO_NAMESPACE"
        discover_public_url "$OKTETO_NAMESPACE" ||
            fail "No public ingress found in $OKTETO_NAMESPACE."
        discover_deployed_warm_image ||
            fail "Could not resolve the deployed warm image digest in $OKTETO_NAMESPACE."
        save_active_namespace
    fi

    start_sync_process
    wait_until_ready
}

wait_for_environment() {
    local deadline

    require_client_runtime
    prepare_runtime_dir
    authenticate

    deadline=$((SECONDS + SYNC_START_TIMEOUT_SECONDS))
    while ! sync_process_exists; do
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

setup_status() {
    local detail state

    state="$(cat "$STATE_FILE" 2>/dev/null || true)"
    case "$state" in
        READY)
            [ -s "$READY_FILE" ] && return 0
            echo "Lightdash Okteto setup lost its READY marker. Resume the session to verify it again." >&2
            ;;
        STARTING)
            echo "Lightdash Okteto setup is still starting. Wait for the SessionStart hook to finish, then resubmit the prompt." >&2
            ;;
        FAILED)
            detail="$(cat "$FAILURE_FILE" 2>/dev/null || true)"
            echo "Lightdash Okteto setup failed: ${detail:-unknown setup error}. Resume the session after fixing it." >&2
            ;;
        *)
            echo "Lightdash Okteto setup has not started. Resume the session to run the startup gate." >&2
            ;;
    esac
    return 1
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
        start | wait | url | check-ready | setup-status)
            if [ -z "${LIGHTDASH_OKTETO_TOKEN:-}" ]; then
                echo "SKIPPED: $TOKEN_ENV_VAR is not set."
                return
            fi

            load_session_config
            case "$command_name" in
                start) start_environment ;;
                wait) wait_for_environment ;;
                url) echo "$PUBLIC_URL" ;;
                check-ready) setup_status >/dev/null 2>&1 ;;
                setup-status) setup_status ;;
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
