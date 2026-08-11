#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_value bump_target "${BUMP_TARGET:-}"
require_value freeze_label "${FREEZE_LABEL:-}"
require_value github_token "${GH_TOKEN:-}"

if [[ "$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --limit 1 --json number --jq 'length')" != "0" ]]; then
    exit 0
fi

current_mapped=$(read_bump_value)
current_public=$(public_version "$current_mapped" "${TAG_SUFFIX:-}")
index_file=$(mktemp)
gate_error=$(mktemp)
body_file=$(mktemp)
summary_file=$(mktemp)
trap 'rm -f "$index_file" "$gate_error" "$body_file" "$summary_file"' EXIT

curl --connect-timeout 10 --max-time 60 --fail --silent --show-error "$RELEASE_INDEX_URL" --output "$index_file"
jq -e '.schemaVersion == "1" and (.entries | type == "array")' "$index_file" >/dev/null

mapfile -t candidates < <(
    jq --arg current "$current_public" -r '
        ($current | split(".") | map(tonumber)) as $currentParts |
        [
            .entries[].version |
            select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$")) |
            select((split(".") | map(tonumber)) > $currentParts)
        ] |
        unique |
        sort_by(split(".") | map(tonumber)) |
        reverse[]
    ' "$index_file"
)

if [[ ${#candidates[@]} -eq 0 ]]; then
    exit 0
fi

cli_root=${RUNNER_TEMP:-$(mktemp -d)}/lightdash-upgrade-cli
mkdir -p "$cli_root"
cli_tarball=$(npm pack --ignore-scripts --pack-destination "$cli_root" --silent "@lightdash/cli@$CLI_VERSION")
cli_integrity=$(python3 - "$cli_root/$cli_tarball" <<'PY'
import base64
import hashlib
import sys

print(base64.b64encode(hashlib.sha512(open(sys.argv[1], 'rb').read()).digest()).decode())
PY
)
if [[ "sha512-$cli_integrity" != "$CLI_INTEGRITY" ]]; then
    echo 'downloaded Lightdash CLI did not match the expected integrity' >&2
    exit 1
fi
npm install --prefix "$cli_root" --no-package-lock --no-save --silent "$cli_root/$cli_tarball"
cli_bin="$cli_root/node_modules/.bin/lightdash"

GATE_JSON=
GATE_STATUS=0
run_gate() {
    local target=$1
    set +e
    GATE_JSON=$("$cli_bin" upgrade-check \
        --from "$current_public" \
        --to "$target" \
        --json 2>"$gate_error")
    GATE_STATUS=$?
    set -e
    if ! printf '%s' "$GATE_JSON" | validate_verdict_json; then
        return 2
    fi
    return 0
}

selected_version=
selected_json=
selected_green=false
newest=${candidates[0]}

if ! run_gate "$newest"; then
    exit 0
fi
if [[ "$GATE_STATUS" == "0" ]] && [[ "$(jq -r '.safe' <<<"$GATE_JSON")" == "true" ]]; then
    selected_version=$newest
    selected_json=$GATE_JSON
    selected_green=true
else
    required_stop=$(jq -r '.requiredStops | map(split(".") | map(tonumber)) | sort | first // empty | map(tostring) | join(".")' <<<"$GATE_JSON")
    if [[ -n "$required_stop" ]] && version_gt "$required_stop" "$current_public"; then
        if run_gate "$required_stop"; then
            required_stop_only=$(jq -r --arg stop "$required_stop" '
                .verdict == true and
                (.missingRanges | length == 0) and
                (.requiredStops | length == 1 and .[0] == $stop)
            ' <<<"$GATE_JSON")
            minimum=$(jq -r '.minPreviousVersion // empty' <<<"$GATE_JSON")
            minimum_met=true
            if [[ -n "$minimum" ]] && ! version_gte "$current_public" "$minimum"; then
                minimum_met=false
            fi
            if { [[ "$GATE_STATUS" == "0" ]] && [[ "$(jq -r '.safe' <<<"$GATE_JSON")" == "true" ]]; } || { [[ "$required_stop_only" == "true" ]] && [[ "$minimum_met" == "true" ]]; }; then
                selected_version=$required_stop
                selected_json=$GATE_JSON
                selected_green=true
            fi
        fi
    fi
fi

if [[ -z "$selected_version" ]]; then
    for candidate in "${candidates[@]}"; do
        if ! run_gate "$candidate"; then
            continue
        fi
        if [[ "$GATE_STATUS" == "0" ]] && [[ "$(jq -r '.safe' <<<"$GATE_JSON")" == "true" ]]; then
            selected_version=$candidate
            selected_json=$GATE_JSON
            selected_green=true
            break
        fi
    done
fi

if [[ -z "$selected_version" ]]; then
    next_index=$((${#candidates[@]} - 1))
    next_version=${candidates[$next_index]}
    if ! run_gate "$next_version"; then
        exit 0
    fi
    if [[ "$(jq -r '.verdict' <<<"$GATE_JSON")" != "false" ]]; then
        exit 0
    fi
    selected_version=$next_version
    selected_json=$GATE_JSON
fi

mapped_version="${selected_version}${TAG_SUFFIX:-}"
if [[ ! "$mapped_version" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
    echo "mapped image tag is not a valid OCI tag" >&2
    exit 1
fi
if [[ -n "${REGISTRY_CHECK:-}" ]]; then
    if ! docker manifest inspect "${REGISTRY_CHECK}:${mapped_version}" >/dev/null 2>&1; then
        exit 0
    fi
fi

default_branch=$(gh api "repos/$GITHUB_REPOSITORY" --jq '.default_branch')
safe_branch_version=$(tr -c 'A-Za-z0-9._-' '-' <<<"$mapped_version" | sed 's/-$//')
upgrade_branch="lightdash-upgrade-${safe_branch_version}"

git fetch origin "$default_branch"
if git ls-remote --exit-code --heads origin "$upgrade_branch" >/dev/null 2>&1; then
    git fetch origin "$upgrade_branch"
fi
git checkout -B "$upgrade_branch" "origin/$default_branch"

write_bump_value "$mapped_version"
git add -- "${BUMP_TARGET%%#*}"
if git diff --cached --quiet; then
    exit 0
fi
git config user.name github-actions[bot]
git config user.email 41898282+github-actions[bot]@users.noreply.github.com
git commit -m "chore: upgrade Lightdash to $mapped_version"
git push --set-upstream --force-with-lease origin "$upgrade_branch"

plain_reason='The release-safety gate found a green upgrade path.'
if [[ "$selected_green" != "true" ]]; then
    plain_reason='The next release hop is red. This pull request is held for manual review and must not merge automatically.'
elif [[ "$(jq -r '.safe' <<<"$selected_json")" != "true" ]]; then
    plain_reason='This target is the required stop identified by the gate. Landing on the stop satisfies the staged upgrade path before a later release can be selected.'
fi

verdict=$(jq -r '.verdict' <<<"$selected_json")
required_stops=$(jq -r '.requiredStops | if length == 0 then "none" else join(", ") end' <<<"$selected_json")
minimum_previous=$(jq -r '.minPreviousVersion // "none"' <<<"$selected_json")
missing_coverage=$(jq -r '.missingRanges | if length == 0 then "none" else map("after \(.afterVersion), before \(.beforeVersion)") | join("; ") end' <<<"$selected_json")
formatted_json=$(jq . <<<"$selected_json")
verdict_sha=$(printf '%s' "$formatted_json" | sha256_text)

cat >"$body_file" <<EOF
## Lightdash upgrade

Updates the pinned image from \`$current_mapped\` to \`$mapped_version\`.

$plain_reason

- Verdict: \`$verdict\`
- Required stops: $required_stops
- Minimum previous version: \`$minimum_previous\`
- Missing index coverage: $missing_coverage

### Safety verdict

\`\`\`json
$formatted_json
\`\`\`

<!-- lightdash-upgrade-verdict-sha256: $verdict_sha -->

This pull request was created by the self-hosted Lightdash upgrade automation. Verification runs after the configured deployment workflow completes.
EOF

pr_url=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$upgrade_branch" --state open --json url --jq '.[0].url // empty')
if [[ -z "$pr_url" ]]; then
    pr_url=$(gh pr create \
        --repo "$GITHUB_REPOSITORY" \
        --base "$default_branch" \
        --head "$upgrade_branch" \
        --title "chore: upgrade Lightdash to $mapped_version" \
        --body-file "$body_file")
else
    gh pr edit "$pr_url" \
        --title "chore: upgrade Lightdash to $mapped_version" \
        --body-file "$body_file"
fi

cat >"$summary_file" <<EOF
## Upgrade plan summary

- Version: \`$current_mapped\` → \`$mapped_version\`
- Gate: $([[ "$selected_green" == "true" ]] && printf 'green' || printf 'red')
- Registry check: $([[ -n "${REGISTRY_CHECK:-}" ]] && printf 'passed' || printf 'disabled')

\`\`\`json
$(jq . <<<"$selected_json")
\`\`\`
EOF
gh pr comment "$pr_url" --body-file "$summary_file"

if [[ "$selected_green" == "true" && "${AUTO_MERGE:-false}" == "true" ]]; then
    gh pr merge "$pr_url" --auto --squash
elif [[ "$selected_green" != "true" ]]; then
    stops=$(jq -r '.requiredStops | if length == 0 then "none" else join(", ") end' <<<"$selected_json")
    post_slack "[upgrade-hold] $pr_url | $current_public -> $selected_version | required stops: $stops | $plain_reason"
fi
