# MetricFlow → Lightdash example

Two complete dbt projects showing how to bring your dbt **MetricFlow** metrics
into Lightdash using the Lightdash CLI (`compile` / `deploy`) — **no dbt Cloud
required**. If you already define metrics with MetricFlow in your dbt project,
Lightdash can read them straight from the dbt manifest and turn them into
Lightdash metrics.

Both projects define the *same* metrics over the same tiny orders dataset, one
in each of the two MetricFlow YAML specs:

| Project | Metrics spec | dbt engine | Warehouse |
|---|---|---|---|
| `legacy-spec/` | Legacy: top-level `semantic_models:` + `metrics:` with `type_params` ([docs](https://docs.getdbt.com/docs/build/sl-getting-started)) | dbt Core ≥ 1.6 (python) | Postgres |
| `latest-spec/` | Latest: inline `semantic_model:` on the model, metrics with top-level `agg`/`expr` ([docs](https://docs.getdbt.com/docs/build/latest-metrics-spec)) | dbt Fusion 2.0 (≥ preview.199) | DuckDB (local file, zero infra) |

Both author layers compile to the same manifest sections (`semantic_models` +
`metrics`), which is what Lightdash reads — so whichever spec your project uses,
the result in Lightdash is identical. One thing worth knowing: Fusion writes
simple metrics with `type_params.measure: null` and the aggregation inlined as
`type_params.metric_aggregation_params`, while dbt Core writes the older shape.
Lightdash handles both.

## Quick start

```bash
# from the repo root: build the CLI once
pnpm -F @lightdash/common build && pnpm -F @lightdash/warehouses build && pnpm -F @lightdash/cli build

# run both projects end-to-end
./examples/metricflow-demo/test.sh
```

`test.sh` seeds/runs/parses each dbt project, runs `lightdash compile` on the
manifest, and verifies which metrics translate — names, metric types, SQL,
percentile value — and that unsupported ones are skipped **with warnings**. It's
a convenience for trying the example out; the two dbt projects below are the part
worth studying for your own setup.

## Environment setup

### legacy-spec — python / dbt Core

Requires [uv](https://docs.astral.sh/uv/) and a Postgres to build against.
The profile defaults to a local Postgres on `localhost:5432`; override any of
`PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` to point at your own.

```bash
cd legacy-spec
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python 'dbt-core>=1.9,<2.0' dbt-postgres
.venv/bin/dbt seed --profiles-dir profiles
.venv/bin/dbt run --profiles-dir profiles
.venv/bin/dbt parse --profiles-dir profiles   # writes target/manifest.json
```

Any dbt Core ≥ 1.6 emits the semantic layer into the manifest (v10+). dbt
Core ≥ 1.9 needs Python ≥ 3.9; 3.12 is a safe choice.

### latest-spec — dbt Fusion

The latest metrics spec needs the Fusion engine ≥ 2.0.0-preview.199 (or dbt
platform / dbt Core 1.12+ when released — Core is at 1.11.x today, which only
parses the legacy spec). Install Fusion locally to this example (avoids
touching your global dbt and your shell rc):

```bash
curl -fsSL https://public.cdn.getdbt.com/fs/install/install.sh \
    | sh -s -- --to "$(pwd)/.fusion"
# note: the installer appends PATH/alias lines to ~/.zshrc even with --to;
# remove them if you don't want that.

cd latest-spec && mkdir -p warehouse
../.fusion/dbt seed --profiles-dir profiles
../.fusion/dbt run --profiles-dir profiles
../.fusion/dbt parse --profiles-dir profiles
```

Why DuckDB here: Fusion's postgres adapter is experimental
(`DBT_ALLOW_EXPERIMENTAL_ADAPTERS=true`) and currently **segfaults on
execution** (parse works). DuckDB is officially supported by Fusion and by
Lightdash, and keeps this example fully self-contained.

### Lightdash compile / deploy

```bash
# compile only (no Lightdash server needed) — good for checking the translation
node ../../packages/cli/dist/index.js compile \
    --project-dir . --profiles-dir profiles --skip-dbt-compile --verbose

# deploy legacy-spec into Lightdash as a new project
LIGHTDASH_URL=<your Lightdash URL> LIGHTDASH_API_KEY=<your PAT> \
node ../../packages/cli/dist/index.js deploy --create "MetricFlow demo (legacy)" \
    --project-dir . --profiles-dir profiles --skip-dbt-compile
```

If you've installed the published CLI (`npm install -g @lightdash/cli`), use
`lightdash compile` / `lightdash deploy` in place of the `node ...` invocations
above.

`--skip-dbt-compile` makes the CLI read the manifest your chosen dbt engine
already wrote (so the CLI doesn't need dbt on PATH). For `latest-spec` add
`--no-warehouse-credentials`: the CLI's duckdb profile support only covers
MotherDuck/DuckLake targets, so a local-file duckdb can't provide credentials —
compile works, `deploy` does not (deploy the legacy project if you want to
explore the result in the Lightdash UI).

## What translates (and what doesn't)

Both specs produce the identical result: **14 translated, 1 skipped (with
a warning)**.

### Supported → Lightdash metrics

| MetricFlow | Lightdash metric type |
|---|---|
| `simple` metric / measure `agg: sum` | `sum` |
| `agg: count` | `count` |
| `agg: count_distinct` | `count_distinct` |
| `agg: average` | `average` |
| `agg: median` | `median` |
| `agg: min` / `agg: max` | `min` / `max` |
| `agg: percentile` | `percentile` (legacy 0–1 fractions and latest 0–100 values both normalized to Lightdash's 0–100) |
| `agg: sum_boolean` | `sum` over `CASE WHEN bool THEN 1 ELSE 0 END` |
| metric or measure `filter:` (same-model `Dimension()` refs) | filter compiled into the metric SQL as `CASE WHEN <condition> THEN <expr> END` |
| `ratio` metrics (inputs on the same model) | `number` metric: `(${numerator} * 1.0) / NULLIF(${denominator}, 0)`; filtered inputs compile to hidden helper metrics |
| `derived` metrics (inputs on the same model, no offsets) | `number` metric with the expression rewritten over `${metric}` references (aliases supported) |
| measure `create_metric: true` (no explicit metric) | translated like a simple metric |
| measure `expr` (bare column or SQL expression) | metric `sql` (bare columns qualified as `${TABLE}.col`) |
| metric/measure `label` + `description` | carried over (metric-level wins) |
| metric/measure `config.meta.hidden` + `config.meta.group_label` | carried over to the Lightdash metric's `hidden` / `group_label` (metric-level wins); unknown meta keys (e.g. a third-party `hex:` block) are ignored |

YAML-defined `meta.metrics` win over translated MetricFlow metrics on name
collision — so you can always override a translated metric by hand.

Notes on filters, ratio, and derived metrics:

- **Filters** translate when every `{{ Dimension('entity__dim') }}` reference
  resolves on the metric's own semantic model. Cross-model references and
  other template functions (`TimeDimension()`, `Entity()`, `Metric()`) skip
  the metric with a warning.
- **Ratio/derived inputs** must all resolve to metrics on the same dbt model.
  In MetricFlow, inputs may come from any semantic model because each input is
  aggregated in its own subquery; Lightdash compiles a single query per
  explore, so cross-model inputs are skipped with a warning (join the models
  in a Lightdash explore and author a `number` metric if you need one today).
- **Filtered inputs** (e.g. a ratio whose numerator has a `filter:`) compile
  the filter into a hidden helper metric (`<metric>_numerator`, …) which the
  visible metric references.
- **Time-offset inputs** (`offset_window` / `offset_to_grain` on a derived
  metric input) are skipped with a warning.

### Not currently supported (skipped, warning on deploy; details under `--verbose`)

| MetricFlow feature | Why |
|---|---|
| `cumulative` metrics | needs time-spine semantics Lightdash doesn't have |
| `conversion` metrics | needs entity-journey semantics |
| cross-model `ratio` / `derived` inputs, `offset_window` / `offset_to_grain` | see notes above |
| cross-model or non-`Dimension()` `filter:` templates | see notes above |
| **entities / join resolution** | MetricFlow joins semantic models implicitly at query time through shared entity keys (`order`, `customer`). Lightdash joins are explicit, authored per-explore (`meta.joins`). Entities are ignored — each semantic model's metrics land only on its own dbt model, and cross-model dimension access does not happen. |
| dimensions (`categorical` / `time`) | ignored — Lightdash derives dimensions from the model's real columns, so you keep all columns as dimensions anyway (dimension `expr` is used when resolving filter references) |
| `agg_time_dimension` | ignored — Lightdash metrics aggregate over whatever dimension you group by |
| `join_to_timespine`, `fill_nulls_with`, `non_additive_dimension`, `percentile_type: discrete` | no equivalents (percentiles always compile to `PERCENTILE_CONT`) |
| saved queries / exports | out of scope |

For unsupported metrics, define the equivalent as a Lightdash metric in your
model's `meta` (the columns and dimensions are already there) — the two layers
coexist.

## Layout

```
metricflow-demo/
├── README.md                  ← you are here
├── test.sh                    ← runs both specs end-to-end
├── assert-translation.cjs     ← checks manifest → Lightdash metric translation
├── legacy-spec/
│   ├── dbt_project.yml
│   ├── profiles/profiles.yml  ← postgres
│   ├── seeds/raw_orders.csv
│   └── models/
│       ├── orders.sql
│       ├── metricflow_time_spine.sql
│       └── schema.yml         ← semantic_models: + metrics: (legacy spec)
└── latest-spec/
    ├── dbt_project.yml
    ├── profiles/profiles.yml  ← duckdb (Fusion's postgres adapter can't execute)
    ├── seeds/raw_orders.csv
    └── models/
        ├── orders.sql
        ├── metricflow_time_spine.sql
        ├── time_spine.yml
        └── orders.yml         ← inline semantic_model + metrics (latest spec)
```
