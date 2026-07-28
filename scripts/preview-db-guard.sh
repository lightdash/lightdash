#!/bin/bash
set -euo pipefail

# Circuit breaker for preview database snapshot diverts (see
# okteto.preview.yaml). Counts recent Deploy Preview failures whose deploy
# actually diverted from a snapshot; past the threshold something systemic is
# wrong (e.g. GCP throttling restores from the snapshot), and the caller
# deletes the snapshots so every preview falls back to the full
# migrate + seed path — including branches with older manifests.
# Runs from .github/workflows/preview-db-guard.yml.

LOOKBACK_MINUTES=90
THRESHOLD=3
REPO="${GITHUB_REPOSITORY:-lightdash/lightdash}"

since=$(date -u -d "-${LOOKBACK_MINUTES} minutes" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null ||
    date -u -v "-${LOOKBACK_MINUTES}M" +%Y-%m-%dT%H:%M:%SZ)

failures=0
for run_id in $(gh run list -R "$REPO" --workflow=pr.yml --created ">${since}" \
    --limit 50 --json databaseId --jq '.[].databaseId'); do
    job_id=$(gh run view "$run_id" -R "$REPO" --json jobs \
        --jq '.jobs[] | select(.name == "Deploy Preview" and .conclusion == "failure") | .databaseId' \
        2>/dev/null || true)
    [ -n "$job_id" ] || continue
    if gh api "repos/${REPO}/actions/jobs/${job_id}/logs" 2>/dev/null |
        grep -aq "Diverting preview database"; then
        failures=$((failures + 1))
        echo "diverted deploy failure: run ${run_id}"
    fi
done

echo "Diverted deploy failures in the last ${LOOKBACK_MINUTES} minutes: ${failures} (threshold ${THRESHOLD})"
{
    echo "failures=${failures}"
    if [ "$failures" -ge "$THRESHOLD" ]; then
        echo "tripped=true"
    else
        echo "tripped=false"
    fi
} >> "${GITHUB_OUTPUT:-/dev/null}"
