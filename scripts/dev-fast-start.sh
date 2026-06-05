#!/usr/bin/env bash
# Deterministic fast-path bootstrap for the Lightdash Docker dev environment.
#
# Encodes the happy path of `/docker-dev start` so a worktree can be brought up
# in a single non-interactive run — no agentic step-by-step. The first agentic
# run produces a working environment; this script captures that path so every
# subsequent run (and every new worktree) is fast.
#
# Contract relied on by the /docker-dev command for self-repair:
#   - Prints "STEP: <name>"  before each phase.
#   - Prints "OK: ..." / "SKIP: ..." for done / already-satisfied phases.
#   - On failure prints "FAIL: <step> -- <reason>" to stderr and exits non-zero.
#   - Exits 0 only after the backend /api/v1/health endpoint returns 200.
#   - Idempotent: safe to re-run at any time.
#
# Usage: scripts/dev-fast-start.sh [--ee]
#
# When this script fails, /docker-dev reads the FAIL line, fixes the root cause
# using the documented agentic steps, then patches this script so it won't recur.

set -uo pipefail

SCHEMA_VERSION=1
EE_MODE=false
for arg in "$@"; do
    case "$arg" in
        --ee|ee) EE_MODE=true ;;
        *) echo "FAIL: args -- unknown argument '$arg'" >&2; exit 2 ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || { echo "FAIL: cd -- cannot enter repo root $REPO_ROOT" >&2; exit 1; }

SHARED_COMPOSE="docker/docker-compose.dev.shared.yml"
INSTANCE_COMPOSE="docker/docker-compose.dev.instance.yml"
SHARED_BASE_VOLUME="ld-shared_postgres_base"

fail() { echo "FAIL: $1 -- $2" >&2; exit 1; }
step() { echo "STEP: $1"; }

instance_pm2_names() {
    for suffix in api scheduler frontend common-watch formula-watch warehouses-watch sdk-test spotlight; do
        echo "${LD_INSTANCE_ID}-${suffix}"
    done
}

dotenv_args() {
    if [ "$EE_MODE" = true ]; then
        echo "-e .env.development.local -e .env.development"
    else
        echo "-e .env.development"
    fi
}

# ---------------------------------------------------------------------------
step "Claim port slot and load instance env"
./scripts/dev-ports.sh claim >/dev/null 2>&1 || fail "ports" "dev-ports.sh claim failed (run ./scripts/dev-ports.sh claim to see why)"
ENV_EXPORTS="$(./scripts/dev-ports.sh env 2>/dev/null)" || fail "ports" "dev-ports.sh env failed"
eval "$ENV_EXPORTS"
: "${LD_INSTANCE_ID:?}" "${LD_COMPOSE_PROJECT:?}" "${LD_VOLUME_PREFIX:?}" "${LD_CONTAINER_PREFIX:?}" "${LD_PG_PORT:?}" "${PORT:?}" "${FE_PORT:?}"
DB_CONTAINER="${LD_CONTAINER_PREFIX}-db-dev-1"
echo "OK: instance=$LD_INSTANCE_ID api=$PORT frontend=$FE_PORT pg=$LD_PG_PORT"

