#!/usr/bin/env bash
# Reproducible end-to-end test: MetricFlow definitions (legacy + latest spec)
# → dbt manifest → Lightdash metrics via the CLI compile pipeline.
#
# Requirements: uv (https://docs.astral.sh/uv/), node, and for the legacy
# project a running postgres (defaults to localhost:5432; override with
# PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). See README.md for details.
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
CLI="$REPO_ROOT/packages/cli/dist/index.js"
FUSION="./.fusion/dbt"

if [ ! -f "$CLI" ]; then
    echo "Lightdash CLI not built. Run: pnpm -F @lightdash/common build && pnpm -F @lightdash/warehouses build && pnpm -F @lightdash/cli build"
    exit 1
fi

echo "═══ 1/2 Legacy spec (dbt-core, top-level semantic_models + metrics) ═══"
pushd legacy-spec >/dev/null
if [ ! -x .venv/bin/dbt ]; then
    echo "— creating python venv with dbt-core"
    uv venv .venv --python 3.12 -q
    uv pip install -q --python .venv/bin/python 'dbt-core>=1.9,<2.0' dbt-postgres
fi
.venv/bin/dbt seed --profiles-dir profiles -q
.venv/bin/dbt run --profiles-dir profiles -q
.venv/bin/dbt parse --profiles-dir profiles -q
node "$CLI" compile --project-dir . --profiles-dir profiles --skip-dbt-compile 2>&1 \
    | grep -E "Translated|Compiled" || true
node ../assert-translation.cjs target/manifest.json
popd >/dev/null

echo
echo "═══ 2/2 Latest spec (dbt Fusion, inline semantic_model on the model) ═══"
pushd latest-spec >/dev/null
if [ ! -x "../.fusion/dbt" ]; then
    echo "— installing dbt Fusion into examples/metricflow-demo/.fusion"
    curl -fsSL https://public.cdn.getdbt.com/fs/install/install.sh \
        | sh -s -- --to "$(cd .. && pwd)/.fusion"
fi
mkdir -p warehouse
../.fusion/dbt seed --profiles-dir profiles >/dev/null 2>&1
../.fusion/dbt run --profiles-dir profiles >/dev/null 2>&1
../.fusion/dbt parse --profiles-dir profiles >/dev/null 2>&1
node "$CLI" compile --project-dir . --profiles-dir profiles --skip-dbt-compile --no-warehouse-credentials 2>&1 \
    | grep -E "Translated|Compiled" || true
node ../assert-translation.cjs target/manifest.json
popd >/dev/null

echo
echo "All assertions passed for both specs ✔"
