#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_value instance_url "${INSTANCE_URL:-}"
require_value bump_target "${BUMP_TARGET:-}"
require_value verify_window "${VERIFY_WINDOW:-}"
require_value freeze_label "${FREEZE_LABEL:-}"
require_value deploy_run_url "${DEPLOY_RUN_URL:-}"
require_value deploy_conclusion "${DEPLOY_CONCLUSION:-}"
require_value deployed_sha "${DEPLOYED_SHA:-}"
require_value github_token "${GH_TOKEN:-}"

target_file=${BUMP_TARGET%%#*}
changed=$(gh api "repos/$GITHUB_REPOSITORY/commits/$DEPLOYED_SHA" | jq --arg file "$target_file" '[.files[]?.filename | select(. == $file)] | length')
if [[ "$changed" == "0" ]]; then
    exit 0
fi

pr_json=$(gh api "repos/$GITHUB_REPOSITORY/commits/$DEPLOYED_SHA/pulls" | jq '[.[] | select(.merged_at != null and (.head.ref | startswith("lightdash-upgrade-")))] | first // empty')
if [[ -z "$pr_json" ]]; then
    exit 0
fi

pr_number=$(jq -r '.number' <<<"$pr_json")
pr_url=$(jq -r '.html_url' <<<"$pr_json")
pr_body=$(gh pr view "$pr_number" --repo "$GITHUB_REPOSITORY" --json body --jq '.body')
verdict_json=$(awk '/^```json$/ { capture=1; next } /^```$/ && capture { exit } capture' <<<"$pr_body")
if ! printf '%s' "$verdict_json" | validate_verdict_json; then
    exit 0
fi

from_version=$(jq -r '.fromVersion' <<<"$verdict_json")
pinned_mapped=$(read_bump_value)
pinned_public=$(public_version "$pinned_mapped" "${TAG_SUFFIX:-}")
window_seconds=$(parse_duration "$VERIFY_WINDOW")
started_at=$(date +%s)
deadline=$((started_at + window_seconds))
consecutive=0
last_reason=not_started
verified=false
response_body=$(mktemp)
response_headers=$(mktemp)
summary_file=$(mktemp)
issue_body=$(mktemp)
trap 'rm -f "$response_body" "$response_headers" "$summary_file" "$issue_body"' EXIT

if [[ "$DEPLOY_CONCLUSION" == "success" ]]; then
    while [[ $(date +%s) -lt $deadline ]]; do
        status=$(curl --silent --show-error --output "$response_body" --write-out '%{http_code}' "${INSTANCE_URL%/}/api/v1/readyz" || true)
        readiness=$(jq -r '.status // empty' "$response_body" 2>/dev/null || true)
        if [[ "$status" == "200" && "$readiness" == "ready" ]]; then
            curl --silent --show-error --location --head --output "$response_headers" "${INSTANCE_URL%/}/" || true
            running_version=$(awk -F': *' 'tolower($1) == "lightdash-version" { gsub("\r", "", $2); print $2; exit }' "$response_headers")
            if [[ "$running_version" == "$pinned_public" ]]; then
                consecutive=$((consecutive + 1))
                last_reason=ready
                if [[ $consecutive -ge 3 ]]; then
                    verified=true
                    break
                fi
            else
                consecutive=0
                if [[ -z "$running_version" ]]; then
                    last_reason=version_header_missing
                else
                    last_reason="version_mismatch:$running_version"
                fi
            fi
        else
            consecutive=0
            probe_reason=$(jq -r '.reason // empty' "$response_body" 2>/dev/null || true)
            last_reason=${probe_reason:-"readyz_http_$status"}
        fi
        sleep 20
    done
else
    last_reason="deploy_workflow_$DEPLOY_CONCLUSION"
fi

finished_at=$(date +%s)
elapsed=$((finished_at - started_at))
outcome=failure
if [[ "$verified" == "true" ]]; then
    outcome=success
fi

cat >"$summary_file" <<EOF
## Upgrade verification summary

- Outcome: **$outcome**
- Version: \`$from_version\` → \`$pinned_public\`
- Consecutive ready and version-matched polls: $consecutive
- Elapsed: ${elapsed}s
- Last readiness reason: \`$last_reason\`
- Deployment run: $DEPLOY_RUN_URL

\`\`\`json
$(jq . <<<"$verdict_json")
\`\`\`
EOF
gh pr comment "$pr_number" --repo "$GITHUB_REPOSITORY" --body-file "$summary_file"

if [[ "$verified" == "true" ]]; then
    exit 0
fi

gh label create "$FREEZE_LABEL" --repo "$GITHUB_REPOSITORY" --force --color B60205 --description 'Disarms automated Lightdash upgrades'
issue_title="Lightdash $pinned_public upgrade verification failed"
cat >"$issue_body" <<EOF
The automated verification for \`$from_version\` → \`$pinned_public\` failed and future upgrades are frozen.

- Pull request: $pr_url
- Deployment run: $DEPLOY_RUN_URL
- Last readiness reason: \`$last_reason\`
- Verification budget: \`$VERIFY_WINDOW\`

Close this issue only after the deployment is healthy and the running version matches the pin.
EOF

existing_issue=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --search "\"$issue_title\" in:title" --json url --jq '.[0].url // empty')
if [[ -z "$existing_issue" ]]; then
    existing_issue=$(gh issue create --repo "$GITHUB_REPOSITORY" --title "$issue_title" --label "$FREEZE_LABEL" --body-file "$issue_body")
fi

post_slack "[upgrade-verify-failed] $from_version -> $pinned_public | reason: $last_reason | deploy: $DEPLOY_RUN_URL | freeze: $existing_issue"
exit 1
