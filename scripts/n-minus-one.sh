#!/usr/bin/env bash
set -uo pipefail

usage() {
    cat <<'USAGE'
Run the previous release against a database migrated to this checkout.

Usage: scripts/n-minus-one.sh --previous-ref <tag> [--previous-dir <dir>] [--database <name>]
       scripts/n-minus-one.sh --prepare-only [--database <name>]

--prepare-only migrates and seeds a fresh database with this checkout and stops.

Needs a Postgres server (PGHOST, PGPORT, PGUSER, PGPASSWORD) and an
S3-compatible store (S3_ENDPOINT, S3_BUCKET, S3_REGION, S3_ACCESS_KEY,
S3_SECRET_KEY), dbt1.12 on PATH, and LIGHTDASH_LICENSE_KEY for the model tests.

Steps:
  1. Check out and build the previous release.
  2. Migrate and seed a fresh database with the previous release, then migrate
     it with this checkout, as an upgrade does.
  3. Run the previous release's model integration tests that use the shared
     integration setup (a migrated, seeded database) on that database, except
     N1_SKIPPED_MODEL_TESTS, which fail on their own release schema too.
  4. Start the previous release's backend and scheduler on that database and
     run its E2E API tests: every file of the "parallel" project except
     EXCLUDED_API_TESTS, or only N1_SMOKE_TESTS when it is set. Both run with
     the feature settings of the preview stack (docker-compose.preview.yml).
  5. Fail if the backend or scheduler died, or if their logs show a schema
     error (undefined or ambiguous column, undefined table, not-null
     violation, no ON CONFLICT constraint).
USAGE
}

HEAD_DIR=$(git rev-parse --show-toplevel)
PREVIOUS_REF=""
PREPARE_ONLY=false
PREVIOUS_DIR="${RUNNER_TEMP:-/tmp}/lightdash-previous-release"
DATABASE="lightdash_n1_test"
BACKEND_PORT="${N1_BACKEND_PORT:-8080}"
LOG_DIR="${N1_LOG_DIR:-${RUNNER_TEMP:-/tmp}/lightdash-n1-logs}"
STOP_TIMEOUT_SECONDS="${N1_STOP_TIMEOUT_SECONDS:-30}"
SKIPPED_MODEL_TESTS="${N1_SKIPPED_MODEL_TESTS:-src/ee/models/AiAgentMemoryModel.integration.test.ts}"
SMOKE_TESTS="${N1_SMOKE_TESTS:-}"
EXCLUDED_API_TESTS=(
    "tests/async-query.test.ts|it queries the jaffle tables in database postgres on port 5432, not the database this run seeds"
)
PREVIEW_FEATURE_ENV=(
    GROUPS_ENABLED=true
    MCP_ENABLED=true
    CUSTOM_ROLES_ENABLED=true
    SERVICE_ACCOUNT_ENABLED=true
    EMBEDDING_ENABLED=true
    PERSISTENT_DOWNLOAD_URLS_ENABLED=true
    ALLOW_MULTIPLE_ORGS=true
    EXTENDED_USAGE_ANALYTICS=true
    MICROSOFT_TEAMS_ENABLED=true
    SCHEDULER_ENABLED=true
)
SCHEMA_ERROR_PATTERN='(select|insert into|update|delete from|with) .* - (column "[^"]*" does not exist|column reference "[^"]*" is ambiguous|relation "[^"]*" does not exist|null value in column "[^"]*" .*violates not-null constraint|there is no unique or exclusion constraint matching the ON CONFLICT specification)'

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
if [ "$PREPARE_ONLY" = false ]; then
    case "$DATABASE" in
        *_test) ;;
        *) echo "--database must end in _test: the integration setup appends _test to its connection database" >&2; exit 2 ;;
    esac
fi

: "${PGHOST:?PGHOST is required}"
: "${PGUSER:?PGUSER is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"
export PGPORT="${PGPORT:-5432}"
export LIGHTDASH_SECRET="${LIGHTDASH_SECRET:-n-minus-one-secret}"
export LIGHTDASH_LICENSE_KEY="${LIGHTDASH_LICENSE_KEY:-}"
export SITE_URL="http://localhost:${BACKEND_PORT}"

CONNECTION_BASE="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}"
export PGCONNECTIONURI="${CONNECTION_BASE}/${DATABASE}"
INTEGRATION_CONNECTION_URI="${CONNECTION_BASE}/${DATABASE%_test}"

