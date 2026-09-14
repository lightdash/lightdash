#!/usr/bin/env bash

instance_pm2_names() {
    local instance_id="${1:-${LD_INSTANCE_ID:-}}"
    [ -n "$instance_id" ] || return 1

    local suffix
    for suffix in api api-routes-watch scheduler frontend common-watch formula-watch warehouses-watch sdk-test maple; do
        echo "${instance_id}-${suffix}"
    done
}
