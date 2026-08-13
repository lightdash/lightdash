#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

base_verdict='{
  "coveredVersions": ["1.2.4"],
  "direction": "forward",
  "fromVersion": "1.2.3",
  "minPreviousVersion": null,
  "missingRanges": [],
  "requiredStops": [],
  "safe": true,
  "toVersion": "1.2.4",
  "verdict": true
}'

failures=0

with_field() {
    local field=$1
    local value=$2
    jq -c --argjson value "$value" ".${field} = \$value" <<<"$base_verdict"
}

expect_accepted() {
    local label=$1
    local payload=$2
    if ! printf '%s' "$payload" | validate_verdict_json; then
        printf 'expected %s to be accepted\n' "$label" >&2
        failures=$((failures + 1))
    fi
}

expect_rejected() {
    local label=$1
    local payload=$2
    if printf '%s' "$payload" | validate_verdict_json 2>/dev/null; then
        printf 'expected %s to be rejected\n' "$label" >&2
        failures=$((failures + 1))
    fi
}

expect_accepted 'a boolean true verdict' "$(with_field verdict true)"
expect_accepted 'a boolean false verdict' "$(with_field verdict false)"

expect_rejected 'a string "true" verdict' "$(with_field verdict '"true"')"
expect_rejected 'a string "false" verdict' "$(with_field verdict '"false"')"
expect_rejected 'a null verdict' "$(with_field verdict null)"
expect_rejected 'a numeric verdict' "$(with_field verdict 1)"
expect_rejected 'an object verdict' "$(with_field verdict '{}')"
expect_rejected 'a missing verdict' "$(jq -c 'del(.verdict)' <<<"$base_verdict")"

expect_rejected 'a string safe flag' "$(with_field safe '"true"')"
expect_rejected 'a non-string fromVersion' "$(with_field fromVersion 123)"
expect_rejected 'a non-array requiredStops' "$(with_field requiredStops '"1.2.4"')"
expect_rejected 'an unexpected extra key' "$(jq -c '.unexpected = true' <<<"$base_verdict")"
expect_rejected 'malformed json' 'not json at all'

if [[ $failures -ne 0 ]]; then
    printf '%s verdict validation assertion(s) failed\n' "$failures" >&2
    exit 1
fi

printf 'verdict validation tests passed\n'
