#!/usr/bin/env bash
# MetricFlow → Lightdash translation checks.
#
# latest-spec must be verified with both Fusion and Core 1.12 — they write
# different manifest shapes for the same YAML (see README).
#
# Requires: uv, node; legacy-spec also needs Postgres
# (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE, default localhost:5432).
#
# Optional Cloud CLI (runs in Cloud against the Dev env's release track):
#   DBT_CLOUD_CLI_CONFIG=/path/to/dbt_cloud.yml \
#   DBT_CLOUD_PROJECT_ID=<id> ./test.sh
set -euo pipefail
cd "$(dirname "$0")"
REPO_ROOT="$(cd ../.. && pwd)"
CLI="$REPO_ROOT/packages/cli/dist/index.js"
FUSION="./.fusion/dbt"
CLOUD_CLI="./.dbt-cloud-cli/dbt"
CLOUD_CLI_VERSION="v0.40.18"
CLOUD_CLI_TARBALL="dbt_0.40.18_linux_amd64.tar.gz"
CORE112_VENV="./.venv-core112"

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

# Core 1.12 latest-spec: type_params.expr set, metric_aggregation_params.expr absent.
assert_core112_expr_shape() {
    local manifest_path="$1"
    python3 - "$manifest_path" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
shaped = 0
for metric in (m.get("metrics") or {}).values():
    if metric.get("type") != "simple":
        continue
    tp = metric.get("type_params") or {}
    agg = tp.get("metric_aggregation_params")
    if isinstance(agg, dict) and tp.get("expr") and agg.get("expr") is None:
        shaped += 1
if shaped < 5:
    raise SystemExit(
        f"{sys.argv[1]}: expected Core 1.12 shape "
        f"(type_params.expr set, nested expr absent) on >=5 simple metrics, got {shaped}"
    )
print(f"  ✓ Core 1.12 expr shape ({shaped} simple metrics)")
PY
}

echo "═══ 1/3 Legacy spec (dbt-core 1.9) ═══"
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
echo "═══ 2/3 Latest spec (Fusion — nested expr populated) ═══"
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
echo "═══ 3/3 Latest spec (Core 1.12 — nested expr absent) ═══"
if [ ! -x "$CORE112_VENV/bin/dbt" ]; then
    echo "— creating python venv with dbt-core 1.12 + dbt-duckdb"
    uv venv "$CORE112_VENV" --python 3.12 -q
    uv pip install -q --python "$CORE112_VENV/bin/python" 'dbt-core==1.12.0' dbt-duckdb
fi
pushd latest-spec >/dev/null
mkdir -p warehouse
rm -rf target
../.venv-core112/bin/dbt parse --profiles-dir profiles -q
assert_core112_expr_shape target/manifest.json
node "$CLI" compile --project-dir . --profiles-dir profiles --skip-dbt-compile --no-warehouse-credentials 2>&1 \
    | grep -E "Translated|Compiled" || true
node ../assert-translation.cjs target/manifest.json
popd >/dev/null

echo
echo "═══ Fixture (checked-in Core 1.12 manifest) ═══"
assert_core112_expr_shape fixtures/core112-latest-spec-manifest.json
node assert-translation.cjs fixtures/core112-latest-spec-manifest.json

if [ -n "${DBT_CLOUD_CLI_CONFIG:-}" ]; then
    echo
    echo "═══ Live Cloud CLI ═══"
    install_cloud_cli
    if [ ! -f "$DBT_CLOUD_CLI_CONFIG" ]; then
        echo "DBT_CLOUD_CLI_CONFIG does not point at a readable file: $DBT_CLOUD_CLI_CONFIG"
        exit 1
    fi
    if [ -z "${DBT_CLOUD_PROJECT_ID:-}" ]; then
        echo "DBT_CLOUD_PROJECT_ID is required for live Cloud CLI parse"
        exit 1
    fi
    mkdir -p "$HOME/.dbt"
    cp "$DBT_CLOUD_CLI_CONFIG" "$HOME/.dbt/dbt_cloud.yml"
    chmod 600 "$HOME/.dbt/dbt_cloud.yml"
    pushd latest-spec >/dev/null
    if ! grep -q '^dbt-cloud:' dbt_project.yml; then
        printf '\ndbt-cloud:\n  project-id: "%s"\n' "$DBT_CLOUD_PROJECT_ID" >> dbt_project.yml
        trap 'git checkout -- dbt_project.yml 2>/dev/null || true' EXIT
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
    f"shape ({simple.get('name')}): "
    f"dbt_version={m.get('metadata', {}).get('dbt_version')!r} "
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
    echo "(Skipping live Cloud CLI — set DBT_CLOUD_CLI_CONFIG and DBT_CLOUD_PROJECT_ID to enable)"
fi

echo
echo "All assertions passed ✔"
