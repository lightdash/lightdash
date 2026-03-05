#!/bin/bash

set -euo pipefail

PR_NUMBER="${1:-}"
MODE="${2:-psql}"  # psql (default), query, forward, counts

if [[ -z "$PR_NUMBER" ]]; then
  echo "Usage: $0 <pr_number> [psql|query|forward] [SQL]"
  echo ""
  echo "Modes:"
  echo "  psql     Open interactive psql session (default)"
  echo "  query    Run a SQL query: $0 123 query 'SELECT 1'"
  echo "  forward  Port-forward only, print connection details"
  exit 1
fi

NAMESPACE="pr-$PR_NUMBER"

printf "Setting up namespace..."
okteto namespace use "$NAMESPACE" >/dev/null 2>&1
okteto kubeconfig >/dev/null 2>&1
printf " ✓\n"

printf "Finding pod..."
POD=$(kubectl get pods -n "$NAMESPACE" --no-headers | awk '/lightdash-preview/ {print $1; exit}')
if [[ -z "$POD" ]]; then
  printf " ✗\nNo lightdash-preview pod found in namespace '$NAMESPACE'\n"
  exit 1
fi
printf " ✓\n"

printf "Fetching credentials..."
PGPASSWORD=$(kubectl exec -n "$NAMESPACE" "$POD" -- printenv PGPASSWORD)
printf " ✓\n"

# Pick a random free port
LOCAL_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("",0)); print(s.getsockname()[1]); s.close()')

# Start port-forward in background
kubectl port-forward -n "$NAMESPACE" svc/db-preview "$LOCAL_PORT":5432 >/dev/null 2>&1 &
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
PG="psql -h localhost -p $LOCAL_PORT -U postgres -d postgres"

case "$MODE" in
  psql)
    $PG
    ;;
  query)
    SQL="${3:-}"
    if [[ -z "$SQL" ]]; then
      echo "Usage: $0 <pr_number> query 'SELECT ...'"
      exit 1
    fi
    $PG -c "$SQL"
    ;;
  forward)
    trap - EXIT  # don't kill on exit
    echo "Port-forward running on localhost:$LOCAL_PORT (PID $PF_PID)"
    echo ""
    echo "  PGPASSWORD=$PGPASSWORD psql -h localhost -p $LOCAL_PORT -U postgres -d postgres"
    echo ""
    echo "Kill with: kill $PF_PID"
    ;;
  *)
    echo "Unknown mode: $MODE (use psql, query, or forward)"
    exit 1
    ;;
esac
