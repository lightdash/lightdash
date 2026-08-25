#!/usr/bin/env bash
# Read-only: is a Lightdash instance worth driving?
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$REPO_ROOT"

ok() { echo "OK: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

if ! RESOLVED="$("$REPO_ROOT/.cursor/skills/verify-lightdash/scripts/resolve-env.sh")"; then
    fail "no healthy frontend+API (resolve-env.sh failed)"
fi
eval "$RESOLVED"
: "${FRONTEND_URL:?}" "${API_URL:?}"

API_HEALTH="$(curl -sS -o /tmp/ld-verify-health.json -w '%{http_code}' --max-time 5 "${API_URL}/api/v1/health" || true)"
[ "$API_HEALTH" = "200" ] || fail "API health ${API_HEALTH:-no response} at ${API_URL}/api/v1/health"
ok "API ${API_URL}/api/v1/health 200"

FE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "${FRONTEND_URL}/login" || true)"
[ "$FE_CODE" = "200" ] || fail "frontend ${FE_CODE:-no response} at ${FRONTEND_URL}/login"
ok "frontend ${FRONTEND_URL}/login 200"

if command -v pnpm >/dev/null 2>&1 && [ -n "${LD_INSTANCE_ID:-}" ]; then
    API_STATUS="$(pnpm exec pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
    procs = json.load(sys.stdin)
except Exception:
    print('UNREADABLE')
    raise SystemExit
name = '${LD_INSTANCE_ID}-api'
hits = [p for p in procs if p.get('name') == name]
print('MISSING' if not hits else hits[0].get('pm2_env', {}).get('status', 'unknown'))
" 2>/dev/null || echo "UNREADABLE")"
    if [ "$API_STATUS" = "online" ]; then
        ok "PM2 ${LD_INSTANCE_ID}-api online"
    else
        echo "WARN: PM2 ${LD_INSTANCE_ID}-api status=${API_STATUS}; API HTTP is healthy so doctor continues"
    fi
fi

LOGIN_CODE="$(curl -sS -o /tmp/ld-verify-login.json -w '%{http_code}' --max-time 10 \
    -X POST "${API_URL}/api/v1/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"demo@lightdash.com","password":"demo_password!"}' || true)"
[ "$LOGIN_CODE" = "200" ] || fail "seed login HTTP ${LOGIN_CODE:-no response} (need demo@lightdash.com / demo_password!)"
ok "seed user demo@lightdash.com can log in via API"

python3 - <<'PY'
import json
health = json.load(open("/tmp/ld-verify-health.json"))
results = health.get("results") or {}
print(f"OK: health.status={health.get('status')} mode={results.get('mode')} healthy={results.get('healthy')}")
PY

echo "READY: instance=${LD_INSTANCE_ID:-unknown} source=${VERIFY_URL_SOURCE:-unknown} frontend=${FRONTEND_URL} api=${API_URL}"
echo "SEED_PROJECT_UUID=3675b69e-8324-4110-bdca-059031aa8da3"
echo "SEED_PROJECT_NAME=Jaffle shop"