# ---------------------------------------------------------------------------
step "Ensure correct Node version"
REQUIRED_NODE="$(cat .nvmrc 2>/dev/null || cat .node-version 2>/dev/null || echo "")"
CURRENT_NODE="$(node -v 2>/dev/null | sed 's/^v//')"
if [ -n "$REQUIRED_NODE" ] && ! echo "$CURRENT_NODE" | grep -q "^${REQUIRED_NODE}"; then
    if command -v fnm >/dev/null 2>&1; then
        eval "$(fnm env)"; fnm use "$REQUIRED_NODE" --install-if-missing >/dev/null 2>&1
    elif [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
        . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; nvm use "$REQUIRED_NODE" >/dev/null 2>&1 || nvm install "$REQUIRED_NODE" >/dev/null 2>&1
    elif command -v mise >/dev/null 2>&1; then
        mise use "node@$REQUIRED_NODE" >/dev/null 2>&1
    fi
    CURRENT_NODE="$(node -v 2>/dev/null | sed 's/^v//')"
    echo "$CURRENT_NODE" | grep -q "^${REQUIRED_NODE}" || fail "node" "need Node $REQUIRED_NODE, have ${CURRENT_NODE:-none}; install a version manager (fnm/nvm/mise)"
fi
echo "OK: node $(node -v 2>/dev/null)"

# ---------------------------------------------------------------------------
step "Ensure dependencies installed and built"
if test -d node_modules \
    && test -f packages/common/dist/cjs/index.js \
    && test -f packages/formula/dist/grammar/parser.js \
    && test -f packages/warehouses/dist/warehouseClients/ca-bundle-aws-redshift.crt; then
    echo "SKIP: dependencies already present"
else
    command -v sfw >/dev/null 2>&1 || npm i -g sfw >/dev/null 2>&1 || fail "deps" "could not install sfw"
    sfw pnpm install || fail "deps" "sfw pnpm install failed"
    pnpm -F common build && pnpm -F warehouses build && pnpm -F @lightdash/formula build || fail "deps" "package builds failed"
    echo "OK: installed and built"
fi

# ---------------------------------------------------------------------------
step "Ensure Python/dbt venv"
if test -f venv/bin/dbt && test -f venv/bin/dbt1.7; then
    echo "SKIP: venv present"
else
    python3 -m venv venv || fail "venv" "python3 -m venv failed"
    ./venv/bin/pip install dbt-core==1.7.0 dbt-postgres==1.7.0 'protobuf>=4.0.0,<5.0.0' >/dev/null 2>&1 \
        || fail "venv" "pip install dbt failed"
    ln -sf dbt venv/bin/dbt1.7
    echo "OK: venv ready"
fi

# ---------------------------------------------------------------------------
step "Ensure .env.development.local"
ENV_PORTS_CHANGED=0
if test -f .env.development.local; then
    # Reconcile slot-derived ports. The claimed slot can differ from when the file
    # was first written (e.g. after stop-all the next start lands on a free slot).
    # A stale PGPORT/PORT silently points PM2 at a dead container, and the API
    # crash-loops on "Error migrating graphile worker" (its first DB op at boot).
    reconcile_env() {
        local key="$1" val="$2" cur
        grep -q "^${key}=" .env.development.local || return 0
        cur="$(grep "^${key}=" .env.development.local | head -1 | cut -d= -f2-)"
        [ "$cur" = "$val" ] && return 0
        awk -v k="$key" -v v="$val" 'BEGIN{FS=OFS="="} $1==k{print k"="v; next} {print}' \
            .env.development.local > .env.development.local.tmp \
            && mv .env.development.local.tmp .env.development.local
        ENV_PORTS_CHANGED=1
    }
    reconcile_env PGPORT "${LD_PG_PORT}"
    reconcile_env PORT "${PORT}"
    reconcile_env FE_PORT "${FE_PORT}"
    reconcile_env SCHEDULER_PORT "${SCHEDULER_PORT}"
    reconcile_env DEBUG_PORT "${DEBUG_PORT}"
    reconcile_env SDK_TEST_PORT "${SDK_TEST_PORT}"
    reconcile_env SPOTLIGHT_PORT "${SPOTLIGHT_PORT}"
    reconcile_env LIGHTDASH_PROMETHEUS_PORT "${LIGHTDASH_PROMETHEUS_PORT}"
    reconcile_env SITE_URL "http://localhost:${FE_PORT}"
    reconcile_env INTERNAL_LIGHTDASH_HOST "http://localhost:${FE_PORT}"
    reconcile_env LIGHTDASH_API_URL "http://localhost:${PORT}"
    if [ "$ENV_PORTS_CHANGED" = 1 ]; then
        echo "OK: env file reconciled to slot ports (PGPORT=${LD_PG_PORT} PORT=${PORT} FE_PORT=${FE_PORT})"
    else
        echo "SKIP: env file exists and ports match slot"
    fi
else
    cat > .env.development.local << EOF
# Local development overrides (instance: ${LD_INSTANCE_ID})
LD_INSTANCE_ID=${LD_INSTANCE_ID}
PGHOST=localhost
PGPORT=${LD_PG_PORT}
PORT=${PORT}
FE_PORT=${FE_PORT}
SCHEDULER_PORT=${SCHEDULER_PORT}
DEBUG_PORT=${DEBUG_PORT}
SDK_TEST_PORT=${SDK_TEST_PORT}
SPOTLIGHT_PORT=${SPOTLIGHT_PORT}
LIGHTDASH_PROMETHEUS_PORT=${LIGHTDASH_PROMETHEUS_PORT}
SITE_URL=http://localhost:${FE_PORT}
S3_ENDPOINT=http://localhost:9000
HEADLESS_BROWSER_HOST=localhost
HEADLESS_BROWSER_PORT=3001
INTERNAL_LIGHTDASH_HOST=http://localhost:${FE_PORT}

# Email - Mailpit (shared service, view emails at http://localhost:8025)
EMAIL_SMTP_HOST=localhost
EMAIL_SMTP_PORT=1025
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USE_AUTH=false
EMAIL_SMTP_ALLOW_INVALID_CERT=true
EMAIL_SMTP_SENDER_NAME=Lightdash
EMAIL_SMTP_SENDER_EMAIL=noreply@lightdash.local

# Dev API access (auto-provisioned PAT from seed data)
LIGHTDASH_API_URL=http://localhost:${PORT}
LDPAT=ldpat_deadbeefdeadbeefdeadbeefdeadbeef
EOF
    echo "DBT_DEMO_DIR=$(pwd)/examples/full-jaffle-shop-demo" >> .env.development.local
    echo "OK: env file created"
fi

# EE auto-detect: license already in env file => treat as EE for migrate/seed.
if grep -q "^LIGHTDASH_LICENSE_KEY=" .env.development.local 2>/dev/null; then
    EE_MODE=true
fi
if [ "$EE_MODE" = true ] && ! grep -q "^LIGHTDASH_LICENSE_KEY=eyJ" .env.development.local 2>/dev/null; then
    fail "ee-license" "EE requested but no LIGHTDASH_LICENSE_KEY in .env.development.local; run Step EE-1 (1Password) first"
fi

# ---------------------------------------------------------------------------
step "Start Docker services"
docker compose -p ld-shared -f "$SHARED_COMPOSE" --env-file .env.development up -d \
    || fail "docker-shared" "could not start shared services (minio/headless-browser/mailpit/nats)"
docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" --env-file .env.development up -d \
    || fail "docker-instance" "could not start per-instance PostgreSQL"

step "Wait for PostgreSQL"
PG_READY=false
for _ in $(seq 1 30); do
    if docker exec "$DB_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then PG_READY=true; break; fi
    sleep 1
done
[ "$PG_READY" = true ] || fail "postgres" "container $DB_CONTAINER not ready after 30s"
echo "OK: postgres ready"

# ---------------------------------------------------------------------------
step "Ensure database content"
db_has() {
    docker exec "$DB_CONTAINER" psql -U postgres -tAc \
        "SELECT CASE WHEN EXISTS($1) THEN 'yes' ELSE 'no' END" 2>/dev/null
}
MIGRATED="$(db_has "SELECT 1 FROM information_schema.tables WHERE table_name='sessions'")"
SEEDED="$(db_has "SELECT 1 FROM emails WHERE email='demo@lightdash.com'")"
DBT_BUILT="$(db_has "SELECT 1 FROM information_schema.tables WHERE table_schema='jaffle' AND table_name='orders'")"
BOOTSTRAPPED=false

if [ "$MIGRATED" = yes ] && [ "$SEEDED" = yes ] && [ "$DBT_BUILT" = yes ]; then
    echo "SKIP: database already migrated, seeded, dbt built"
elif docker volume inspect "$SHARED_BASE_VOLUME" >/dev/null 2>&1; then
    echo "Bootstrapping from shared base snapshot..."
    docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" stop db-dev >/dev/null 2>&1
    docker run --rm \
        -v "${SHARED_BASE_VOLUME}:/source:ro" \
        -v "${LD_VOLUME_PREFIX}_postgres_data:/target" \
        alpine sh -c "rm -rf /target/* && cd /source && tar cf - . | (cd /target && tar xf -)" \
        || fail "bootstrap" "failed to clone shared base volume"
    docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" start db-dev >/dev/null 2>&1
    for _ in $(seq 1 30); do docker exec "$DB_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    BOOTSTRAPPED=true
    echo "OK: bootstrapped from shared base"
else
    echo "No shared base snapshot — running full setup (first instance)..."
    export PATH="$(pwd)/venv/bin:$PATH"
    export DBT_DEMO_DIR="$(pwd)/examples/full-jaffle-shop-demo"
    # shellcheck disable=SC2046
    PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli $(dotenv_args) -- pnpm -F backend migrate \
        || fail "migrate" "backend migrate failed"
    # shellcheck disable=SC2046
    PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli $(dotenv_args) -- pnpm -F backend seed \
        || fail "seed" "backend seed failed"
    PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
        "$(pwd)/venv/bin/dbt" seed --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles \
        || fail "dbt-seed" "dbt seed failed"
    PGHOST=localhost PGPORT=$LD_PG_PORT PGUSER=postgres PGPASSWORD=password PGDATABASE=postgres \
        "$(pwd)/venv/bin/dbt" run --project-dir examples/full-jaffle-shop-demo/dbt --profiles-dir examples/full-jaffle-shop-demo/profiles \
        || fail "dbt-run" "dbt run failed"
    echo "OK: full setup complete"
    if [ "$EE_MODE" != true ] && ! docker volume inspect "$SHARED_BASE_VOLUME" >/dev/null 2>&1; then
        echo "Creating shared base snapshot for future instances..."
        docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" stop db-dev >/dev/null 2>&1
        docker volume create "$SHARED_BASE_VOLUME" >/dev/null
        docker run --rm \
            -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
            -v "${SHARED_BASE_VOLUME}:/snapshot" \
            alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)" \
            || fail "shared-base" "failed to create shared base snapshot"
        docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" start db-dev >/dev/null 2>&1
        for _ in $(seq 1 30); do docker exec "$DB_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    fi
