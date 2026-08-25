#!/usr/bin/env bash
# Tear down only a stack this verification run started. Never deletes evidence.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

RUN_ID="${1:-${VERIFY_RUN_ID:-}}"
if [ -z "$RUN_ID" ]; then
    echo "usage: cleanup.sh <VERIFY_RUN_ID>" >&2
    echo "or set VERIFY_RUN_ID" >&2
    exit 2
fi

RUN_ENV="${REPO_ROOT}/.cursor/skills/verify-lightdash/evidence/${RUN_ID}/run.env"
if [ ! -f "$RUN_ENV" ]; then
    echo "FAIL: no run.env at ${RUN_ENV}" >&2
    exit 1
fi

# shellcheck disable=SC1090
source "$RUN_ENV"

if [ -n "${AGENT_BROWSER_SESSION:-}" ]; then
    AGENT_BROWSER_SESSION="${AGENT_BROWSER_SESSION}" \
        "$REPO_ROOT/.cursor/skills/verify-lightdash/scripts/ab.sh" close >/dev/null 2>&1 || true
    echo "CLOSED agent-browser session ${AGENT_BROWSER_SESSION}"
fi

if [ "${OWNED:-0}" != "1" ]; then
    echo "SKIP: this run attached to an existing instance; not stopping PM2 or Docker."
    echo "Evidence remains under ${EVIDENCE_DIR:-.cursor/skills/verify-lightdash/evidence/${RUN_ID}}"
    exit 0
fi

: "${LD_INSTANCE_ID:?run.env missing LD_INSTANCE_ID}"

for suffix in api api-routes-watch scheduler frontend common-watch formula-watch warehouses-watch spotlight maple sdk-test; do
    pnpm exec pm2 delete "${LD_INSTANCE_ID}-${suffix}" >/dev/null 2>&1 || true
done

echo "STOPPED PM2 processes for ${LD_INSTANCE_ID} (not shared Docker services, not the port slot)."
echo "Evidence remains under ${EVIDENCE_DIR}"
