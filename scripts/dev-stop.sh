#!/usr/bin/env bash

set -uo pipefail

ACTION="${1:-}"
[ $# -gt 0 ] && shift

DRY_RUN=false
INSTANCE_OVERRIDE=""
INSTANCE_OVERRIDE_SET=false

usage() {
    echo "Usage: $0 {stop|destroy|stop-all} [--dry-run] [--instance-id NAME]" >&2
}

fail() {
    echo "FAIL: $1 -- $2" >&2
    exit 1
}

step() {
    echo "STEP: $1"
}

print_would() {
    printf 'would:'
    printf ' %q' "$@"
    printf '\n'
}

while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --instance-id)
            if [ $# -lt 2 ]; then
                usage
                echo "FAIL: args -- --instance-id requires a value" >&2
                exit 2
            fi
            [ -n "$2" ] || fail "instance" "instance id resolved empty"
            INSTANCE_OVERRIDE="$2"
            INSTANCE_OVERRIDE_SET=true
            shift 2
            ;;
        *)
            usage
            echo "FAIL: args -- unknown argument '$1'" >&2
            exit 2
            ;;
    esac
done

case "$ACTION" in
    stop|destroy|stop-all) ;;
    *)
        usage
        echo "FAIL: args -- expected stop, destroy, or stop-all" >&2
        exit 2
        ;;
esac

if [ "$ACTION" = "stop-all" ] && [ "$INSTANCE_OVERRIDE_SET" = true ]; then
    fail "args" "--instance-id cannot be used with stop-all"
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || fail "cd" "cannot enter repo root $REPO_ROOT"

. "$REPO_ROOT/scripts/dev-instance-lib.sh"

REGISTRY_DIR="$HOME/.lightdash/dev-instances"
INSTANCE_COMPOSE="docker/docker-compose.dev.instance.yml"
SHARED_COMPOSE="docker/docker-compose.dev.shared.yml"

command -v python3 >/dev/null 2>&1 || fail "prerequisites" "python3 is required"
command -v docker >/dev/null 2>&1 || fail "prerequisites" "docker is required"
command -v pm2 >/dev/null 2>&1 || fail "prerequisites" "pm2 is required"

