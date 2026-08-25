#!/usr/bin/env bash
# Attach to a healthy instance, or start one. Records whether this run owns teardown.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

RUN_ID="${VERIFY_RUN_ID:-$(date +%Y%m%dT%H%M%S)-$$}"
EVIDENCE_DIR="${REPO_ROOT}/.cursor/skills/verify-lightdash/evidence/${RUN_ID}"
mkdir -p "$EVIDENCE_DIR"

if "$REPO_ROOT/.cursor/skills/verify-lightdash/scripts/doctor.sh"; then
    eval "$("$REPO_ROOT/.cursor/skills/verify-lightdash/scripts/resolve-env.sh")"
    echo "OWNED=0" > "${EVIDENCE_DIR}/run.env"
    echo "ATTACHED=1" >> "${EVIDENCE_DIR}/run.env"
    echo "VERIFY_RUN_ID=${RUN_ID}" >> "${EVIDENCE_DIR}/run.env"
    echo "EVIDENCE_DIR=${EVIDENCE_DIR}" >> "${EVIDENCE_DIR}/run.env"
    echo "LD_INSTANCE_ID=${LD_INSTANCE_ID:-unknown}" >> "${EVIDENCE_DIR}/run.env"
    echo "FRONTEND_URL=${FRONTEND_URL}" >> "${EVIDENCE_DIR}/run.env"
    echo "API_URL=${API_URL}" >> "${EVIDENCE_DIR}/run.env"
    echo "VERIFY_URL_SOURCE=${VERIFY_URL_SOURCE:-unknown}" >> "${EVIDENCE_DIR}/run.env"
    echo "AGENT_BROWSER_SESSION=ld-verify-${RUN_ID}" >> "${EVIDENCE_DIR}/run.env"
    echo "ATTACHED existing healthy stack source=${VERIFY_URL_SOURCE} frontend=${FRONTEND_URL}; cleanup will not stop it."
    echo "VERIFY_RUN_ID=${RUN_ID}"
    echo "EVIDENCE_DIR=${EVIDENCE_DIR}"
    exit 0
fi

echo "Doctor failed; starting ./scripts/dev-fast-start.sh (idempotent, can take several minutes)."
./scripts/dev-fast-start.sh
"$REPO_ROOT/.cursor/skills/verify-lightdash/scripts/doctor.sh" || {
    echo "FAIL: stack still unhealthy after launch" >&2
    exit 1
}

echo "OWNED=1" > "${EVIDENCE_DIR}/run.env"
echo "ATTACHED=0" >> "${EVIDENCE_DIR}/run.env"
echo "VERIFY_RUN_ID=${RUN_ID}" >> "${EVIDENCE_DIR}/run.env"
echo "EVIDENCE_DIR=${EVIDENCE_DIR}" >> "${EVIDENCE_DIR}/run.env"
eval "$(./scripts/dev-ports.sh env)"
echo "LD_INSTANCE_ID=${LD_INSTANCE_ID}" >> "${EVIDENCE_DIR}/run.env"
echo "AGENT_BROWSER_SESSION=ld-verify-${RUN_ID}" >> "${EVIDENCE_DIR}/run.env"
echo "OWNED launch of ${LD_INSTANCE_ID}; cleanup will stop this instance's PM2 processes only."
echo "VERIFY_RUN_ID=${RUN_ID}"
echo "EVIDENCE_DIR=${EVIDENCE_DIR}"
