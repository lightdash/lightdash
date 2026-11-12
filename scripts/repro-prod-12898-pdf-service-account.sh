#!/usr/bin/env bash
# Repro for PROD-12898: dashboard PDF export started with a service-account
# token fails, while CSV/XLSX with the same token and PDF by a normal user work.
#
# Usage:
#   BASE_URL=https://<env-host> COOKIE_JAR=<curl cookie jar of an org admin> \
#     scripts/repro-prod-12898-pdf-service-account.sh [format ...]
#
# Optional: PROJECT_UUID, DASHBOARD_UUID (default: first project, first dashboard).
# Formats default to "pdf csv". Needs curl and python3. Prints no secrets:
# the service-account token is kept in a shell variable and never echoed.
#
# Expected (bug fixed): every row prints job status "completed" for both callers.
# Observed (bug present): the service-account PDF job ends "error" with
# DeactivatedAccountError; the service-account CSV and the human PDF complete.
set -euo pipefail

: "${BASE_URL:?set BASE_URL}"
: "${COOKIE_JAR:?set COOKIE_JAR (admin session cookie jar)}"
FORMATS=("$@")
[ ${#FORMATS[@]} -eq 0 ] && FORMATS=(pdf csv)

json() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)"; }

session() {
  curl -sS -b "$COOKIE_JAR" -H 'Content-Type: application/json' "$@"
}
bearer() {
  curl -sS -H "Authorization: Bearer $SA_TOKEN" -H 'Content-Type: application/json' "$@"
}

PROJECT_UUID="${PROJECT_UUID:-$(session "$BASE_URL/api/v1/org/projects" | json "d['results'][0]['projectUuid']")}"
DASHBOARD_UUID="${DASHBOARD_UUID:-$(session "$BASE_URL/api/v1/projects/$PROJECT_UUID/dashboards" | json "d['results'][0]['uuid']")}"
echo "project=$PROJECT_UUID dashboard=$DASHBOARD_UUID"

echo "== create service account (system:admin)"
SA_RESPONSE=$(session -X POST "$BASE_URL/api/v1/service-accounts" \
  -d '{"description":"prod-12898 repro","scopes":["system:admin"],"expiresAt":null}')
SA_TOKEN=$(printf '%s' "$SA_RESPONSE" | json "d['results']['token']")
SA_UUID=$(printf '%s' "$SA_RESPONSE" | json "d['results']['uuid']")
echo "service account uuid=$SA_UUID token=<redacted>"

poll_job() {
  local caller="$1" jobId="$2" status body
  for _ in $(seq 1 60); do
    if [ "$caller" = sa ]; then
      body=$(bearer "$BASE_URL/api/v1/schedulers/job/$jobId/status")
    else
      body=$(session "$BASE_URL/api/v1/schedulers/job/$jobId/status")
    fi
    status=$(printf '%s' "$body" | json "d['results']['status']")
    if [ "$status" = completed ] || [ "$status" = error ]; then
      printf '%s' "$body"
      return 0
    fi
    sleep 2
  done
  printf '%s' "$body"
}

run_export() {
  local caller="$1" format="$2" out code body jobId
  out=$(mktemp)
  if [ "$caller" = sa ]; then
    code=$(bearer -o "$out" -w '%{http_code}' -X POST \
      "$BASE_URL/api/v2/dashboards/$DASHBOARD_UUID/exports" -d "{\"format\":\"$format\"}")
  else
    code=$(session -o "$out" -w '%{http_code}' -X POST \
      "$BASE_URL/api/v2/dashboards/$DASHBOARD_UUID/exports" -d "{\"format\":\"$format\"}")
  fi
  echo "-- caller=$caller format=$format schedule HTTP $code"
  body=$(cat "$out"); rm -f "$out"
  echo "   schedule body: $body"
  jobId=$(printf '%s' "$body" | json "d['results']['jobId']" 2>/dev/null || true)
  [ -z "$jobId" ] && return 0
  echo "   job status: $(poll_job "$caller" "$jobId")"
}

for format in "${FORMATS[@]}"; do
  run_export sa "$format"
done
for format in "${FORMATS[@]}"; do
  run_export human "$format"
done

echo "== cleanup: delete service account"
session -o /dev/null -w 'delete HTTP %{http_code}\n' -X DELETE "$BASE_URL/api/v1/service-accounts/$SA_UUID"
