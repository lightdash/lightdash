#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_value action "${ACTION:-}"
require_value actor_login "${ACTOR_LOGIN:-}"
require_value freeze_label "${FREEZE_LABEL:-}"
require_value github_token "${GH_TOKEN:-}"

reason=${REASON:-}

create_freeze_label() {
    gh label create "$FREEZE_LABEL" --repo "$GITHUB_REPOSITORY" --color B60205 \
        --description 'Disarms automated Lightdash upgrades' --force
}

open_freeze_issues() {
    gh api --method GET --paginate "repos/$GITHUB_REPOSITORY/issues" \
        -f state=open -f labels="$FREEZE_LABEL" -f per_page=100 \
        --jq '.[] | select(.pull_request == null) | "\(.number)\t\(.html_url)"'
}

write_freeze_body() {
    local body_file=$1
    {
        printf 'Automated Lightdash upgrades are paused.\n\n'
        printf 'Actor: %s\n' "$ACTOR_LOGIN"
        printf 'Reason: %s\n\n' "$reason"
        printf 'Close this issue or run the unfreeze dispatch to resume automated Lightdash upgrades.\n'
    } >"$body_file"
}

write_unfreeze_comment() {
    local body_file=$1
    {
        printf 'Automated Lightdash upgrades are being resumed.\n\n'
        printf 'Actor: %s\n' "$ACTOR_LOGIN"
        printf 'Reason: %s\n' "$reason"
    } >"$body_file"
}

case "$ACTION" in
    freeze)
        create_freeze_label
        issues=$(open_freeze_issues)
        existing_issue=${issues%%$'\n'*}
        if [[ -n "$existing_issue" ]]; then
            issue_url=${existing_issue#*$'\t'}
            printf 'NO-OP: automated Lightdash upgrades are already frozen: %s\n' "$issue_url"
            exit 0
        fi

        body_file=$(mktemp)
        trap 'rm -f "$body_file"' EXIT
        write_freeze_body "$body_file"
        gh issue create --repo "$GITHUB_REPOSITORY" --title 'Manual upgrade freeze' \
            --label "$FREEZE_LABEL" --body-file "$body_file"
        ;;
    unfreeze)
        issues=$(open_freeze_issues)
        if [[ -z "$issues" ]]; then
            printf 'NO-OP: automated Lightdash upgrades are already unfrozen.\n'
            exit 0
        fi

        comment_file=$(mktemp)
        trap 'rm -f "$comment_file"' EXIT
        write_unfreeze_comment "$comment_file"
        while IFS=$'\t' read -r issue_number issue_url; do
            gh issue comment "$issue_number" --repo "$GITHUB_REPOSITORY" --body-file "$comment_file"
            gh issue close "$issue_number" --repo "$GITHUB_REPOSITORY"
            printf 'Unfroze upgrades by closing: %s\n' "$issue_url"
        done <<<"$issues"
        ;;
    *)
        printf 'unknown action: %s; expected freeze or unfreeze\n' "$ACTION" >&2
        exit 1
        ;;
esac
