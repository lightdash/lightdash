#!/usr/bin/env bash
# Seed + build the Cartwheel Care eval project into Postgres and deploy it to Lightdash.
# Required env: LIGHTDASH_API_KEY, LIGHTDASH_URL, PGPASSWORD.
# Optional env: PGHOST/PGPORT/PGUSER/PGDATABASE/PGSSLMODE, DBT_BIN, DBT_THREADS, PROJECT_NAME,
#   LIGHTDASH_PROJECT (redeploy into an existing project instead of --create).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

: "${LIGHTDASH_API_KEY:?set LIGHTDASH_API_KEY}"
: "${LIGHTDASH_URL:?set LIGHTDASH_URL}"
: "${PGPASSWORD:?set PGPASSWORD}"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" \
    PGDATABASE="${PGDATABASE:-postgres}" PGSSLMODE="${PGSSLMODE:-disable}"
PROJECT_NAME="${PROJECT_NAME:-AI Eval Cartwheel Care}"

# The Lightdash CLI shells out to `dbt`; the image's default `dbt` is 1.4, too old for `data_tests:`.
if [[ -z "${DBT_BIN:-}" ]]; then
    for candidate in dbt1.12 dbt1.11 dbt1.10 dbt; do
        if command -v "$candidate" >/dev/null 2>&1; then DBT_BIN="$(command -v "$candidate")"; break; fi
    done
fi
[[ -n "${DBT_BIN:-}" ]] || { echo "no dbt binary found" >&2; exit 1; }
shim_dir="$(mktemp -d)"
trap 'rm -rf "$shim_dir"' EXIT
ln -s "$DBT_BIN" "$shim_dir/dbt"
export PATH="$shim_dir:$PATH" DBT_PROFILES_DIR="$PWD"
echo "Using $(dbt --version 2>/dev/null | grep -m1 installed | xargs) from $DBT_BIN"

if ! ls seeds/raw_*.csv >/dev/null 2>&1; then
    echo "Seed CSVs missing; regenerating (needs Python with faker)"
    if command -v uv >/dev/null 2>&1; then uv run --no-project --with faker python generate_seeds.py
    else python3 generate_seeds.py; fi
fi

dbt seed --full-refresh --profiles-dir .
dbt run --profiles-dir .
dbt test --profiles-dir .

if [[ -n "${LIGHTDASH_PROJECT:-}" ]]; then
    lightdash deploy --project "$LIGHTDASH_PROJECT" --profiles-dir . --project-dir . --non-interactive
else
    lightdash deploy --create "$PROJECT_NAME" --profiles-dir . --project-dir . --non-interactive
fi