fi

# ---------------------------------------------------------------------------
# The shared base snapshot can lag behind this branch's migrations. knex migrate
# is idempotent (no-op when current), so always reconcile before snapshotting.
# EE mode runs its own core+EE migrate below, so skip the core-only pass here.
if [ "$EE_MODE" != true ]; then
    step "Apply pending migrations"
    export PATH="$(pwd)/venv/bin:$PATH"
    PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate \
        || fail "migrate" "applying pending migrations failed (shared base may be stale)"
    echo "OK: migrations current"
fi

# ---------------------------------------------------------------------------
if [ "$EE_MODE" = true ]; then
    step "EE migration + seed pass"
    export PATH="$(pwd)/venv/bin:$PATH"
    # migrate is idempotent — always reconcile core+EE. A restored EE snapshot has
    # ai_agent_document yet can still lag this branch's HEAD, so never gate on it.
    PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development.local -e .env.development -- pnpm -F backend migrate \
        || fail "ee-migrate" "EE migrate failed"
    if [ "$BOOTSTRAPPED" = true ]; then
        PGHOST=localhost PGPORT=$LD_PG_PORT pnpx dotenv-cli -e .env.development.local -e .env.development -- \
            pnpm -F backend exec knex seed:run --specific=01_embed.ts --knexfile src/knexfile.ts \
            || fail "ee-seed" "EE seed failed"
    fi
    echo "OK: EE migration pass complete"
