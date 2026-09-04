#!/bin/bash
set -e

# Size the V8 heap from the container memory limit.
#
# The image sets no heap flag at runtime: the --max-old-space-size in the Dockerfile lives in
# the prod-builder stage and runtime-base builds from pnpm-base, so it is never inherited, and
# the helm chart sets no NODE_OPTIONS. Node then derives the heap itself, and it does so in
# plateaus rather than as a fraction of the limit: every limit between 4 and 15 GiB yields the
# same 2,240 MB heap, so raising a pod from 4 GiB to 12 GiB changes nothing.
#
# 75% leaves room for non-heap RSS. The Node peak lands after the dbt subprocess peak rather
# than on top of it, page cache inside the cgroup is reclaimed before an OOM, and the scheduler
# shares one heap across its concurrent jobs, so the ceiling does not multiply.
#
# This is a ceiling, not a reservation, so it only changes runs that would otherwise abort.
# Setting it too high trades a clean exit 134 with a heap message for an exit 137 kernel kill
# with no message and possibly orphaned dbt children.
readonly LIGHTDASH_HEAP_PERCENT=75
readonly LIGHTDASH_MIN_CONTAINER_LIMIT_BYTES=$((512 * 1024 * 1024))
readonly LIGHTDASH_MAX_CONTAINER_LIMIT_BYTES=$((1024 * 1024 * 1024 * 1024))

read_cgroup_memory_limit_bytes() {
    local value
    # cgroup v2, then v1. "max" means unlimited; v1 reports a sentinel near 2^63 instead.
    if [ -r /sys/fs/cgroup/memory.max ]; then
        value=$(cat /sys/fs/cgroup/memory.max 2>/dev/null)
    elif [ -r /sys/fs/cgroup/memory/memory.limit_in_bytes ]; then
        value=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)
    else
        return 1
    fi
    case "$value" in
        '' | max | *[!0-9]*) return 1 ;;
    esac
    if [ "$value" -lt "$LIGHTDASH_MIN_CONTAINER_LIMIT_BYTES" ] ||
        [ "$value" -gt "$LIGHTDASH_MAX_CONTAINER_LIMIT_BYTES" ]; then
        return 1
    fi
    echo "$value"
}

if [ -n "${NODE_OPTIONS:-}" ] && [[ "$NODE_OPTIONS" == *max-old-space-size* ]]; then
    echo "[lightdash] NODE_OPTIONS already sets a heap size, leaving it unchanged: $NODE_OPTIONS"
elif limit_bytes=$(read_cgroup_memory_limit_bytes); then
    heap_mb=$(((limit_bytes / 1024 / 1024) * LIGHTDASH_HEAP_PERCENT / 100))
    export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=${heap_mb}"
    echo "[lightdash] container memory limit $((limit_bytes / 1024 / 1024))MB detected, setting --max-old-space-size=${heap_mb} (${LIGHTDASH_HEAP_PERCENT}%). Set NODE_OPTIONS yourself to override."
else
    echo "[lightdash] no container memory limit readable, leaving the Node heap at its default. Set NODE_OPTIONS=--max-old-space-size=<MB> to control it."
fi

# Migrate db
export LIGHTDASH_MIGRATION_EXECUTION_MODE="${LIGHTDASH_MIGRATION_EXECUTION_MODE:-boot-winner}"
pnpm -F backend migrate-production up

# Run prod
exec "$@"
