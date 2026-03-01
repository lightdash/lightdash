#!/usr/bin/env bash
# Namespaced CLI wrapper for managing a single agent's resources.
#
# Usage: ./agent-harness/agent-cli.sh <agent-id> <command> [args...]
#
# Commands:
#   logs [service]     PM2 logs (api|frontend|common-watch|warehouses-watch)
#   psql [query]       Run SQL against agent's database
#   stats              CPU/memory for agent's PM2 processes
#   url                Print frontend and API URLs
#   restart [service]  Restart specific PM2 process (or all agent processes)
#   status             PM2 process status table
#   health             curl /api/v1/health
#   slow-queries       Top 10 slow queries from pg_stat_statements
#   exec <cmd...>      Run command with agent env vars loaded
set -euo pipefail

AGENT_ID="${1:-}"

if [[ -z "$AGENT_ID" ]] || ! [[ "$AGENT_ID" =~ ^[1-5]$ ]]; then
    echo "Usage: $0 <agent-id> <command> [args...]" >&2
    echo "" >&2
    echo "Commands:" >&2
    echo "  logs [service]     PM2 logs (api|frontend|common-watch|warehouses-watch)" >&2
    echo "  psql [query]       Run SQL against agent's database" >&2
    echo "  stats              CPU/memory for agent's PM2 processes" >&2
    echo "  url                Print frontend and API URLs" >&2
    echo "  restart [service]  Restart specific PM2 process (or all)" >&2
    echo "  status             PM2 process status table" >&2
    echo "  health             curl /api/v1/health" >&2
    echo "  slow-queries       Top 10 slow queries from pg_stat_statements" >&2
    echo "  exec <cmd...>      Run command with agent env vars loaded" >&2
    exit 1
fi

COMMAND="${2:-}"
shift 2 2>/dev/null || true

# Port calculations
FE_PORT=$((3000 + AGENT_ID * 10))
API_PORT=$((8000 + AGENT_ID * 10))
DB_PORT="${AGENT_DB_PORT:-15432}"
AGENT_DB="agent_${AGENT_ID}"
PREFIX="agent-${AGENT_ID}-"

PSQL_CMD="psql -h localhost -p $DB_PORT -U postgres -d $AGENT_DB"

case "$COMMAND" in
    logs)
        SERVICE="${1:-}"
        if [ -n "$SERVICE" ]; then
            npx pm2 logs "${PREFIX}${SERVICE}" --lines 50
        else
            # Show logs for all agent processes
            npx pm2 logs --lines 50 | grep -E "${PREFIX}" || npx pm2 logs --lines 50
        fi
        ;;

    psql)
        if [ $# -gt 0 ]; then
            $PSQL_CMD -c "$*"
        else
            $PSQL_CMD
        fi
        ;;

    stats)
        npx pm2 monit 2>/dev/null || npx pm2 jlist 2>/dev/null | node -e "
            const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            const procs = data.filter(p => p.name.startsWith('${PREFIX}'));
            console.log('Process'.padEnd(35) + 'CPU'.padEnd(8) + 'Memory'.padEnd(12) + 'Status');
            console.log('-'.repeat(65));
            procs.forEach(p => {
                const mem = (p.monit?.memory || 0) / 1024 / 1024;
                console.log(
                    p.name.padEnd(35) +
                    ((p.monit?.cpu || 0) + '%').padEnd(8) +
                    (mem.toFixed(1) + ' MB').padEnd(12) +
                    p.pm2_env.status
                );
            });
        "
        ;;

    url)
        echo "Frontend:  http://localhost:${FE_PORT}"
        echo "API:       http://localhost:${API_PORT}"
        echo "Health:    http://localhost:${API_PORT}/api/v1/health"
        echo "Database:  ${AGENT_DB} on localhost:${DB_PORT}"
        ;;

    restart)
        SERVICE="${1:-}"
        if [ -n "$SERVICE" ]; then
            npx pm2 restart "${PREFIX}${SERVICE}"
        else
            # Restart all agent processes
            npx pm2 jlist 2>/dev/null | node -e "
                const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                data.filter(p => p.name.startsWith('${PREFIX}')).forEach(p => console.log(p.name));
            " 2>/dev/null | while read -r proc; do
                npx pm2 restart "$proc"
            done
        fi
        ;;

    status)
        npx pm2 jlist 2>/dev/null | node -e "
            const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
            const procs = data.filter(p => p.name.startsWith('${PREFIX}'));
            if (procs.length === 0) {
                console.log('No processes found for agent ${AGENT_ID}');
                process.exit(0);
            }
            console.log('Process'.padEnd(35) + 'Status'.padEnd(12) + 'Restarts'.padEnd(10) + 'Uptime');
            console.log('-'.repeat(70));
            procs.forEach(p => {
                const uptime = p.pm2_env.pm_uptime
                    ? Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000) + 's'
                    : 'N/A';
                console.log(
                    p.name.padEnd(35) +
                    p.pm2_env.status.padEnd(12) +
                    String(p.pm2_env.restart_time).padEnd(10) +
                    uptime
                );
            });
        "
        ;;

    health)
        HEALTH_URL="http://localhost:${API_PORT}/api/v1/health"
        echo "Checking $HEALTH_URL ..."
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null) || true
        if [ "$HTTP_CODE" = "200" ]; then
            echo "OK (HTTP 200)"
            curl -s "$HEALTH_URL" | node -e "
                const data = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
                console.log(JSON.stringify(data, null, 2));
            " 2>/dev/null || true
        else
            echo "UNHEALTHY (HTTP $HTTP_CODE)"
            exit 1
        fi
        ;;

    slow-queries)
        $PSQL_CMD -c "
            SELECT
                left(query, 80) AS query,
                calls,
                round(total_exec_time::numeric, 2) AS total_ms,
                round(mean_exec_time::numeric, 2) AS mean_ms,
                rows
            FROM pg_stat_statements
            ORDER BY mean_exec_time DESC
            LIMIT 10;
        " 2>/dev/null || echo "pg_stat_statements not available (extension may not be enabled)"
        ;;

    exec)
        if [ $# -eq 0 ]; then
            echo "Usage: $0 $AGENT_ID exec <command...>" >&2
            exit 1
        fi
        export PGHOST=localhost
        export PGPORT="$DB_PORT"
        export PGUSER=postgres
        export PGPASSWORD=password
        export PGDATABASE="$AGENT_DB"
        export PORT="$API_PORT"
        export SITE_URL="http://localhost:${FE_PORT}"
        exec "$@"
        ;;

    *)
        echo "Unknown command: $COMMAND" >&2
        echo "Run '$0' without arguments to see available commands." >&2
        exit 1
        ;;
esac
