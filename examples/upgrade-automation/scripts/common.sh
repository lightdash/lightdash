#!/usr/bin/env bash

set -euo pipefail

ACTION_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RELEASE_INDEX_URL=https://raw.githubusercontent.com/lightdash/lightdash/main/release-safety-index.json
RELEASE_DETAIL_URL_TEMPLATE=${RELEASE_DETAIL_URL_TEMPLATE:-"https://raw.githubusercontent.com/lightdash/lightdash/{version}/release-safety.json"}

require_value() {
    local name=$1
    local value=$2
    if [[ -z "$value" ]]; then
        echo "$name is required" >&2
        exit 1
    fi
}

public_version() {
    local mapped_version=$1
    local suffix=$2
    if [[ -n "$suffix" && "$mapped_version" == *"$suffix" ]]; then
        mapped_version=${mapped_version%"$suffix"}
    fi
    if [[ ! "$mapped_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "invalid public version: $mapped_version" >&2
        return 1
    fi
    printf '%s\n' "$mapped_version"
}

safe_branch_version() {
    tr -c 'A-Za-z0-9._-' '-' <<<"$1" | sed 's/-$//'
}

version_gte() {
    python3 - "$1" "$2" <<'PY'
import sys
left = tuple(map(int, sys.argv[1].split('.')))
right = tuple(map(int, sys.argv[2].split('.')))
raise SystemExit(0 if left >= right else 1)
PY
}

version_gt() {
    python3 - "$1" "$2" <<'PY'
import sys
left = tuple(map(int, sys.argv[1].split('.')))
right = tuple(map(int, sys.argv[2].split('.')))
raise SystemExit(0 if left > right else 1)
PY
}

sha256_text() {
    python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())'
}

sanitize_evidence() {
    python3 -c 'import re,sys; value=sys.stdin.read()[:200]; value=re.sub(r"[\x00-\x1f\x7f]", " ", value); print(value.replace("@", "＠").replace("<", "‹").replace(">", "›").strip())'
}

read_bump_value() {
    python3 "$ACTION_ROOT/scripts/bump-target.py" read "$BUMP_TARGET"
}

write_bump_value() {
    python3 "$ACTION_ROOT/scripts/bump-target.py" write "$BUMP_TARGET" "$1"
}

post_slack() {
    local message=$1
    if [[ -z "${ESCALATION:-}" ]]; then
        return
    fi
    curl --connect-timeout 10 --max-time 30 --fail --silent --show-error \
        --request POST \
        --header 'Content-Type: application/json' \
        --data "$(jq -n --arg text "$message" '{text: $text}')" \
        "$ESCALATION" >/dev/null
}

parse_duration() {
    local duration=$1
    if [[ "$duration" =~ ^([0-9]+)([smh]?)$ ]]; then
        local amount=$((10#${BASH_REMATCH[1]}))
        case "${BASH_REMATCH[2]}" in
            '') printf '%s\n' "$amount" ;;
            s) printf '%s\n' "$amount" ;;
            m) printf '%s\n' "$((amount * 60))" ;;
            h) printf '%s\n' "$((amount * 3600))" ;;
        esac
        return
    fi
    echo "invalid duration: $duration" >&2
    return 1
}

validate_verdict_json() {
    jq -e '
        keys == [
            "coveredVersions",
            "direction",
            "fromVersion",
            "minPreviousVersion",
            "missingRanges",
            "requiredStops",
            "safe",
            "toVersion",
            "verdict"
        ] and
        (.fromVersion | type == "string") and
        (.toVersion | type == "string") and
        (.safe | type == "boolean") and
        (.verdict | type == "boolean" or . == "unknown") and
        (.requiredStops | type == "array") and
        all(.requiredStops[]; type == "string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) and
        (.coveredVersions | type == "array") and
        (.missingRanges | type == "array")
    ' >/dev/null
}
