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

branch_prefix=${BRANCH_PREFIX:-lightdash-upgrade}
if [[ ! "$branch_prefix" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "branch_prefix must match ^[A-Za-z0-9][A-Za-z0-9._-]*$" >&2
    exit 1
fi
safety_gate=${SAFETY_GATE:-true}
if [[ "$safety_gate" != "true" && "$safety_gate" != "false" ]]; then
    echo "safety_gate must be true or false" >&2
    exit 1
fi

if [[ "$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --limit 1 --json number --jq 'length')" != "0" ]]; then
    echo "an open $FREEZE_LABEL issue is disarming the planner; nothing to do"
    exit 0
fi

current_mapped=$(read_bump_value)
current_public=$(public_version "$current_mapped" "${TAG_SUFFIX:-}")
index_file=$(mktemp)
gate_error=$(mktemp)
merge_error=$(mktemp)
body_file=$(mktemp)
summary_file=$(mktemp)
fresh_file=$(mktemp ./plan-fresh.XXXXXX)
trap 'rm -f "$index_file" "$gate_error" "$merge_error" "$body_file" "$summary_file" "$fresh_file"' EXIT

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
    echo "no release newer than $current_public in the index; already up to date"
    exit 0
fi

select_target_with_gate() {
    local cli_root
    local cli_bin
    local GATE_JSON=
    local GATE_STATUS=0
    local required_stop
    local required_stop_only
    local minimum
    local minimum_met
    local candidate
    local next_index
    local next_version

    cli_root=${RUNNER_TEMP:-$(mktemp -d)}/lightdash-upgrade-cli
    mkdir -p "$cli_root"
    cp "$ACTION_ROOT/cli/package.json" "$ACTION_ROOT/cli/package-lock.json" "$cli_root"
    npm ci --prefix "$cli_root" --ignore-scripts --silent
    cli_bin="$cli_root/node_modules/.bin/lightdash"

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

    gate_unusable() {
        local target=$1
        echo "the release-safety gate returned unusable output for $target" >&2
        cat "$gate_error" >&2 || true
    }

    if ! run_gate "$newest"; then
        gate_unusable "$newest"
        exit 1
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
            gate_unusable "$next_version"
            exit 1
        fi
        selected_version=$next_version
        selected_json=$GATE_JSON
        if jq -e '.verdict == false' <<<"$GATE_JSON" >/dev/null; then
            hold_reason=red
        else
            hold_reason=unknown
        fi
    fi
}

selected_version=
selected_json=
selected_green=false
hold_reason=
newest=${candidates[0]}

if [[ "$safety_gate" == "false" ]]; then
    selected_version=$newest
    selected_json=$(jq -n \
        --arg from_version "$current_public" \
        --arg to_version "$selected_version" \
        '{
            coveredVersions: [],
            direction: "forward",
            fromVersion: $from_version,
            minPreviousVersion: null,
            missingRanges: [],
            requiredStops: [],
            safe: true,
            toVersion: $to_version,
            verdict: true
        }')
    selected_green=true
else
    select_target_with_gate
fi

mapped_version="${selected_version}${TAG_SUFFIX:-}"
if [[ ! "$mapped_version" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]]; then
    echo "mapped image tag is not a valid OCI tag" >&2
    exit 1
fi
if [[ -n "${REGISTRY_CHECK:-}" ]]; then
    if ! docker manifest inspect "${REGISTRY_CHECK}:${mapped_version}" >/dev/null 2>&1; then
        echo "image ${REGISTRY_CHECK}:${mapped_version} is not published yet; retrying on a later run"
        exit 0
    fi
fi

default_branch=$(gh api "repos/$GITHUB_REPOSITORY" --jq '.default_branch')
upgrade_branch="${branch_prefix}-$(safe_branch_version "$mapped_version")"
bump_file=${BUMP_TARGET%%#*}
bump_path=${BUMP_TARGET#*#}
bump_filename=${bump_file##*/}
bump_extension=${bump_filename##*.}
if [[ "${bump_filename#.}" == *.* && -n "$bump_extension" ]]; then
    mv "$fresh_file" "$fresh_file.$bump_extension"
    fresh_file="$fresh_file.$bump_extension"
fi
commit_message="chore: upgrade Lightdash to $mapped_version"
commit_response=
committed=false

for attempt in 1 2 3; do
    base_sha=$(gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$default_branch" --jq '.object.sha')
    gh api "repos/$GITHUB_REPOSITORY/contents/$bump_file?ref=$base_sha" --jq '.content' \
        | tr -d '\n' \
        | base64 --decode >"$fresh_file"

    fresh_mapped=$(python3 "$ACTION_ROOT/scripts/bump-target.py" read "$fresh_file#$bump_path")
    if [[ "$fresh_mapped" == "$mapped_version" ]]; then
        echo "$bump_file already pins $mapped_version at $base_sha; nothing to commit"
        exit 0
    fi
    fresh_public=$(public_version "$fresh_mapped" "${TAG_SUFFIX:-}")
    if version_gt "$fresh_public" "$selected_version"; then
        echo "$bump_file already pins newer version $fresh_mapped at $base_sha; not lowering it to $mapped_version"
        exit 0
    fi
    if [[ "$fresh_mapped" != "$current_mapped" ]]; then
        echo "$bump_file moved from $current_mapped to $fresh_mapped at $base_sha; a replan is required"
        exit 0
    fi
    if [[ "$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --limit 1 --json number --jq 'length')" != "0" ]]; then
        echo "an open $FREEZE_LABEL issue is disarming the planner; nothing to do"
        exit 0
    fi

    if gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$upgrade_branch" >/dev/null 2>&1; then
        gh api --method PATCH "repos/$GITHUB_REPOSITORY/git/refs/heads/$upgrade_branch" \
            -f sha="$base_sha" \
            -F force=true >/dev/null
    else
        gh api --method POST "repos/$GITHUB_REPOSITORY/git/refs" \
            -f ref="refs/heads/$upgrade_branch" \
            -f sha="$base_sha" >/dev/null
    fi

    python3 "$ACTION_ROOT/scripts/bump-target.py" write "$fresh_file#$bump_path" "$mapped_version"
    file_contents=$(base64_file "$fresh_file")
    if commit_response=$(create_commit "$base_sha" "$bump_file" "$file_contents" "$commit_message"); then
        committed=true
        break
    fi
    echo "commit attempt $attempt lost the race; retrying from the latest $default_branch" >&2
done

if [[ "$committed" != "true" ]]; then
    echo "failed to commit $bump_file after 3 attempts" >&2
    exit 1
fi
jq -e '.data.createCommitOnBranch.commit.oid | type == "string" and length > 0' <<<"$commit_response" >/dev/null

plain_reason='The release-safety gate found a green upgrade path.'
if [[ "$safety_gate" == "false" ]]; then
    plain_reason='The release-safety gate was not run for this instance.'
elif [[ "$hold_reason" == "unknown" ]]; then
    plain_reason='The release-safety gate could not determine whether the next release hop is safe. This is not a known break: the safety data for that release is incomplete or inconclusive. This pull request is held for manual review and must not merge automatically.'
elif [[ "$selected_green" != "true" ]]; then
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
pr_created=false
if [[ -z "$pr_json" ]]; then
    pr_created=true
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

gate_summary=$hold_reason
if [[ "$safety_gate" == "false" ]]; then
    gate_summary='not run'
elif [[ "$selected_green" == "true" ]]; then
    gate_summary=green
fi

cat >"$summary_file" <<EOF
## Upgrade plan summary

- Version: \`$current_mapped\` → \`$mapped_version\`
- Gate: $gate_summary
- Registry check: $([[ -n "${REGISTRY_CHECK:-}" ]] && printf 'passed' || printf 'disabled')

\`\`\`json
$(jq . <<<"$selected_json")
\`\`\`
EOF
if [[ "$pr_created" == "true" ]]; then
    gh pr comment "$pr_url" --body-file "$summary_file"
fi

if [[ "$selected_green" == "true" && "${AUTO_MERGE:-false}" == "true" ]]; then
    if [[ "$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --limit 1 --json number --jq 'length')" != "0" ]]; then
        echo "an open $FREEZE_LABEL issue is disarming auto-merge; leaving $pr_url open"
    elif ! gh pr merge "$pr_url" --auto --squash 2>"$merge_error"; then
        merge_state=$(gh pr view "$pr_url" --json mergeStateStatus --jq '.mergeStateStatus' || true)
        if [[ "$merge_state" == "CLEAN" ]]; then
            gh pr merge "$pr_url" --squash
        else
            cat "$merge_error" >&2
            exit 1
        fi
    fi
elif [[ "$selected_green" != "true" && "$pr_created" == "true" ]]; then
    stops=$(jq -r '.requiredStops | if length == 0 then "none" else join(", ") end' <<<"$selected_json")
    post_slack "[upgrade-hold] $pr_url | $current_public -> $selected_version | gate: $hold_reason | required stops: $stops | $plain_reason"
elif [[ "$selected_green" != "true" ]]; then
    echo "hold for $mapped_version already reported on $pr_url; not repeating the escalation"
fi
