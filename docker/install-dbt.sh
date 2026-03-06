#!/usr/bin/env bash
# Installs all dbt versions from dbt-versions.json into /opt/dbt/ using uv.
# Expects: uv, jq, python3 available on PATH.
# Expects: /tmp/dbt-versions.json to exist.
set -euo pipefail

mkdir -p /opt/dbt/bin

count=$(jq '.versions | length' /tmp/dbt-versions.json)

for i in $(seq 0 $((count - 1))); do
    dbt_alias=$(jq -r ".versions[$i].alias" /tmp/dbt-versions.json)
    echo "=== Installing $dbt_alias ==="

    uv venv --python /usr/bin/python3 "/opt/dbt/$dbt_alias"

    mapfile -t packages < <(jq -r ".versions[$i].packages[]" /tmp/dbt-versions.json)
    uv pip install --link-mode=copy --python "/opt/dbt/$dbt_alias/bin/python" "${packages[@]}"

    ln -sf "../$dbt_alias/bin/dbt" "/opt/dbt/bin/$dbt_alias"
done

default_version=$(jq -r '.defaultVersion' /tmp/dbt-versions.json)
ln -sf "../$default_version/bin/dbt" "/opt/dbt/bin/dbt"

echo "Available: $(ls /opt/dbt/bin/ | sort -t. -k2 -n | tr '\n' ' ')"
echo "Default: dbt -> $default_version"
