#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OKTETO_CONTEXT_URL="${OKTETO_CONTEXT:-https://lightdash.okteto.dev}"
OKTETO_MANIFEST="$REPO_ROOT/okteto.dev.yaml"
POOL_NAMESPACE_PREFIX="agent-pool-"
POOL_CLAIM_CONFIGMAP="lightdash-agent-claim"
POOL_READY_CONFIGMAP="lightdash-agent-ready"
TARGET_SIZE="${1:-${LIGHTDASH_AGENT_POOL_SIZE:-3}}"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || fail "Missing required command '$1'."
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

namespace_url() {
    local namespace="$1" context_host

    context_host="${OKTETO_CONTEXT_URL#*://}"
    context_host="${context_host%%/*}"
    printf 'https://lightdash-%s.%s' "$namespace" "$context_host"
}

namespace_is_claimed() {
    kubectl -n "$1" get configmap "$POOL_CLAIM_CONFIGMAP" >/dev/null 2>&1
}

namespace_is_ready() {
    local namespace="$1"

    kubectl -n "$namespace" get configmap "$POOL_READY_CONFIGMAP" \
        >/dev/null 2>&1 &&
        curl --fail --silent --show-error --max-time 10 \
            "$(namespace_url "$namespace")/api/v1/health" >/dev/null 2>&1
}

mark_namespace_ready() {
    local namespace="$1"

    kubectl -n "$namespace" create configmap "$POOL_READY_CONFIGMAP" \
        --from-literal="prepared_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --dry-run=client -o yaml |
        kubectl -n "$namespace" apply -f - >/dev/null
}

deploy_namespace() {
    local namespace="$1"

    kubectl -n "$namespace" delete configmap "$POOL_READY_CONFIGMAP" \
        --ignore-not-found >/dev/null 2>&1 || true
    okteto deploy \
        -f "$OKTETO_MANIFEST" \
        -n "$namespace" \
        --wait \
        --timeout 20m
    namespace_is_claimed "$namespace" || mark_namespace_ready "$namespace"
}

create_pool_namespace() {
    local namespace="$1"

    echo "Creating pooled namespace $namespace..."
    okteto namespace create "$namespace" --use=false
    deploy_namespace "$namespace"
}

main() {
    local available=0 attempts=0 created=0 namespace run_key max_attempts
    local -a pool_namespaces=()

    [[ "$TARGET_SIZE" =~ ^[1-9][0-9]*$ ]] ||
        fail "Pool size must be a positive integer."
    max_attempts=$((TARGET_SIZE + 6))

    for command_name in curl jq kubectl okteto; do
        require_command "$command_name"
    done
    [ -n "${LIGHTDASH_OKTETO_TOKEN:-}" ] ||
        fail "LIGHTDASH_OKTETO_TOKEN is not set."

    RUNTIME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lightdash-okteto-pool.XXXXXX")"
    trap 'rm -rf "$RUNTIME_DIR"' EXIT
    export OKTETO_HOME="$RUNTIME_DIR/okteto-home"
    export KUBECONFIG="$RUNTIME_DIR/kubeconfig"
    mkdir -p "$OKTETO_HOME"

    okteto context use "$OKTETO_CONTEXT_URL" \
        --token "$LIGHTDASH_OKTETO_TOKEN" >/dev/null

    while IFS= read -r namespace; do
        pool_namespaces+=("$namespace")
    done < <(list_namespaces | grep "^${POOL_NAMESPACE_PREFIX}" | sort)

    for namespace in "${pool_namespaces[@]}"; do
        namespace_is_claimed "$namespace" && continue

        if namespace_is_ready "$namespace"; then
            available=$((available + 1))
            continue
        fi

        echo "Repairing pooled namespace $namespace..."
        if deploy_namespace "$namespace" && namespace_is_ready "$namespace"; then
            available=$((available + 1))
        fi
    done

    run_key="${GITHUB_RUN_ID:-$(date -u +%Y%m%d%H%M%S)-$$}-${GITHUB_RUN_ATTEMPT:-1}"
    run_key="$(printf '%s' "$run_key" | tr -cd 'a-zA-Z0-9-' | tr 'A-Z' 'a-z')"

    while ((available < TARGET_SIZE && attempts < max_attempts)); do
        attempts=$((attempts + 1))
        namespace="${POOL_NAMESPACE_PREFIX}${run_key}-${attempts}"

        if create_pool_namespace "$namespace" &&
            namespace_is_ready "$namespace"; then
            available=$((available + 1))
            created=$((created + 1))
        fi
    done

    ((available >= TARGET_SIZE)) ||
        fail "Only $available of $TARGET_SIZE pooled environments are ready."

    echo "READY: $available unclaimed Okteto environments ($created created)."
}

main "$@"
