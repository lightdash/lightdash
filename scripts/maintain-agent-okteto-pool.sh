#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OKTETO_CONTEXT_URL="${OKTETO_CONTEXT:-https://lightdash.okteto.dev}"
OKTETO_MANIFEST="$REPO_ROOT/okteto.dev.yaml"
POOL_NAMESPACE_PREFIX="dev-warm-"
POOL_CLAIM_CONFIGMAP="lightdash-agent-claim"
POOL_READY_CONFIGMAP="lightdash-agent-ready"
TARGET_SIZE="${1:-${LIGHTDASH_AGENT_POOL_SIZE:-3}}"
READY_TIMEOUT_SECONDS="${OKTETO_POOL_READY_TIMEOUT_SECONDS:-600}"
POLL_INTERVAL_SECONDS="${OKTETO_POOL_POLL_INTERVAL_SECONDS:-10}"
WARM_IMAGE="${DEV_WARM_IMAGE:-okteto.global/lightdash-dev-warm:latest}"
FORCE_REFRESH="${OKTETO_FORCE_POOL_REFRESH:-false}"
KUBECTL_CONFIGURED=false

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
    local namespace="$1" host

    host="$(
        kubectl -n "$namespace" get ingress -o json 2>/dev/null |
            jq -r '.items[0].spec.rules[0].host // empty'
    )"
    [ -n "$host" ] || return 1
    printf 'https://%s' "$host"
}

namespace_is_claimed() {
    kubectl -n "$1" get configmap "$POOL_CLAIM_CONFIGMAP" >/dev/null 2>&1
}

namespace_is_ready() {
    local namespace="$1" prepared_image running_image

    prepared_image="$(
        kubectl -n "$namespace" get configmap "$POOL_READY_CONFIGMAP" \
            -o jsonpath='{.data.warm_image}' 2>/dev/null ||
            true
    )"
    running_image="$(namespace_warm_image "$namespace" || true)"
    [ -n "$prepared_image" ] &&
        [ "$prepared_image" = "$running_image" ] &&
        namespace_resources_are_ready "$namespace"
}

namespace_resources_are_ready() {
    local namespace="$1" pod_status

    pod_status="$(
        kubectl -n "$namespace" get pods -o json 2>/dev/null |
            jq -r '
                if (.items | length) == 0 then "false"
                else ([.items[].status.containerStatuses[]?.ready] | all)
                end
            '
    )"
    [ "$pod_status" = "true" ] && namespace_url "$namespace" >/dev/null
}

wait_for_namespace_ready() {
    local namespace="$1" deadline

    deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
    while ((SECONDS < deadline)); do
        if namespace_resources_are_ready "$namespace"; then
            return 0
        fi
        echo "Waiting for $namespace pods and ingress..."
        sleep "$POLL_INTERVAL_SECONDS"
    done

    echo "ERROR: Timed out waiting for $namespace pods and ingress." >&2
    return 1
}

configure_kubectl_access() {
    local namespace="$1"

    [ "$KUBECTL_CONFIGURED" = false ] || return 0
    okteto namespace use "$namespace" >/dev/null
    okteto kubeconfig >/dev/null
    KUBECTL_CONFIGURED=true
}

namespace_warm_image() {
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

mark_namespace_ready() {
    local namespace="$1" warm_image

    warm_image="$(namespace_warm_image "$namespace")" ||
        fail "Could not resolve the warm image digest in $namespace."

    kubectl -n "$namespace" create configmap "$POOL_READY_CONFIGMAP" \
        --from-literal="prepared_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --from-literal="warm_image=$warm_image" \
        --dry-run=client -o yaml |
        kubectl -n "$namespace" apply -f - >/dev/null
}

deploy_namespace() {
    local namespace="$1"

    kubectl -n "$namespace" delete configmap "$POOL_READY_CONFIGMAP" \
        --ignore-not-found >/dev/null 2>&1 || true
    DEV_WARM_IMAGE="$WARM_IMAGE" okteto deploy \
        -f "$OKTETO_MANIFEST" \
        -n "$namespace" \
        --wait \
        --timeout 20m
    if [ "$FORCE_REFRESH" = "true" ]; then
        kubectl -n "$namespace" rollout restart deployment/lightdash-dev
        kubectl -n "$namespace" rollout status deployment/lightdash-dev \
            --timeout="${READY_TIMEOUT_SECONDS}s"
    fi
    if ! wait_for_namespace_ready "$namespace"; then
        return 1
    fi
    namespace_is_claimed "$namespace" || mark_namespace_ready "$namespace"
    return 0
}

create_pool_namespace() {
    local namespace="$1"

    echo "Creating pooled namespace $namespace..."
    if ! okteto namespace create "$namespace" --use=false; then
        echo "Namespace $namespace was created concurrently; trying another."
        return 1
    fi
    configure_kubectl_access "$namespace"
    deploy_namespace "$namespace"
    return 0
}

next_pool_index() {
    local highest

    highest="$(
        list_namespaces |
            sed -nE "s/^${POOL_NAMESPACE_PREFIX}([0-9]+)$/\\1/p" |
            sort -n |
            tail -n 1
    )"
    printf '%s' "$(( ${highest:-0} + 1 ))"
}

main() {
    local available=0 attempts=0 created=0 namespace max_attempts
    local first_pool_namespace next_index

    [[ "$TARGET_SIZE" =~ ^[1-9][0-9]*$ ]] ||
        fail "Pool size must be a positive integer."
    max_attempts=$((TARGET_SIZE + 3))

    for command_name in jq kubectl okteto; do
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

    first_pool_namespace="$(
        list_namespaces |
            grep "^${POOL_NAMESPACE_PREFIX}" |
            sort |
            head -n 1 ||
            true
    )"
    if [ -n "$first_pool_namespace" ]; then
        configure_kubectl_access "$first_pool_namespace"
    fi

    while IFS= read -r namespace; do
        namespace_is_claimed "$namespace" && continue

        if [ "$FORCE_REFRESH" != "true" ] &&
            namespace_is_ready "$namespace"; then
            available=$((available + 1))
            continue
        fi

        echo "Repairing pooled namespace $namespace..."
        if deploy_namespace "$namespace" && namespace_is_ready "$namespace"; then
            available=$((available + 1))
        fi
    done < <(list_namespaces | grep "^${POOL_NAMESPACE_PREFIX}" | sort)

    next_index="$(next_pool_index)"

    while ((available < TARGET_SIZE && attempts < max_attempts)); do
        attempts=$((attempts + 1))
        namespace="${POOL_NAMESPACE_PREFIX}${next_index}"
        next_index=$((next_index + 1))

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
