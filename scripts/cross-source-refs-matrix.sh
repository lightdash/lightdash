#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
shopt -s nullglob

declare -A executables=()
for executable in /root/.lightdash/dev-venv*/bin/dbt /usr/local/bin/dbt1.*; do
    [[ -x "$executable" ]] || continue
    version=$("$executable" --version 2>/dev/null | sed -nE 's/^[[:space:]]*- installed:[[:space:]]*([0-9]+\.[0-9]+).*/\1/p')
    [[ -n "$version" ]] || continue
    if [[ -z ${executables[$version]+installed} ]]; then
        executables["$version"]="$executable"
    fi
done

if [[ ${#executables[@]} -eq 0 ]]; then
    printf 'No installed dbt versions found\n' >&2
    exit 1
fi

failed=0
while IFS= read -r version; do
    if LIGHTDASH_TEST_DBT_EXECUTABLES="$version=${executables[$version]}" \
        pnpm -F backend test src/projectAdapters/crossSourceRefs.realDbt.test.ts; then
        printf 'dbt %s: PASS\n' "$version"
    else
        printf 'dbt %s: FAIL\n' "$version"
        failed=1
    fi
done < <(printf '%s\n' "${!executables[@]}" | sort -V)

exit "$failed"
