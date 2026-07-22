#!/usr/bin/env bash
# Reproducible end-to-end test: MetricFlow definitions (legacy + latest spec
# + dbt Cloud CLI manifest shape) → Lightdash metrics via the CLI compile
# pipeline.
#
# Requirements: uv (https://docs.astral.sh/uv/), node, and for the legacy
# project a running postgres (defaults to localhost:5432; override with
# PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE). See README.md for details.
#
# Optional live Cloud CLI verification (compiles in dbt Cloud):
#   DBT_CLOUD_CLI_CONFIG=/path/to/dbt_cloud.yml ./test.sh
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
CLI="$REPO_ROOT/packages/cli/dist/index.js"
FUSION="./.fusion/dbt"
CLOUD_CLI="./.dbt-cloud-cli/dbt"
CLOUD_CLI_VERSION="v0.40.18"
CLOUD_CLI_TARBALL="dbt_0.40.18_linux_amd64.tar.gz"

if [ ! -f "$CLI" ]; then
    echo "Lightdash CLI not built. Run: pnpm -F @lightdash/common build && pnpm -F @lightdash/warehouses build && pnpm -F @lightdash/cli build"
    exit 1
fi

install_cloud_cli() {
    if [ -x "$CLOUD_CLI" ]; then
        return 0
    fi
    echo "— installing dbt Cloud CLI ${CLOUD_CLI_VERSION} into examples/metricflow-demo/.dbt-cloud-cli"
    mkdir -p .dbt-cloud-cli
    local tmp
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/dbt_cloud_cli.tar.gz" \
        "https://github.com/dbt-labs/dbt-cli/releases/download/${CLOUD_CLI_VERSION}/${CLOUD_CLI_TARBALL}"
    tar -xzf "$tmp/dbt_cloud_cli.tar.gz" -C "$tmp" dbt
    mv "$tmp/dbt" "$CLOUD_CLI"
    chmod +x "$CLOUD_CLI"
    rm -rf "$tmp"
    "$CLOUD_CLI" --version
}

echo "═══ 1/3 Legacy spec (dbt-core, top-level semantic_models + metrics) ═══"
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
echo "═══ 2/3 Latest spec (dbt Fusion, inline semantic_model on the model) ═══"
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
echo "═══ 3/3 Cloud CLI shape (fixture: type_params.expr set, nested expr null) ═══"
# Locks in the dbt Cloud CLI latest-spec manifest shape without needing Cloud
# credentials. Live Cloud CLI parse is optional below when DBT_CLOUD_CLI_CONFIG
# is set.
install_cloud_cli
node assert-translation.cjs fixtures/cloud-cli-latest-spec-manifest.json

if [ -n "${DBT_CLOUD_CLI_CONFIG:-}" ]; then
    echo
    echo "═══ Live Cloud CLI (DBT_CLOUD_CLI_CONFIG set) ═══"
    if [ ! -f "$DBT_CLOUD_CLI_CONFIG" ]; then
        echo "DBT_CLOUD_CLI_CONFIG does not point at a readable file: $DBT_CLOUD_CLI_CONFIG"
        exit 1
    fi
    if [ -z "${DBT_CLOUD_PROJECT_ID:-}" ]; then
        echo "DBT_CLOUD_PROJECT_ID is required for live Cloud CLI parse (e.g. 547715)"
        exit 1
    fi
    mkdir -p "$HOME/.dbt"
    cp "$DBT_CLOUD_CLI_CONFIG" "$HOME/.dbt/dbt_cloud.yml"
    chmod 600 "$HOME/.dbt/dbt_cloud.yml"
    pushd latest-spec >/dev/null
    # Inject dbt-cloud.project-id for this run only (not committed).
    if ! grep -q '^dbt-cloud:' dbt_project.yml; then
        printf '\ndbt-cloud:\n  project-id: "%s"\n' "$DBT_CLOUD_PROJECT_ID" >> dbt_project.yml
        trap 'git checkout -- dbt_project.yml 2>/dev/null || sed -i "/^dbt-cloud:/,/project-id:/d" dbt_project.yml' EXIT
    fi
    python3 - <<PY
import yaml
from pathlib import Path
cfg_path = Path.home() / ".dbt" / "dbt_cloud.yml"
cfg = yaml.safe_load(cfg_path.read_text())
cfg["context"]["active-project"] = str("$DBT_CLOUD_PROJECT_ID")
cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False))
PY
    ../.dbt-cloud-cli/dbt environment show 2>&1 | head -40
    ../.dbt-cloud-cli/dbt parse 2>&1 | tee /tmp/metricflow-cloud-cli-parse.log | tail -40
    if [ -f target/manifest.json ]; then
        node ../assert-translation.cjs target/manifest.json
        # Spot-check Cloud CLI expr shape on a simple metric
        python3 - <<'PY'
import json
from pathlib import Path
m = json.loads(Path("target/manifest.json").read_text())
simple = next(
    (v for v in m.get("metrics", {}).values() if v.get("type") == "simple"),
    None,
)
if not simple:
    raise SystemExit("no simple metrics in Cloud CLI manifest")
tp = simple.get("type_params") or {}
agg = tp.get("metric_aggregation_params") or {}
print(
    f"Cloud CLI shape check ({simple.get('name')}): "
    f"type_params.expr={tp.get('expr')!r} "
    f"metric_aggregation_params.expr={agg.get('expr')!r}"
)
PY
    else
        echo "Cloud CLI parse did not write target/manifest.json — see /tmp/metricflow-cloud-cli-parse.log"
        exit 1
    fi
    popd >/dev/null
else
    echo
    echo "(Skipping live Cloud CLI parse — set DBT_CLOUD_CLI_CONFIG and DBT_CLOUD_PROJECT_ID to enable)"
fi

echo
echo "All assertions passed ✔"
