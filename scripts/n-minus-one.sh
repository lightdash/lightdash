#!/usr/bin/env bash
set -uo pipefail

usage() {
    cat <<'USAGE'
Run the previous release against a database migrated to this checkout.

Usage: scripts/n-minus-one.sh --previous-ref <tag> [--previous-dir <dir>] [--database <name>]
       scripts/n-minus-one.sh --prepare-only [--database <name>]

Needs a Postgres server (PGHOST, PGPORT, PGUSER, PGPASSWORD) and an
S3-compatible store (S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY,
S3_SECRET_KEY), dbt1.12 on PATH, and LIGHTDASH_LICENSE_KEY for the model tests.

Steps (--prepare-only stops after step 1):
  1. Migrate and seed a fresh database with this checkout.
  2. Check out and build the previous release.
  3. Run the previous release's model integration tests that use the shared
     integration setup (a migrated, seeded database) on that database, except
     N1_SKIPPED_MODEL_TESTS, which fail on their own release schema too.
  4. Start the previous release's backend and scheduler on that database and
     run its E2E API smoke tests (N1_SMOKE_TESTS).
USAGE
}

HEAD_DIR=$(git rev-parse --show-toplevel)
PREVIOUS_REF=""
PREPARE_ONLY=false
PREVIOUS_DIR="${RUNNER_TEMP:-/tmp}/lightdash-previous-release"
DATABASE="lightdash_n1_test"
BACKEND_PORT="${N1_BACKEND_PORT:-8080}"
SKIPPED_MODEL_TESTS="${N1_SKIPPED_MODEL_TESTS:-src/ee/models/AiAgentMemoryModel.integration.test.ts}"
SMOKE_TESTS="${N1_SMOKE_TESTS:-tests/api.test.ts tests/async-query.test.ts tests/savedChart.test.ts tests/sqlRunner.test.ts tests/createPreviewWithManifest.test.ts tests/previewContentCopy.test.ts}"

while [ $# -gt 0 ]; do
    case "$1" in
        --previous-ref) PREVIOUS_REF="$2"; shift 2 ;;
        --previous-dir) PREVIOUS_DIR="$2"; shift 2 ;;
        --database) DATABASE="$2"; shift 2 ;;
        --prepare-only) PREPARE_ONLY=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
    esac
done

if [ -z "$PREVIOUS_REF" ] && [ "$PREPARE_ONLY" = false ]; then
    usage >&2
    exit 2
fi
case "$DATABASE" in
    *_test) ;;
    *) echo "--database must end in _test: the integration setup appends _test to its connection database" >&2; exit 2 ;;
esac

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGPORT="${PGPORT:-5432}"
export LIGHTDASH_SECRET="${LIGHTDASH_SECRET:-n-minus-one-secret}"
export LIGHTDASH_LICENSE_KEY="${LIGHTDASH_LICENSE_KEY:-}"
export SITE_URL="http://localhost:${BACKEND_PORT}"
export DBT_DEMO_DIR="$HEAD_DIR/examples/full-jaffle-shop-demo"

CONNECTION_BASE="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}"
export PGCONNECTIONURI="${CONNECTION_BASE}/${DATABASE}"
INTEGRATION_CONNECTION_URI="${CONNECTION_BASE}/${DATABASE%_test}"

FAILURES=()
BACKEND_PID=""
SCHEDULER_PID=""

step() { printf '\n==> %s\n' "$*"; }

stop_backend() {
    local pid
    for pid in "$BACKEND_PID" "$SCHEDULER_PID"; do
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            wait "$pid" 2>/dev/null
        fi
    done
}
trap stop_backend EXIT

admin_sql() {
    PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -qc "$1"
}

prepare_head_database() {
    step "Migrate and seed $DATABASE with $(git -C "$HEAD_DIR" rev-parse --short HEAD)"
    admin_sql "DROP DATABASE IF EXISTS $DATABASE WITH (FORCE)" &&
        admin_sql "CREATE DATABASE $DATABASE" &&
        (cd "$HEAD_DIR" && pnpm -F backend migrate) &&
        (cd "$HEAD_DIR" && PGDATABASE="$DATABASE" dbt1.12 deps \
            --project-dir examples/full-jaffle-shop-demo/dbt \
            --profiles-dir examples/full-jaffle-shop-demo/profiles) &&
        (cd "$HEAD_DIR" && PGDATABASE="$DATABASE" dbt1.12 seed --full-refresh \
            --project-dir examples/full-jaffle-shop-demo/dbt \
            --profiles-dir examples/full-jaffle-shop-demo/profiles) &&
        (cd "$HEAD_DIR" && PGDATABASE="$DATABASE" dbt1.12 run --full-refresh \
            --exclude fanouts_sales_targets \
            --project-dir examples/full-jaffle-shop-demo/dbt \
            --profiles-dir examples/full-jaffle-shop-demo/profiles) &&
        (cd "$HEAD_DIR" && PGDATABASE="$DATABASE" pnpm -F backend seed)
}

