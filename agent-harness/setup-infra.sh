#!/usr/bin/env bash
# Sets up shared infrastructure for all agents.
# Starts Docker Compose stack and creates the template database.
# Idempotent — safe to run multiple times.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.agent.yml"
PROJECT_NAME="agent-infra"
TEMPLATE_DB="lightdash_template"
DB_PORT="${AGENT_DB_PORT:-15432}"

PSQL="psql -h localhost -p $DB_PORT -U postgres"

log() { echo "==> $*" >&2; }

# 1. Start Docker Compose stack
log "Starting shared infrastructure (project: $PROJECT_NAME)..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d

# 2. Wait for postgres health check
log "Waiting for PostgreSQL to be ready on port $DB_PORT..."
retries=0
max_retries=30
until $PSQL -c "SELECT 1" >/dev/null 2>&1; do
    retries=$((retries + 1))
    if [ "$retries" -ge "$max_retries" ]; then
        echo "ERROR: PostgreSQL not ready after $max_retries attempts" >&2
        exit 1
    fi
    sleep 2
done
log "PostgreSQL is ready."

# Enable pg_stat_statements extension
$PSQL -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" 2>/dev/null || true

# 3. Check if template database already exists
if $PSQL -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$TEMPLATE_DB'" | grep -q 1; then
    log "Template database '$TEMPLATE_DB' already exists. Skipping creation."
else
    log "Creating template database '$TEMPLATE_DB'..."

    # Create the database
    $PSQL -d postgres -c "CREATE DATABASE $TEMPLATE_DB"

    # 4. Run migrations, seeds, and dbt models
    export PGHOST=localhost
    export PGPORT=$DB_PORT
    export PGUSER=postgres
    export PGPASSWORD=password
    export PGDATABASE=$TEMPLATE_DB

    log "Running migrations..."
    (cd "$REPO_ROOT" && pnpm -F backend migrate)

    log "Seeding Lightdash..."
    (cd "$REPO_ROOT" && pnpm -F backend seed)

    log "Seeding Jaffle Shop dbt models..."
    (cd "$REPO_ROOT" && ./scripts/seed-jaffle.sh)

    # 5. Mark as PostgreSQL template
    log "Marking '$TEMPLATE_DB' as a PostgreSQL template..."
    $PSQL -d postgres -c "UPDATE pg_database SET datistemplate = true WHERE datname = '$TEMPLATE_DB'"
fi

# 6. Print status
log "Infrastructure status:"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps
log ""
log "Shared infrastructure is ready."
log "  PostgreSQL: localhost:$DB_PORT"
log "  MinIO S3:   localhost:${AGENT_MINIO_PORT:-19000}"
log "  MinIO UI:   localhost:${AGENT_MINIO_CONSOLE_PORT:-19001}"
log "  Browser:    localhost:${AGENT_BROWSER_PORT:-13001}"
log "  Mailpit:    localhost:${AGENT_MAILPIT_WEB_PORT:-18025}"
