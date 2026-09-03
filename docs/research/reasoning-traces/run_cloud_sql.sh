#!/usr/bin/env bash
# Run extract_events.sql against a Lightdash Cloud customer's application database
# through cloud-sql-proxy. Read only. Nothing is written to the database and the
# password never touches disk or the terminal.
#
#   ./run_cloud_sql.sh <customer> <organization_uuid> [days] > events.tsv
#
# Needs: gcloud (user + application-default login), cloud-sql-proxy, psql.
# Cluster mapping follows lightdash-cloud/.claude/skills/debug-cloud-sql.
set -euo pipefail
customer="${1:?customer name}"; org="${2:?organization uuid}"; days="${3:-30}"
cluster="${CLUSTER:-us}"
case "$cluster" in
  us) conn="lightdash-cloud-beta:us-east4:lightdash-cloud-db"; project="lightdash-cloud-beta" ;;
  eu) conn="lightdash-cloud-beta:europe-west1:lightdash-cloud-db-europe-west1"; project="lightdash-cloud-beta" ;;
  staging) conn="lightdash-cloud-staging:europe-west1:lightdash-cloud-db-staging"; project="lightdash-cloud-staging" ;;
  *) echo "unknown cluster $cluster" >&2; exit 1 ;;
esac
port="${PORT:-5439}"
here="$(cd "$(dirname "$0")" && pwd)"

cloud-sql-proxy "$conn" --port "$port" --quiet >/dev/null 2>&1 &
proxy=$!
trap 'kill $proxy 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do (echo > /dev/tcp/127.0.0.1/$port) 2>/dev/null && break; sleep 0.5; done

PGPASSWORD="$(gcloud secrets versions access latest --secret="${customer}_sql_password" --project="$project")" \
psql "host=127.0.0.1 port=$port dbname=${DBNAME:-$customer} user=${DBUSER:-$customer} sslmode=disable" \
  -v ON_ERROR_STOP=1 -v org_uuid="'$org'" -v days="$days" -At -F $'\t' -f "$here/extract_events.sql"
