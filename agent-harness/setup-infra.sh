#!/usr/bin/env bash
# Sets up shared infrastructure for all agents.
# Starts Docker Compose stack and creates the template database.
# Idempotent — safe to run multiple times.
#
# Usage: ./agent-harness/setup-infra.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.agent.yml"
PROJECT_NAME="agent-infra"
TEMPLATE_DB="lightdash_template"
DB_PORT="${AGENT_DB_PORT:-15432}"

PSQL="psql -h localhost -p $DB_PORT -U postgres -d postgres"

log() { echo "==> $*" >&2; }

# ── Step 1: Start Docker Compose stack ──────────────────────────────────────
log "Starting shared infrastructure (project: $PROJECT_NAME)..."
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d

# ── Step 2: Wait for PostgreSQL health check ────────────────────────────────
log "Waiting for PostgreSQL to be ready on port $DB_PORT..."
for i in $(seq 1 30); do
    if pg_isready -h localhost -p "$DB_PORT" -U postgres >/dev/null 2>&1; then
        log "PostgreSQL is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "Error: PostgreSQL did not become ready within 30 seconds." >&2
        exit 1
    fi
    sleep 1
done

# ── Step 3: Enable pg_stat_statements extension ────────────────────────────
log "Enabling pg_stat_statements extension..."
$PSQL -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements" 2>/dev/null || true

# ── Step 4: Check if template database already exists ───────────────────────
if $PSQL -tAc "SELECT 1 FROM pg_database WHERE datname = '$TEMPLATE_DB'" | grep -q 1; then
    log "Template database '$TEMPLATE_DB' already exists. Skipping creation."
else
    log "Creating template database '$TEMPLATE_DB'..."
    $PSQL -c "CREATE DATABASE $TEMPLATE_DB"

    TEMPLATE_PSQL="psql -h localhost -p $DB_PORT -U postgres -d $TEMPLATE_DB"

    log "Running migrations..."
    PGHOST=localhost PGPORT="$DB_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE="$TEMPLATE_DB" \
        pnpm --dir "$REPO_ROOT" -F backend migrate

    log "Seeding Lightdash..."
    PGHOST=localhost PGPORT="$DB_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE="$TEMPLATE_DB" \
        pnpm --dir "$REPO_ROOT" -F backend seed

    log "Seeding Jaffle Shop (dbt models)..."
    PGHOST=localhost PGPORT="$DB_PORT" PGUSER=postgres PGPASSWORD=password PGDATABASE="$TEMPLATE_DB" \
        "$REPO_ROOT/scripts/seed-jaffle.sh"

    log "Marking '$TEMPLATE_DB' as a PostgreSQL template..."
    $PSQL -c "UPDATE pg_database SET datistemplate = true WHERE datname = '$TEMPLATE_DB'"
fi

# ── Step 5: Print status ───────────────────────────────────────────────────
log "Shared infrastructure status:"
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps

echo ""
log "Infrastructure is ready."
log "  PostgreSQL: localhost:$DB_PORT"
log "  MinIO S3:   localhost:${AGENT_MINIO_PORT:-19000}"
log "  MinIO UI:   localhost:${AGENT_MINIO_CONSOLE_PORT:-19001}"
log "  Browser:    localhost:${AGENT_BROWSER_PORT:-13001}"
log "  Mailpit UI: localhost:${AGENT_MAILPIT_WEB_PORT:-18025}"
log "  Mailpit SMTP: localhost:${AGENT_MAILPIT_SMTP_PORT:-11025}"
log "  Template DB: $TEMPLATE_DB"
