#!/usr/bin/env bash
# Namespaced CLI wrapper for agent operations.
# Usage: ./agent-harness/agent-cli.sh <agent-id> <command> [args...]
#
# Commands:
#   logs [service]       PM2 logs (api|frontend|common-watch|warehouses-watch)
#   psql [query]         Run SQL against agent's database
#   stats                CPU/memory for agent's PM2 processes
#   url                  Print frontend and API URLs
#   restart [service]    Restart specific PM2 process
#   status               PM2 process status table
#   health               curl /api/v1/health
#   slow-queries         Top 10 slow queries from pg_stat_statements
#   exec <cmd...>        Run command in db container
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AGENT_ID="${1:?Usage: $0 <agent-id> <command> [args...]}"
COMMAND="${2:?Usage: $0 <agent-id> <command> [args...]}"
shift 2

if [[ ! "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "ERROR: Agent ID must be 1-5, got '$AGENT_ID'" >&2
    exit 1
fi

FE_PORT=$((3000 + AGENT_ID * 10))
API_PORT=$((8000 + AGENT_ID * 10))
DB_PORT="${AGENT_DB_PORT:-15432}"
DB_NAME="agent_${AGENT_ID}"
PREFIX="agent-${AGENT_ID}"
PSQL_CMD="psql -h localhost -p $DB_PORT -U postgres -d $DB_NAME"

case "$COMMAND" in
    logs)
        SERVICE="${1:-api}"
        npx pm2 logs "${PREFIX}-${SERVICE}" --lines 100
        ;;

    psql)
        if [ $# -gt 0 ]; then
            $PSQL_CMD -c "$*"
        else
            $PSQL_CMD
        fi
        ;;

    stats)
        npx pm2 describe "${PREFIX}-api" 2>/dev/null | head -30
        echo "---"
        npx pm2 monit 2>/dev/null || npx pm2 list --sort name | grep "$PREFIX"
        ;;

    url)
        echo "Frontend: http://localhost:$FE_PORT"
        echo "Backend:  http://localhost:$API_PORT"
        echo "Health:   http://localhost:$API_PORT/api/v1/health"
        ;;

    restart)
        SERVICE="${1:-}"
        if [ -n "$SERVICE" ]; then
            npx pm2 restart "${PREFIX}-${SERVICE}"
        else
            for proc in api frontend common-watch warehouses-watch; do
                npx pm2 restart "${PREFIX}-${proc}" 2>/dev/null || true
            done
        fi
        ;;

    status)
        npx pm2 list --sort name | head -3
        npx pm2 list --sort name | grep "$PREFIX" || echo "No processes found for $PREFIX"
        ;;

    health)
        HEALTH_URL="http://localhost:$API_PORT/api/v1/health"
        echo "Checking $HEALTH_URL ..."
        if curl -sf "$HEALTH_URL"; then
            echo ""
            echo "OK"
        else
            echo "UNHEALTHY (exit code $?)"
            exit 1
        fi
        ;;

    slow-queries)
        $PSQL_CMD -c "
            SELECT
                substring(query, 1, 80) AS query,
                calls,
                round(total_exec_time::numeric, 2) AS total_ms,
                round(mean_exec_time::numeric, 2) AS mean_ms
            FROM pg_stat_statements
            ORDER BY total_exec_time DESC
            LIMIT 10
        " 2>/dev/null || echo "pg_stat_statements not available"
        ;;

    exec)
        docker compose -p agent-infra -f "$SCRIPT_DIR/docker-compose.agent.yml" \
            exec -T db "$@"
        ;;

    *)
        echo "Unknown command: $COMMAND" >&2
        echo "" >&2
        echo "Available commands:" >&2
        echo "  logs [service]       PM2 logs (api|frontend|common-watch|warehouses-watch)" >&2
        echo "  psql [query]         Run SQL against agent's database" >&2
        echo "  stats                CPU/memory for agent's PM2 processes" >&2
        echo "  url                  Print frontend and API URLs" >&2
        echo "  restart [service]    Restart specific PM2 process" >&2
        echo "  status               PM2 process status table" >&2
        echo "  health               curl /api/v1/health" >&2
        echo "  slow-queries         Top 10 slow queries from pg_stat_statements" >&2
        echo "  exec <cmd...>        Run command in db container" >&2
        exit 1
        ;;
esac