validate_instance_id() {
    local instance_id="$1"
    [ -n "$instance_id" ] || fail "instance" "instance id resolved empty"
    case "$instance_id" in
        .|..|*/*) fail "instance" "invalid instance id '$instance_id'" ;;
    esac
}

validate_instance_project() {
    local compose_project="$1"
    [ -n "$compose_project" ] || fail "instance" "compose project resolved empty"
    [ "$compose_project" != "ld-shared" ] || fail "instance" "refusing to treat ld-shared as an instance project"
}

load_instance_env() {
    local env_exports=""
    local fallback_instance_id=""

    if [ "$INSTANCE_OVERRIDE_SET" = true ]; then
        if env_exports="$(./scripts/dev-ports.sh env --instance-id "$INSTANCE_OVERRIDE" 2>/dev/null)"; then
            eval "$env_exports"
        else
            fallback_instance_id="$INSTANCE_OVERRIDE"
        fi
    elif env_exports="$(./scripts/dev-ports.sh env 2>/dev/null)"; then
        eval "$env_exports"
    else
        fallback_instance_id="$(sed -n -E 's/^LD_INSTANCE_ID=(.*)$/\1/p' .env.development.local 2>/dev/null | head -n 1 | sed -E "s/^['\"](.*)['\"]$/\1/")"
        [ -n "$fallback_instance_id" ] || fallback_instance_id="$(basename "$REPO_ROOT")"
    fi

    if [ -n "$fallback_instance_id" ]; then
        LD_INSTANCE_ID="$fallback_instance_id"
        LD_COMPOSE_PROJECT="ld-$(printf '%s' "$LD_INSTANCE_ID" | tr '[:upper:]' '[:lower:]')"
        LD_VOLUME_PREFIX="$LD_COMPOSE_PROJECT"
        LD_CONTAINER_PREFIX="$LD_COMPOSE_PROJECT"
        export LD_INSTANCE_ID LD_COMPOSE_PROJECT LD_VOLUME_PREFIX LD_CONTAINER_PREFIX
        echo "SKIP: registry entry missing; derived deterministic names for instance=$LD_INSTANCE_ID"
    fi

    validate_instance_id "${LD_INSTANCE_ID:-}"
    validate_instance_project "${LD_COMPOSE_PROJECT:-}"
    [ -n "${LD_VOLUME_PREFIX:-}" ] || fail "instance" "volume prefix resolved empty"
    [ -n "${LD_CONTAINER_PREFIX:-}" ] || fail "instance" "container prefix resolved empty"

    if [ "$INSTANCE_OVERRIDE_SET" = true ] && [ "$LD_INSTANCE_ID" != "$INSTANCE_OVERRIDE" ]; then
        fail "instance" "resolved '$LD_INSTANCE_ID' instead of override '$INSTANCE_OVERRIDE'"
    fi

    echo "OK: instance=$LD_INSTANCE_ID compose=$LD_COMPOSE_PROJECT"
}

pm2_names_present() {
    local instance_id="$1"
    local expected_names
    expected_names="$(instance_pm2_names "$instance_id")" || return 1

    pm2 jlist 2>/dev/null | EXPECTED_NAMES="$expected_names" python3 -c '
import json
import os
import sys

expected = set(os.environ["EXPECTED_NAMES"].splitlines())
processes = json.load(sys.stdin)
for name in sorted(p.get("name", "") for p in processes):
    if name in expected:
        print(name)
'
}

line_is_present() {
    local lines="$1"
    local expected="$2"
    printf '%s\n' "$lines" | grep -Fqx -- "$expected"
}

delete_instance_pm2() {
    local instance_id="$1"
    local present_names=""
    local name

    if [ "$DRY_RUN" = true ]; then
        for name in $(instance_pm2_names "$instance_id"); do
            print_would pm2 delete "$name"
        done
        return
    fi

    present_names="$(pm2_names_present "$instance_id")" || fail "pm2" "could not list PM2 processes"
    for name in $(instance_pm2_names "$instance_id"); do
        if line_is_present "$present_names" "$name"; then
            pm2 delete "$name" >/dev/null 2>&1 || fail "pm2" "could not delete process $name"
            echo "OK: deleted PM2 process $name"
        else
            echo "SKIP: PM2 process $name is not running"
        fi
    done
}

compose_resources() {
    local compose_project="$1"
    docker ps -a --filter "label=com.docker.compose.project=$compose_project" --format 'container {{.Names}}'
    docker network ls --filter "label=com.docker.compose.project=$compose_project" --format 'network {{.Name}}'
}

stop_instance_compose() {
    local compose_project="$1"
    local resources=""

    if [ "$DRY_RUN" = true ]; then
        print_would docker compose -p "$compose_project" -f "$INSTANCE_COMPOSE" down
        return
    fi

    resources="$(compose_resources "$compose_project")" || fail "docker" "could not inspect compose project $compose_project"
    if [ -z "$resources" ]; then
        echo "SKIP: compose project $compose_project is already down"
        return
    fi

    docker compose -p "$compose_project" -f "$INSTANCE_COMPOSE" down || fail "docker" "could not stop compose project $compose_project"
    echo "OK: compose project $compose_project stopped"
}

release_instance() {
    local instance_id="$1"
    local registry_file="$REGISTRY_DIR/${instance_id}.json"

    if [ "$DRY_RUN" = true ]; then
        if [ -f "$registry_file" ]; then
            print_would ./scripts/dev-ports.sh release --instance-id "$instance_id"
        else
            echo "SKIP: instance $instance_id has no registry entry"
        fi
        return
    fi

    if [ ! -f "$registry_file" ]; then
        echo "SKIP: instance $instance_id has no registry entry"
        return
    fi

    ./scripts/dev-ports.sh release --instance-id "$instance_id" || fail "ports" "could not release instance $instance_id"
    echo "OK: released port slot for instance $instance_id"
}

stop_instance() {
    local instance_id="$1"
    local compose_project="$2"
    local release_port_slot="$3"

    validate_instance_id "$instance_id"
    validate_instance_project "$compose_project"

    step "Stop PM2 processes for $instance_id"
    delete_instance_pm2 "$instance_id"
    step "Stop Docker services for $instance_id"
    stop_instance_compose "$compose_project"
    if [ "$release_port_slot" = true ]; then
        step "Release port slot for $instance_id"
        release_instance "$instance_id"
    fi
    if [ "$ACTION" != "destroy" ]; then
        echo "OK: volumes kept for instance $instance_id"
    fi
}

validate_destroy_volume() {
    local volume="$1"
    case "$volume" in
        ld-shared_*) fail "volumes" "refusing to remove shared volume $volume" ;;
        "${LD_VOLUME_PREFIX}_"*) ;;
        *) fail "volumes" "refusing to remove volume outside prefix ${LD_VOLUME_PREFIX}_: $volume" ;;
    esac
}

remove_destroy_volume() {
    local volume="$1"
    validate_destroy_volume "$volume"

    if [ "$DRY_RUN" = true ]; then
        print_would docker volume rm "$volume"
    elif docker volume inspect "$volume" >/dev/null 2>&1; then
        docker volume rm "$volume" >/dev/null || fail "volumes" "could not remove volume $volume"
        echo "OK: removed volume $volume"
    else
        echo "SKIP: volume $volume does not exist"
    fi
}

destroy_instance_volumes() {
    local all_volumes=""
    local volume

    all_volumes="$(docker volume ls -q 2>/dev/null)" || fail "volumes" "could not list Docker volumes"

    remove_destroy_volume "${LD_VOLUME_PREFIX}_postgres_data"
    remove_destroy_volume "${LD_VOLUME_PREFIX}_postgres_data_snapshot"

    for volume in $all_volumes; do
        case "$volume" in
            "${LD_VOLUME_PREFIX}_postgres_data_snapshot_"*) remove_destroy_volume "$volume" ;;
        esac
    done
}

instance_records() {
    REGISTRY_DIR="$REGISTRY_DIR" python3 -c '
import glob
import json
import os

for path in sorted(glob.glob(os.path.join(os.environ["REGISTRY_DIR"], "*.json"))):
    with open(path, encoding="utf-8") as file:
        data = json.load(file)
    print(f"{data['"'"'instanceId'"'"']}\t{data['"'"'composeProject'"'"']}")
'
}

stop_shared_compose() {
    local resources=""

    if [ "$DRY_RUN" = true ]; then
        print_would docker compose -p ld-shared -f "$SHARED_COMPOSE" down
        return
    fi

    resources="$(compose_resources ld-shared)" || fail "docker" "could not inspect shared compose project"
    if [ -z "$resources" ]; then
        echo "SKIP: shared compose project is already down"
        return
    fi

    docker compose -p ld-shared -f "$SHARED_COMPOSE" down || fail "docker" "could not stop shared compose project"
    echo "OK: shared compose project stopped"
}

verify_instance() {
    local instance_id="$1"
    local compose_project="$2"
    local pm2_survivors=""
    local container_survivors=""

    pm2_survivors="$(pm2_names_present "$instance_id")" || {
        echo "FAIL: verify -- could not list PM2 processes for $instance_id" >&2
        return 1
    }
    container_survivors="$(docker ps -a --filter "label=com.docker.compose.project=$compose_project" --format '{{.Names}}')" || {
        echo "FAIL: verify -- could not list containers for $compose_project" >&2
        return 1
    }

    if [ -n "$pm2_survivors" ]; then
        echo "FAIL: verify -- PM2 survivors for $instance_id: $(printf '%s' "$pm2_survivors" | tr '\n' ' ')" >&2
        return 1
    fi
    if [ -n "$container_survivors" ]; then
        echo "FAIL: verify -- container survivors for $compose_project: $(printf '%s' "$container_survivors" | tr '\n' ' ')" >&2
        return 1
    fi

    echo "OK: no survivors for instance $instance_id"
}

run_single_instance() {
    step "Resolve instance environment"
    load_instance_env

    stop_instance "$LD_INSTANCE_ID" "$LD_COMPOSE_PROJECT" true

    if [ "$ACTION" = "destroy" ]; then
        step "Remove volumes for $LD_INSTANCE_ID"
        destroy_instance_volumes
    fi

    if [ "$DRY_RUN" = true ]; then
        echo "SKIP: dry run; no changes made"
        return
    fi

    step "Verify teardown for $LD_INSTANCE_ID"
    verify_instance "$LD_INSTANCE_ID" "$LD_COMPOSE_PROJECT" || exit 1
}

run_stop_all() {
    local records=""
    local instance_id=""
    local compose_project=""
    local verify_failed=0

    step "Load registered instances"
    records="$(instance_records)" || fail "instances" "could not read instance registry"
    if [ -z "$records" ]; then
        echo "SKIP: no registered instances"
    else
        while IFS="$(printf '\t')" read -r instance_id compose_project; do
            [ -n "$instance_id" ] || continue
            echo "OK: found instance=$instance_id compose=$compose_project"
        done <<EOF
$records
EOF
    fi

    while IFS="$(printf '\t')" read -r instance_id compose_project; do
        [ -n "$instance_id" ] || continue
        stop_instance "$instance_id" "$compose_project" false
    done <<EOF
$records
EOF

    step "Stop shared Docker services"
    stop_shared_compose

    step "Release all port slots"
    while IFS="$(printf '\t')" read -r instance_id compose_project; do
        [ -n "$instance_id" ] || continue
        release_instance "$instance_id"
    done <<EOF
$records
EOF

    if [ "$DRY_RUN" = true ]; then
        echo "SKIP: dry run; no changes made"
        return
    fi

    step "Verify all instance teardowns"
    while IFS="$(printf '\t')" read -r instance_id compose_project; do
        [ -n "$instance_id" ] || continue
        verify_instance "$instance_id" "$compose_project" || verify_failed=1
    done <<EOF
$records
EOF

    [ "$verify_failed" -eq 0 ] || exit 1
    echo "OK: no survivors"
}

case "$ACTION" in
    stop|destroy) run_single_instance ;;
    stop-all) run_stop_all ;;
esac
