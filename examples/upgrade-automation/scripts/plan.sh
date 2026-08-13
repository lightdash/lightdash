#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

write_output() {
    local name=$1
    local value=$2
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        printf '%s=%s\n' "$name" "$value" >>"$GITHUB_OUTPUT"
    fi
}

base64_file() {
    local file=$1
    if base64 --help 2>&1 | grep -q -- '-w'; then
        base64 -w0 "$file"
    else
        openssl base64 -A -in "$file"
    fi
}

create_commit() {
    local expected_head_oid=$1
    local file_path=$2
    local file_contents=$3
    local commit_message=$4
    local query
    query='mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
            commit {
                oid
                url
            }
        }
    }'

    jq -n \
        --arg query "$query" \
        --arg repository "$GITHUB_REPOSITORY" \
        --arg branch "$upgrade_branch" \
        --arg expected_head_oid "$expected_head_oid" \
        --arg message "$commit_message" \
        --arg path "$file_path" \
        --arg contents "$file_contents" \
        '{
            query: $query,
            variables: {
                input: {
                    branch: {
                        repositoryNameWithOwner: $repository,
                        branchName: $branch
                    },
                    expectedHeadOid: $expected_head_oid,
                    message: {headline: $message},
                    fileChanges: {
                        additions: [{path: $path, contents: $contents}]
                    }
                }
            }
        }' | gh api graphql --input -
}

write_output branch ''
write_output pr_number ''
write_output pr_url ''

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
bump_file_before=$(mktemp)
trap 'rm -f "$index_file" "$gate_error" "$body_file" "$summary_file" "$bump_file_before"' EXIT

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
cp "$ACTION_ROOT/cli/package.json" "$ACTION_ROOT/cli/package-lock.json" "$cli_root"
npm ci --prefix "$cli_root" --ignore-scripts --silent
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
    if ! jq -e '.verdict == false' <<<"$GATE_JSON" >/dev/null; then
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
bump_file=${BUMP_TARGET%%#*}

cp "$bump_file" "$bump_file_before"
write_bump_value "$mapped_version"
if cmp -s "$bump_file_before" "$bump_file"; then
    exit 0
fi

base_sha=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$default_branch" --jq '.object.sha')
if gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$upgrade_branch" >/dev/null 2>&1; then
    gh api --method PATCH "repos/$GITHUB_REPOSITORY/git/refs/heads/$upgrade_branch" \
        -f sha="$base_sha" \
        -F force=true >/dev/null
else
    gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" \
        -f ref="refs/heads/$upgrade_branch" \
        -f sha="$base_sha" >/dev/null
fi

file_contents=$(base64_file "$bump_file")
commit_message="chore: upgrade Lightdash to $mapped_version"
if ! commit_response=$(create_commit "$base_sha" "$bump_file" "$file_contents" "$commit_message"); then
    branch_head=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$upgrade_branch" --jq '.object.sha')
    if [[ "$branch_head" == "$base_sha" ]]; then
        exit 1
    fi
    commit_response=$(create_commit "$branch_head" "$bump_file" "$file_contents" "$commit_message")
fi
jq -e '.data.createCommitOnBranch.commit.oid | type == "string" and length > 0' <<<"$commit_response" >/dev/null

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

This pull request was created by the self-hosted Lightdash upgrade automation. Verification runs after the configured deployment workflow completes.
EOF

pr_json=$(gh pr list --repo "$GITHUB_REPOSITORY" --head "$upgrade_branch" --state open --json number,url --jq '.[0] // empty')
if [[ -z "$pr_json" ]]; then
    pr_url=$(gh pr create \
        --repo "$GITHUB_REPOSITORY" \
        --base "$default_branch" \
        --head "$upgrade_branch" \
        --title "chore: upgrade Lightdash to $mapped_version" \
        --body-file "$body_file")
    pr_json=$(gh pr view "$pr_url" --repo "$GITHUB_REPOSITORY" --json number,url)
else
    pr_url=$(jq -r '.url' <<<"$pr_json")
    gh pr edit "$pr_url" \
        --title "chore: upgrade Lightdash to $mapped_version" \
        --body-file "$body_file"
fi
pr_number=$(jq -r '.number' <<<"$pr_json")
pr_url=$(jq -r '.url' <<<"$pr_json")
write_output branch "$upgrade_branch"
write_output pr_number "$pr_number"
write_output pr_url "$pr_url"

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