FAILURES=()
BACKEND_PID=""
SCHEDULER_PID=""

step() { printf '\n==> %s\n' "$*"; }

start_process_group() {
    local log_file="$1"
    shift
    set -m
    "$@" >"$log_file" 2>&1 </dev/null &
    set +m
}

stop_process_group() {
    local pid="$1"
    local name="$2"
    local waited=0
    [ -n "$pid" ] || return 0
    kill -TERM -- "-$pid" 2>/dev/null
    while kill -0 -- "-$pid" 2>/dev/null; do
        if [ "$waited" -ge "$STOP_TIMEOUT_SECONDS" ]; then
            echo "The previous release $name did not stop within ${STOP_TIMEOUT_SECONDS}s. Killing its process group." >&2
            kill -KILL -- "-$pid" 2>/dev/null
            break
        fi
        sleep 1
        waited=$((waited + 1))
    done
    wait "$pid" 2>/dev/null
}

stop_backend() {
    stop_process_group "$BACKEND_PID" backend
    stop_process_group "$SCHEDULER_PID" scheduler
    BACKEND_PID=""
    SCHEDULER_PID=""
}
trap stop_backend EXIT

is_excluded_api_test() {
    local entry
    for entry in "${EXCLUDED_API_TESTS[@]}"; do
        if [ "${entry%%|*}" = "$1" ]; then
            echo "Skipping $1: ${entry#*|}."
            return 0
        fi
    done
    return 1
}

free_port() {
    node -e 'const server = require("net").createServer(); server.listen(0, () => { console.log(server.address().port); server.close(); });'
}

check_backend_alive() {
    local failed=0
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "The previous release backend died during the tests." >&2
        failed=1
    fi
    if ! kill -0 "$SCHEDULER_PID" 2>/dev/null; then
        echo "The previous release scheduler died during the tests." >&2
        failed=1
    fi
    return "$failed"
}

scan_backend_logs() {
    local matches
    matches=$(grep -hE "$SCHEMA_ERROR_PATTERN" "$LOG_DIR/backend.log" "$LOG_DIR/scheduler.log" 2>/dev/null)
    if [ -n "$matches" ]; then
        echo "The previous release logged schema errors:" >&2
        printf '%s\n' "$matches" | head -n 50 >&2
        return 1
    fi
}

print_backend_logs() {
    local log_file
    for log_file in "$LOG_DIR/backend.log" "$LOG_DIR/scheduler.log"; do
        if [ -f "$log_file" ]; then
            printf '\n==> Last 200 lines of %s\n' "$log_file"
            tail -n 200 "$log_file"
        fi
    done
}

admin_sql() {
    PGDATABASE=postgres psql -v ON_ERROR_STOP=1 -qc "$1"
}

run_dbt() {
    local project_root="$1"
    shift
    (cd "$project_root" && PGDATABASE="$DATABASE" dbt1.12 "$@" \
        --project-dir examples/full-jaffle-shop-demo/dbt \
        --profiles-dir examples/full-jaffle-shop-demo/profiles)
}

seed_with() {
    local project_root="$1"
    run_dbt "$project_root" deps &&
        run_dbt "$project_root" seed --full-refresh &&
        run_dbt "$project_root" run --full-refresh --exclude fanouts_sales_targets &&
        (cd "$project_root" &&
            DBT_DEMO_DIR="$project_root/examples/full-jaffle-shop-demo" \
            PGDATABASE="$DATABASE" pnpm -F backend seed)
}

create_database() {
    admin_sql "DROP DATABASE IF EXISTS $DATABASE WITH (FORCE)" &&
        admin_sql "CREATE DATABASE $DATABASE"
}

prepare_head_database() {
    step "Migrate and seed $DATABASE with $(git -C "$HEAD_DIR" rev-parse --short HEAD)"
    create_database &&
        (cd "$HEAD_DIR" && pnpm -F backend migrate) &&
        seed_with "$HEAD_DIR"
}

