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

branch_prefix=${BRANCH_PREFIX:-lightdash-upgrade}
if [[ ! "$branch_prefix" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    echo "branch_prefix must match ^[A-Za-z0-9][A-Za-z0-9._-]*$" >&2
    exit 1
fi

pinned_mapped=$(read_bump_value)
pinned_public=$(public_version "$pinned_mapped" "${TAG_SUFFIX:-}")
UPGRADE_BRANCH="${branch_prefix}-$(safe_branch_version "$pinned_mapped")"
export UPGRADE_BRANCH
if ! default_branch=$(gh api "repos/$GITHUB_REPOSITORY" --jq '.default_branch'); then
    echo "Unable to determine the default branch for upgrade verification." >&2
    exit 1
fi
if ! VERIFY_COMMENT_AUTHOR=$(gh api user --jq '.login' 2>/dev/null); then
    VERIFY_COMMENT_AUTHOR='github-actions[bot]'
fi
export VERIFY_COMMENT_AUTHOR
if ! merged_upgrade_prs=$(gh api \
    --paginate \
    "repos/$GITHUB_REPOSITORY/pulls?state=closed&base=$default_branch&per_page=100" \
    --jq '.[] | select(.merged_at != null and (.head.ref // "") == $ENV.UPGRADE_BRANCH) | [.number, (.merge_commit_sha // "")] | @tsv'); then
    echo "Unable to list merged upgrade pull requests; refusing to skip verification." >&2
    exit 1
fi

pr_number=
pr_url=
verdict_json=
if [[ -n "$merged_upgrade_prs" ]]; then
    while IFS=$'\t' read -r candidate_number candidate_merge_sha; do
        if [[ -z "$candidate_merge_sha" ]]; then
            continue
        fi
        ancestry_rc=0
        git merge-base --is-ancestor "$candidate_merge_sha" "$DEPLOYED_SHA" 2>/dev/null || ancestry_rc=$?
        if [[ "$ancestry_rc" -eq 1 ]]; then
            continue
        fi
        if [[ "$ancestry_rc" -gt 1 ]]; then
            echo "Unable to check ancestry for $candidate_merge_sha; the checkout may be too shallow. Use fetch-depth: 0 for verification." >&2
            exit 1
        fi
        if ! candidate_body=$(gh pr view "$candidate_number" --repo "$GITHUB_REPOSITORY" --json body --jq '.body'); then
            echo "Unable to read merged upgrade pull request #$candidate_number." >&2
            exit 1
        fi
        candidate_verdict=$(awk '/^```json$/ { capture=1; next } /^```$/ && capture { exit } capture' <<<"$candidate_body")
        if ! printf '%s' "$candidate_verdict" | validate_verdict_json; then
            continue
        fi
        if [[ "$(jq -r '.toVersion' <<<"$candidate_verdict")" != "$pinned_public" ]]; then
            continue
        fi
        if ! existing_successful_verification=$(gh pr view "$candidate_number" --repo "$GITHUB_REPOSITORY" --json comments --jq '[.comments[] | select(.author.login == $ENV.VERIFY_COMMENT_AUTHOR) | .body | select(startswith("## Upgrade verification summary") and contains("Outcome: **success**") and contains($ENV.DEPLOY_RUN_URL))] | any'); then
            echo "Unable to inspect verification comments on merged upgrade pull request #$candidate_number." >&2
            exit 1
        fi
        if [[ "$existing_successful_verification" == "true" && "$DEPLOY_CONCLUSION" == "success" ]]; then
            exit 0
        fi
        pr_number=$candidate_number
        if ! pr_url=$(gh pr view "$pr_number" --repo "$GITHUB_REPOSITORY" --json url --jq '.url'); then
            echo "Unable to read the URL for merged upgrade pull request #$pr_number." >&2
            exit 1
        fi
        verdict_json=$candidate_verdict
        break
    done <<<"$merged_upgrade_prs"
fi

if [[ -z "$pr_number" ]]; then
    echo "No merged upgrade pull request matches this deployment; skipping verification."
    exit 0
fi

from_version=$(jq -r '.fromVersion' <<<"$verdict_json")
if ! [[ "$from_version" =~ ^[A-Za-z0-9][A-Za-z0-9._+-]*$ ]]; then
    echo "The merged upgrade pull request carries an invalid fromVersion." >&2
    exit 1
fi
window_seconds=$(parse_duration "$VERIFY_WINDOW")
started_at=$(date +%s)
deadline=$((started_at + window_seconds))
consecutive=0
last_reason=not_started
verified=false
superseded=false
response_body=$(mktemp)
response_headers=$(mktemp)
summary_file=$(mktemp)
issue_body=$(mktemp)
trap 'rm -f "$response_body" "$response_headers" "$summary_file" "$issue_body"' EXIT

if [[ "$DEPLOY_CONCLUSION" == "success" ]]; then
    while [[ $(date +%s) -lt $deadline ]]; do
        remaining_seconds=$((deadline - $(date +%s)))
        curl_timeout=$((remaining_seconds < 20 ? remaining_seconds : 20))
        status=$(curl --connect-timeout 10 --max-time "$curl_timeout" --silent --show-error --output "$response_body" --write-out '%{http_code}' "${INSTANCE_URL%/}/api/v1/readyz" || true)
        readiness=$(jq -r '.status // empty' "$response_body" 2>/dev/null || true)
        if [[ "$status" == "200" && "$readiness" == "ready" ]]; then
            warnings=$(jq -r '.warnings // [] | .[]' "$response_body" 2>/dev/null || true)
            if [[ $'\n'"$warnings"$'\n' == *$'\nmigration_parked\n'* ]]; then
                consecutive=0
                last_reason=migration_parked
                break
            elif [[ $'\n'"$warnings"$'\n' == *$'\nmigration_ledger_unavailable\n'* ]]; then
                consecutive=0
                last_reason=migration_ledger_unavailable
            else
                remaining_seconds=$((deadline - $(date +%s)))
                if [[ $remaining_seconds -le 0 ]]; then
                    break
                fi
                curl_timeout=$((remaining_seconds < 20 ? remaining_seconds : 20))
                curl --connect-timeout 10 --max-time "$curl_timeout" --silent --show-error --location --head --output "$response_headers" "${INSTANCE_URL%/}/" || true
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
                    elif [[ "$running_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
                        && [[ "$pinned_public" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] \
                        && version_gt "$running_version" "$pinned_public"; then
                        last_reason="superseded:$(printf '%s' "$running_version" | sanitize_evidence)"
                        superseded=true
                        break
                    else
                        last_reason="version_mismatch:$(printf '%s' "$running_version" | sanitize_evidence)"
                    fi
                fi
            fi
        else
            consecutive=0
            probe_reason=$(jq -r '.reason // empty' "$response_body" 2>/dev/null || true)
            last_reason=$(printf '%s' "${probe_reason:-"readyz_http_$status"}" | sanitize_evidence)
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
elif [[ "$superseded" == "true" ]]; then
    outcome=superseded
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
if [[ "$superseded" == "true" ]]; then
    gh pr comment "$pr_number" --repo "$GITHUB_REPOSITORY" --body-file "$summary_file" \
        || echo "warning: failed to post the verification summary comment" >&2
    exit 0
fi
if [[ "$verified" == "true" ]]; then
    if ! marked_freeze_issues=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --limit 1000 --json number,body --jq '.[] | select(.body | contains("<!-- upgrade-automation:auto-freeze -->")) | .number'); then
        echo "warning: failed to inspect open upgrade freeze issues" >&2
        marked_freeze_issues=
    fi
    while IFS= read -r freeze_issue_number; do
        if [[ -z "$freeze_issue_number" ]]; then
            continue
        fi
        gh issue close "$freeze_issue_number" --repo "$GITHUB_REPOSITORY" --comment "Upgrade automation is re-armed after verifying \`$pinned_public\`: $DEPLOY_RUN_URL" \
            || echo "warning: failed to close upgrade freeze issue #$freeze_issue_number" >&2
    done <<<"$marked_freeze_issues"
    gh pr comment "$pr_number" --repo "$GITHUB_REPOSITORY" --body-file "$summary_file"
    exit 0
fi

gh label create "$FREEZE_LABEL" --repo "$GITHUB_REPOSITORY" --force --color B60205 --description 'Disarms automated Lightdash upgrades'
issue_title="Lightdash $pinned_public upgrade verification failed"
cat >"$issue_body" <<EOF
<!-- upgrade-automation:auto-freeze -->

The automated verification for \`$from_version\` → \`$pinned_public\` failed and future upgrades are frozen.

- Pull request: $pr_url
- Deployment run: $DEPLOY_RUN_URL
- Last readiness reason: \`$last_reason\`
- Verification budget: \`$VERIFY_WINDOW\`

Close this issue only after the deployment is healthy and the running version matches the pin.
EOF

if ! existing_issue=$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --search "\"$issue_title\" in:title" --json url --jq '.[0].url // empty'); then
    echo "Unable to inspect existing upgrade freeze issues." >&2
    exit 1
fi
if [[ -z "$existing_issue" ]]; then
    existing_issue=$(gh issue create --repo "$GITHUB_REPOSITORY" --title "$issue_title" --label "$FREEZE_LABEL" --body-file "$issue_body")
fi

gh pr comment "$pr_number" --repo "$GITHUB_REPOSITORY" --body-file "$summary_file" \
    || echo "warning: failed to post the verification summary comment" >&2
post_slack "[upgrade-verify-failed] $from_version -> $pinned_public | reason: $last_reason | deploy: $DEPLOY_RUN_URL | freeze: $existing_issue" \
    || echo "warning: failed to post the Slack escalation" >&2
exit 1
