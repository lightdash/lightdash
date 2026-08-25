#!/usr/bin/env bash
# Print frontend/API URLs for a live Lightdash stack serving this checkout.
# Prefers the claimed port slot; falls back to .env.development.local then 3000/8080.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

probe() {
    local api="$1" fe="$2"
    local api_code fe_code
    api_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "${api}/api/v1/health" || true)"
    fe_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "${fe}/login" || true)"
    [ "$api_code" = "200" ] && [ "$fe_code" = "200" ]
}

emit() {
    local id="$1" api_port="$2" fe_port="$3" source="$4"
    echo "export LD_INSTANCE_ID=${id}"
    echo "export PORT=${api_port}"
    echo "export FE_PORT=${fe_port}"
    echo "export FRONTEND_URL=http://localhost:${fe_port}"
    echo "export API_URL=http://localhost:${api_port}"
    echo "export SITE_URL=http://localhost:${fe_port}"
    echo "export VERIFY_URL_SOURCE=${source}"
    echo "export SEED_EMAIL=demo@lightdash.com"
    echo "export SEED_PASSWORD='demo_password!'"
    echo "export SEED_PROJECT_UUID=3675b69e-8324-4110-bdca-059031aa8da3"
    echo "export SEED_PROJECT_NAME='Jaffle shop'"
}

CLAIMED_ID=""
if ENV_EXPORTS="$(./scripts/dev-ports.sh env 2>/dev/null)"; then
    eval "$ENV_EXPORTS"
    CLAIMED_ID="${LD_INSTANCE_ID:-}"
    if probe "http://localhost:${PORT}" "http://localhost:${FE_PORT}"; then
        emit "${LD_INSTANCE_ID}" "${PORT}" "${FE_PORT}" "claimed-slot"
        exit 0
    fi
fi

ENV_API=""
ENV_FE=""
if [ -f .env.development.local ]; then
    ENV_API="$(grep -E '^PORT=' .env.development.local | head -1 | cut -d= -f2- || true)"
    ENV_FE="$(grep -E '^FE_PORT=' .env.development.local | head -1 | cut -d= -f2- || true)"
    ENV_ID="$(grep -E '^LD_INSTANCE_ID=' .env.development.local | head -1 | cut -d= -f2- || true)"
    if [ -n "$ENV_API" ] && [ -n "$ENV_FE" ] && probe "http://localhost:${ENV_API}" "http://localhost:${ENV_FE}"; then
        emit "${ENV_ID:-${CLAIMED_ID:-unknown}}" "$ENV_API" "$ENV_FE" "env-file"
        exit 0
    fi
fi

if probe "http://localhost:8080" "http://localhost:3000"; then
    emit "${CLAIMED_ID:-lightdash}" "8080" "3000" "default-ports"
    exit 0
fi

echo "FAIL: no healthy Lightdash UI+API. Tried claimed slot, .env.development.local, and http://localhost:3000 + :8080." >&2
exit 1