prepare_previous_release() {
    step "Build the previous release $PREVIOUS_REF in $PREVIOUS_DIR"
    if [ ! -d "$PREVIOUS_DIR/.git" ] && [ ! -f "$PREVIOUS_DIR/.git" ]; then
        git -C "$HEAD_DIR" worktree add --detach "$PREVIOUS_DIR" "$PREVIOUS_REF" || return 1
    fi
    (cd "$PREVIOUS_DIR" && git checkout -q --detach "$PREVIOUS_REF") &&
        (cd "$PREVIOUS_DIR" && pnpm install --frozen-lockfile --prefer-offline) &&
        (cd "$PREVIOUS_DIR" && pnpm exec turbo run build --filter=backend)
}

run_previous_model_tests() {
    step "Previous release model integration tests"
    local tests=()
    local test
    while IFS= read -r test; do
        case " $SKIPPED_MODEL_TESTS " in
            *" $test "*) echo "Skipping $test: it fails on its own release schema too." ;;
            *) tests+=("$test") ;;
        esac
    done < <(cd "$PREVIOUS_DIR/packages/backend" &&
        find src/models src/ee/models -name '*.integration.test.ts' \
            -exec grep -lE 'getTestContext|setupIntegrationTest' {} + 2>/dev/null | sort)
    if [ ${#tests[@]} -eq 0 ]; then
        echo "The previous release has no model integration tests."
        return 0
    fi
    if [ -z "$LIGHTDASH_LICENSE_KEY" ]; then
        echo "LIGHTDASH_LICENSE_KEY is required for the model integration tests." >&2
        return 1
    fi
    (cd "$PREVIOUS_DIR/packages/backend" &&
        PGCONNECTIONURI="$INTEGRATION_CONNECTION_URI" \
        SKIP_TEST_MIGRATIONS=true SKIP_TEST_SEEDS=true \
        pnpm exec vitest run --config vitest.config.integration.ts --retry=1 "${tests[@]}")
}

start_previous_backend() {
    step "Start the previous release backend on port $BACKEND_PORT, and its scheduler"
    if curl -sf "$SITE_URL/api/v1/health" >/dev/null; then
        echo "Port $BACKEND_PORT already serves Lightdash. Stop that server or set N1_BACKEND_PORT." >&2
        return 1
    fi
    (cd "$PREVIOUS_DIR/packages/backend" &&
        PORT="$BACKEND_PORT" LIGHTDASH_LOG_LEVEL=warn exec node dist/index.js) &
    BACKEND_PID=$!
    (cd "$PREVIOUS_DIR/packages/backend" &&
        LIGHTDASH_LOG_LEVEL=warn exec node dist/scheduler.js) &
    SCHEDULER_PID=$!
    for _ in $(seq 1 120); do
        if curl -sf "$SITE_URL/api/v1/health" >/dev/null; then
            return 0
        fi
        if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
            echo "The previous release backend exited before it became healthy." >&2
            return 1
        fi
        sleep 1
    done
    echo "The previous release backend did not become healthy." >&2
    return 1
}

run_previous_smoke_tests() {
    step "Previous release E2E API smoke tests"
    local tests=()
    for test in $SMOKE_TESTS; do
        if [ -f "$PREVIOUS_DIR/packages/api-tests/$test" ]; then
            tests+=("$test")
        else
            echo "Skipping $test: the previous release does not have it."
        fi
    done
    if [ ${#tests[@]} -eq 0 ]; then
        echo "No smoke tests exist in the previous release." >&2
        return 1
    fi
    (cd "$PREVIOUS_DIR/packages/api-tests" &&
        PGDATABASE="$DATABASE" DBT_PROJECT_DIR="$DBT_DEMO_DIR/dbt" \
        pnpm exec vitest run --config vitest.config.ts "${tests[@]}")
}

prepare_head_database || { echo "Could not migrate and seed the database with this checkout." >&2; exit 1; }
if [ "$PREPARE_ONLY" = true ]; then
    printf '\n%s is migrated and seeded.\n' "$DATABASE"
    exit 0
fi
prepare_previous_release || { echo "Could not build the previous release $PREVIOUS_REF." >&2; exit 1; }

run_previous_model_tests || FAILURES+=("previous release model integration tests")
if start_previous_backend; then
    run_previous_smoke_tests || FAILURES+=("previous release E2E API smoke tests")
else
    FAILURES+=("previous release backend start")
fi

if [ ${#FAILURES[@]} -gt 0 ]; then
    printf '\nThe previous release %s fails against this schema:\n' "$PREVIOUS_REF" >&2
    printf '  - %s\n' "${FAILURES[@]}" >&2
    exit 1
fi
printf '\nThe previous release %s passes against this schema.\n' "$PREVIOUS_REF"