fi

# ---------------------------------------------------------------------------
step "Ensure instance snapshot"
if docker volume inspect "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null 2>&1; then
    echo "SKIP: snapshot exists"
else
    docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" stop db-dev >/dev/null 2>&1
    docker volume create "${LD_VOLUME_PREFIX}_postgres_data_snapshot" >/dev/null
    docker run --rm \
        -v "${LD_VOLUME_PREFIX}_postgres_data:/source:ro" \
        -v "${LD_VOLUME_PREFIX}_postgres_data_snapshot:/snapshot" \
        alpine sh -c "cd /source && tar cf - . | (cd /snapshot && tar xf -)" \
        || fail "snapshot" "failed to create instance snapshot"
    docker compose -p "$LD_COMPOSE_PROJECT" -f "$INSTANCE_COMPOSE" start db-dev >/dev/null 2>&1
    for _ in $(seq 1 30); do docker exec "$DB_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    echo "OK: snapshot created"
fi

# ---------------------------------------------------------------------------
step "Start PM2"
RUNNING_CWD="$(pm2 jlist 2>/dev/null | INSTANCE="$LD_INSTANCE_ID" python3 -c "
import sys, json, os
inst = os.environ['INSTANCE']
try:
    procs = json.load(sys.stdin)
except Exception:
    procs = []
mine = [p for p in procs if p['name'].startswith(inst + '-')]
if mine:
    cwd = mine[0]['pm2_env'].get('pm_cwd', '')
    root = cwd.rsplit('/packages/', 1)[0] if '/packages/' in cwd else cwd
    print(root)
" 2>/dev/null || true)"
if [ -n "$RUNNING_CWD" ] && [ "$RUNNING_CWD" != "$(pwd)" ]; then
    echo "Instance PM2 was running from $RUNNING_CWD — switching to this worktree"
    # shellcheck disable=SC2046
    pm2 delete $(instance_pm2_names) >/dev/null 2>&1 || true
elif [ "${ENV_PORTS_CHANGED:-0}" = 1 ]; then
    # Ports were reconciled but procs may already be online with the stale env.
    # PM2 caches env at spawn time, so delete+start is required (restart --update-env
    # only inherits the current shell, not the .env file).
    echo "Env ports changed — recycling PM2 so the new env is picked up"
    # shellcheck disable=SC2046
    pm2 delete $(instance_pm2_names) >/dev/null 2>&1 || true
fi
pnpm pm2:start >/dev/null 2>&1 || fail "pm2" "pnpm pm2:start failed (check 'pm2 logs ${LD_INSTANCE_ID}-api')"
echo "OK: pm2 started"

# ---------------------------------------------------------------------------
step "Verify backend health"
HEALTH=""
for _ in $(seq 1 60); do
    HEALTH="$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}/api/v1/health" 2>/dev/null || true)"
    [ "$HEALTH" = "200" ] && break
    sleep 2
done
[ "$HEALTH" = "200" ] || fail "health" "backend /api/v1/health returned '${HEALTH:-no response}' after 120s (check 'pm2 logs ${LD_INSTANCE_ID}-api --lines 80 --nostream')"

echo "OK: backend healthy"
echo "READY: instance=$LD_INSTANCE_ID frontend=http://localhost:${FE_PORT} api=http://localhost:${PORT} spotlight=http://localhost:${SPOTLIGHT_PORT}"
