#!/usr/bin/env bash

set -euo pipefail

source "$(dirname "$0")/common.sh"

require_value event_action "${EVENT_ACTION:-}"
require_value issue_url "${ISSUE_URL:-}"
require_value issue_title "${ISSUE_TITLE:-}"
require_value issue_state "${ISSUE_STATE:-}"
require_value actor_login "${ACTOR_LOGIN:-}"
require_value label_name "${LABEL_NAME:-}"
require_value freeze_label "${FREEZE_LABEL:-}"
require_value github_token "${GH_TOKEN:-}"

if [[ "$LABEL_NAME" != "$FREEZE_LABEL" ]]; then
    exit 0
fi

open_freeze_issue_count() {
    gh issue list --repo "$GITHUB_REPOSITORY" --state open --label "$FREEZE_LABEL" --limit 2 --json number --jq 'length'
}

case "$EVENT_ACTION" in
    labeled|reopened)
        if [[ "$ISSUE_STATE" != "open" ]]; then
            exit 0
        fi
        if [[ "$(open_freeze_issue_count)" != "1" ]]; then
            exit 0
        fi
        if [[ "${ISSUE_BODY:-}" == *'<!-- upgrade-automation:auto-freeze -->'* ]]; then
            exit 0
        fi
        post_slack "[upgrade-freeze-on] $ISSUE_URL | actor: $ACTOR_LOGIN | Automated Lightdash upgrades are paused. Close the issue to resume."
        ;;
    closed|unlabeled)
        if [[ "$EVENT_ACTION" == "unlabeled" && "$ISSUE_STATE" != "open" ]]; then
            exit 0
        fi
        if [[ "$(open_freeze_issue_count)" != "0" ]]; then
            exit 0
        fi
        post_slack "[upgrade-freeze-off] $ISSUE_URL | actor: $ACTOR_LOGIN | Automated Lightdash upgrades are resumed."
        ;;
esac
