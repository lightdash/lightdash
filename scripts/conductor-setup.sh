#!/usr/bin/env bash
# Conductor workspace setup hook.
# Copies .env.development.local from the main worktree, claims a port slot,
# installs dependencies, starts Docker services, and bootstraps the database.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

log() { echo "==> [conductor:${CONDUCTOR_WORKSPACE_NAME:-setup}] $*"; }

# ── Step 1: Copy .env.development.local from main worktree ─────────────────
# Worktrees don't get gitignored files, so we copy from the main checkout.
MAIN_WORKTREE=$(git worktree list --porcelain | awk '/^worktree / { print $2; exit }')

if [ -f "$MAIN_WORKTREE/.env.development.local" ]; then
    cp "$MAIN_WORKTREE/.env.development.local" "$REPO_ROOT/.env.development.local"
    log "Copied .env.development.local from $MAIN_WORKTREE"
elif [ -f "$MAIN_WORKTREE/.env.development" ]; then
    cp "$MAIN_WORKTREE/.env.development" "$REPO_ROOT/.env.development.local"
    log "Copied .env.development from $MAIN_WORKTREE (no .env.development.local found)"
else
    log "Warning: No .env.development.local or .env.development found in $MAIN_WORKTREE"
fi

# ── Step 2: Copy venv symlink or directory ──────────────────────────────────
# The Python/dbt venv is also gitignored. Symlink it from main worktree.
if [ -d "$MAIN_WORKTREE/venv" ] && [ ! -e "$REPO_ROOT/venv" ]; then
    ln -s "$MAIN_WORKTREE/venv" "$REPO_ROOT/venv"
    log "Symlinked venv from $MAIN_WORKTREE"
fi

# ── Step 3: Claim a port slot ───────────────────────────────────────────────
log "Claiming port slot..."
./scripts/dev-ports.sh claim
eval "$(./scripts/dev-ports.sh env)"
log "Instance: $LD_INSTANCE_ID | Ports: FE=$FE_PORT API=$PORT PG=$LD_PG_PORT"

# ── Step 3b: Patch .env.development.local with instance-specific ports ──────
# The copied env file has the main worktree's ports. Override with ours.
ENV_FILE="$REPO_ROOT/.env.development.local"
if [ -f "$ENV_FILE" ]; then
    # Remove existing instance-specific lines, then append ours
    sed -i '' '/^LD_INSTANCE_ID=/d; /^PGHOST=/d; /^PGPORT=/d; /^PGUSER=/d; /^PGPASSWORD=/d; /^PORT=/d; /^FE_PORT=/d; /^SCHEDULER_PORT=/d; /^DEBUG_PORT=/d; /^SDK_TEST_PORT=/d; /^SPOTLIGHT_PORT=/d; /^LIGHTDASH_PROMETHEUS_PORT=/d; /^SITE_URL=/d; /^INTERNAL_LIGHTDASH_HOST=/d' "$ENV_FILE"
    cat >> "$ENV_FILE" <<ENVEOF

# Conductor workspace overrides (instance: $LD_INSTANCE_ID)
LD_INSTANCE_ID=$LD_INSTANCE_ID
PGHOST=localhost
PGPORT=$LD_PG_PORT
PGUSER=postgres
PGPASSWORD=password
PORT=$PORT
FE_PORT=$FE_PORT
SCHEDULER_PORT=$SCHEDULER_PORT
DEBUG_PORT=$DEBUG_PORT
SDK_TEST_PORT=$SDK_TEST_PORT
SPOTLIGHT_PORT=$SPOTLIGHT_PORT
LIGHTDASH_PROMETHEUS_PORT=$LIGHTDASH_PROMETHEUS_PORT
SITE_URL=http://localhost:$FE_PORT
INTERNAL_LIGHTDASH_HOST=http://localhost:$FE_PORT
ENVEOF
    log "Patched .env.development.local with instance ports"
fi

# ── Step 4: Install dependencies and build ──────────────────────────────────
log "Installing dependencies..."
pnpm install

log "Building common package..."
pnpm -F common build

log "Building warehouses package..."
pnpm -F warehouses build

# ── Step 5: Start Docker services ───────────────────────────────────────────
log "Starting shared Docker services..."
docker compose -p ld-shared -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d

log "Starting per-instance PostgreSQL on port $LD_PG_PORT..."
docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml --env-file .env.development up -d

# Wait for PostgreSQL
log "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
    docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres 2>/dev/null && break
    sleep 1
done
log "PostgreSQL is ready."

# ── Step 6: Bootstrap database ──────────────────────────────────────────────
# Check if DB is already migrated
DB_MIGRATED=$(docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" psql -U postgres -tAc \
    "SELECT CASE WHEN EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='sessions') THEN 'yes' ELSE 'no' END" 2>/dev/null || echo "no")

if [ "$DB_MIGRATED" = "yes" ]; then
    log "Database already migrated. Skipping setup."
else
    # Try fast path: bootstrap from shared base snapshot
    if docker volume inspect ld-shared_postgres_base >/dev/null 2>&1; then
        log "Bootstrapping from shared base snapshot..."
        docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
        docker run --rm \
            -v "ld-shared_postgres_base:/source:ro" \
            -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
            alpine sh -c "rm -rf /target/* && cd /source && tar cf - . | (cd /target && tar xf -)"
        docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
        for i in $(seq 1 10); do
            docker exec "${LD_CONTAINER_PREFIX}-db-dev-1" pg_isready -U postgres 2>/dev/null && break
            sleep 1
        done
        log "Bootstrap complete."
    else
        # Slow path: full setup
        log "No shared base snapshot found. Running full setup..."

        export PATH="$REPO_ROOT/venv/bin:$PATH"
        export DBT_DEMO_DIR="$REPO_ROOT/examples/full-jaffle-shop-demo"

        log "Running migrations..."
        PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate

        log "Seeding database..."
        PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend seed

        log "Building dbt models..."
        PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
            "$REPO_ROOT/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles
        PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
            "$REPO_ROOT/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles

        # Create shared base snapshot for future instances
        log "Creating shared base snapshot..."
        docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
        docker volume create ld-shared_postgres_base
        docker run --rm \
            -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
            -v "ld-shared_postgres_base:/snapshot" \
            alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
        docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
        log "Shared base snapshot created."
    fi
fi

# ── Step 7: Take instance snapshot (for fast /docker-dev reset) ─────────────
if ! docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1; then
    log "Taking instance snapshot..."
    docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml stop db-dev
    docker volume create "${LD_VOLUME_PREFIX}_postgres_data_snapshot"
    docker run --rm \
        -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
        -v "${LD_VOLUME_PREFIX}_postgres_data_snapshot:/snapshot" \
        alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)"
    docker compose -p "$LD_COMPOSE_PROJECT" -f docker/docker-compose.dev.instance.yml start db-dev
    log "Instance snapshot created."
fi

# ── Done ────────────────────────────────────────────────────────────────────
log ""
log "Workspace '${CONDUCTOR_WORKSPACE_NAME:-$LD_INSTANCE_ID}' is ready!"
log "  Instance:   $LD_INSTANCE_ID"
log "  Frontend:   http://localhost:$FE_PORT"
log "  API:        http://localhost:$PORT"
log "  PostgreSQL: localhost:$LD_PG_PORT"
log "  Login:      demo@lightdash.com / demo_password!"
log ""
log "PM2 will start when the agent runs '/docker-dev start' or 'pnpm pm2:start'."