prepare_upgraded_database() {
    step "Migrate and seed $DATABASE with $PREVIOUS_REF"
    create_database &&
        (cd "$PREVIOUS_DIR" && pnpm -F backend migrate) &&
        seed_with "$PREVIOUS_DIR" || return 1
    step "Upgrade $DATABASE to $(git -C "$HEAD_DIR" rev-parse --short HEAD)"
    (cd "$HEAD_DIR" && pnpm -F backend migrate)
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
            -exec grep -lE 'getTestContext|setupIntegrationTest' {} + | sort)
    if [ ${#tests[@]} -eq 0 ]; then
        echo "No model integration tests were found in the previous release. The test layout or setup helpers changed." >&2
        return 1
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
    mkdir -p "$LOG_DIR"
    echo "Backend and scheduler logs: $LOG_DIR"
    start_process_group "$LOG_DIR/backend.log" \
        env "${PREVIEW_FEATURE_ENV[@]}" \
        bash -c 'cd "$1/packages/backend" && PORT="$2" LIGHTDASH_LOG_LEVEL=warn exec node dist/index.js' \
        backend "$PREVIOUS_DIR" "$BACKEND_PORT"
    BACKEND_PID=$!
    local scheduler_port
    scheduler_port=$(free_port) || return 1
    start_process_group "$LOG_DIR/scheduler.log" \
        env "${PREVIEW_FEATURE_ENV[@]}" \
        bash -c 'cd "$1/packages/backend" && PORT="$2" LIGHTDASH_LOG_LEVEL=warn exec env -u CI node dist/scheduler.js' \
        scheduler "$PREVIOUS_DIR" "$scheduler_port"
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
    step "Previous release E2E API tests"
    local arguments=()
    local test
    if [ -n "$SMOKE_TESTS" ]; then
        for test in $SMOKE_TESTS; do
            if [ -f "$PREVIOUS_DIR/packages/api-tests/$test" ]; then
                arguments+=("$test")
            else
                echo "Skipping $test: the previous release does not have it."
            fi
        done
        if [ ${#arguments[@]} -eq 0 ]; then
            echo "None of N1_SMOKE_TESTS exist in the previous release." >&2
            return 1
        fi
    else
        local listed
        listed=$(cd "$PREVIOUS_DIR/packages/api-tests" &&
            pnpm exec vitest list --config vitest.config.ts --project parallel --filesOnly) || {
            echo "Could not list the previous release's API tests." >&2
            return 1
        }
        while IFS= read -r test; do
            if is_excluded_api_test "$test"; then
                continue
            fi
            arguments+=("$test")
        done < <(printf '%s\n' "$listed" |
            sed -n 's|^\[parallel\] ||p' |
            sed "s|^$PREVIOUS_DIR/packages/api-tests/||")
        if [ ${#arguments[@]} -eq 0 ]; then
            echo "No API tests were found in the previous release's parallel project." >&2
            return 1
        fi
        arguments=(--project parallel "${arguments[@]}")
    fi
    (cd "$PREVIOUS_DIR/packages/api-tests" &&
        PGDATABASE="$DATABASE" \
        DBT_PROJECT_DIR="$PREVIOUS_DIR/examples/full-jaffle-shop-demo/dbt" \
        pnpm exec vitest run --config vitest.config.ts "${arguments[@]}")
}

if [ "$PREPARE_ONLY" = true ]; then
    prepare_head_database || { echo "Could not migrate and seed the database with this checkout." >&2; exit 1; }
    printf '\n%s is migrated and seeded.\n' "$DATABASE"
    exit 0
fi

prepare_previous_release || { echo "Could not build the previous release $PREVIOUS_REF." >&2; exit 1; }
prepare_upgraded_database || { echo "Could not upgrade a $PREVIOUS_REF database to this checkout." >&2; exit 1; }

run_previous_model_tests || FAILURES+=("previous release model integration tests")
if start_previous_backend; then
    run_previous_smoke_tests || FAILURES+=("previous release E2E API tests")
    check_backend_alive || FAILURES+=("previous release backend or scheduler died")
else
    FAILURES+=("previous release backend start")
fi

stop_backend
scan_backend_logs || FAILURES+=("previous release schema errors in the backend or scheduler logs")

if [ ${#FAILURES[@]} -gt 0 ]; then
    print_backend_logs
    printf '\nThe previous release %s fails against this schema:\n' "$PREVIOUS_REF" >&2
    printf '  - %s\n' "${FAILURES[@]}" >&2
    exit 1
fi
printf '\nThe previous release %s passes against this schema.\n' "$PREVIOUS_REF"
