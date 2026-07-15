#!/bin/bash

set -euo pipefail

TARGET="${1:-}"
MODE="${2:-psql}"  # psql (default), query, forward

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <pr_number|staging> [psql|query|forward] [SQL]"
  echo ""
  echo "Targets:"
  echo "  <pr_number>  A PR preview environment (namespace pr-<pr_number>)"
  echo "  staging      The shared staging environment (namespace lightdash-staging)"
  echo ""
  echo "Modes:"
  echo "  psql     Open interactive psql session (default)"
  echo "  query    Run a SQL query: $0 123 query 'SELECT 1'"
  echo "  forward  Port-forward only, print connection details"
  exit 1
fi

# Resolve the target namespace
if [[ "$TARGET" == "staging" ]]; then
  NAMESPACE="lightdash-staging"
else
  NAMESPACE="pr-$TARGET"
fi

printf "Setting up namespace..."
okteto namespace use "$NAMESPACE" >/dev/null 2>&1
okteto kubeconfig >/dev/null 2>&1
printf " ✓\n"

# The database service is `db-preview` today; tolerate a plain `db` in case a
# future compose renames it.
find_db_service() {
  local ns="$1"
  kubectl get svc -n "$ns" -o name 2>/dev/null \
    | sed 's|^service/||' \
    | grep -E '^(db-preview|db)$' \
    | head -1
}

# The DB may live in the target namespace (self-contained preview or staging)
# or, for a diverted PR that only rebuilt the frontend/backend, in the shared
# staging namespace. Use whichever namespace actually has a db service.
printf "Locating database..."
DB_NS="$NAMESPACE"
DB_SVC="$(find_db_service "$DB_NS" || true)"
if [[ -z "$DB_SVC" && "$NAMESPACE" != "lightdash-staging" ]]; then
  DB_NS="lightdash-staging"
  DB_SVC="$(find_db_service "$DB_NS" || true)"
fi
if [[ -z "$DB_SVC" ]]; then
  printf " ✗\nNo database service (db-preview/db) found in '%s'" "$NAMESPACE"
  [[ "$NAMESPACE" != "lightdash-staging" ]] && printf " or 'lightdash-staging'"
  printf "\n"
  exit 1
fi
printf " ✓ (%s/%s)\n" "$DB_NS" "$DB_SVC"

# Credentials live on the app pod in the same namespace as the database. After
# the frontend/backend split this is the `backend` pod; before it, the combined
# `lightdash-preview` pod. Accept either.
printf "Finding app pod..."
POD=$(kubectl get pods -n "$DB_NS" --no-headers 2>/dev/null \
  | awk '/^backend-|^lightdash-preview-/ {print $1; exit}')
if [[ -z "$POD" ]]; then
  printf " ✗\nNo backend/lightdash-preview pod found in namespace '%s'\n" "$DB_NS"
  exit 1
fi
printf " ✓ (%s)\n" "$POD"

printf "Fetching credentials..."
PGPASSWORD=$(kubectl exec -n "$DB_NS" "$POD" -- printenv PGPASSWORD)
PGUSER=$(kubectl exec -n "$DB_NS" "$POD" -- printenv PGUSER 2>/dev/null || echo postgres)
PGDATABASE=$(kubectl exec -n "$DB_NS" "$POD" -- printenv PGDATABASE 2>/dev/null || echo postgres)
printf " ✓\n"

# Pick a random free port
LOCAL_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')

# Start port-forward in background
kubectl port-forward -n "$DB_NS" "svc/$DB_SVC" "$LOCAL_PORT":5432 >/dev/null 2>&1 &
PF_PID=$!

cleanup() {
  if kill "$PF_PID" 2>/dev/null; then
    wait "$PF_PID" 2>/dev/null || true
    echo "Port-forward stopped."
  fi
}
trap cleanup EXIT INT TERM

# Wait for port to be ready
printf "Connecting"
for i in $(seq 1 15); do
  if nc -z localhost "$LOCAL_PORT" 2>/dev/null; then
    printf " ✓\n"
    break
  fi
  if ! kill -0 "$PF_PID" 2>/dev/null; then
    printf " ✗\nPort-forward process died\n"
    exit 1
  fi
  printf "."
  sleep 1
done

if ! nc -z localhost "$LOCAL_PORT" 2>/dev/null; then
  printf " ✗\nPort-forward timed out after 15s\n"
  exit 1
fi

export PGPASSWORD
PG="psql -h localhost -p $LOCAL_PORT -U $PGUSER -d $PGDATABASE"

case "$MODE" in
  psql)
    $PG
    ;;
  query)
    SQL="${3:-}"
    if [[ -z "$SQL" ]]; then
      echo "Usage: $0 <pr_number|staging> query 'SELECT ...'"
      exit 1
    fi
    $PG -c "$SQL"
    ;;
  forward)
    trap - EXIT  # don't kill on exit
    echo "Port-forward running on localhost:$LOCAL_PORT (PID $PF_PID)"
    echo ""
    echo "  PGPASSWORD=$PGPASSWORD psql -h localhost -p $LOCAL_PORT -U $PGUSER -d $PGDATABASE"
    echo ""
    echo "Kill with: kill $PF_PID"
    ;;
  *)
    echo "Unknown mode: $MODE (use psql, query, or forward)"
    exit 1
    ;;
esac
