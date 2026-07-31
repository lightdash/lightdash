# MetricFlow → Lightdash dbt Cloud demo

BigQuery-compatible copy of `../legacy-spec` (same semantic model + metrics,
legacy MetricFlow spec) used to exercise the **dbt Cloud** integration: a dbt
Cloud project points at this subdirectory, runs `dbt build`, and Lightdash pulls
the semantic layer definitions through the dbt Cloud Discovery API (GraphQL)
instead of a local manifest.

Differences from `legacy-spec/`:

- seed `column_types` use BigQuery types (`int64`, `string`, `numeric`)
- `metricflow_time_spine.sql` uses `cast(... as date)` instead of the
  Postgres-only `::date` cast

The `models/schema.yml` (semantic model + metric definitions) is a copy of
`../legacy-spec/models/schema.yml` plus a `status_upper` dimension with
`expr`/`label`/`config.meta`, added to demonstrate Discovery API field
coverage — see `discovery-api-gaps.md` for a reproducible write-up of the
manifest fields the Discovery API does not expose (shareable with dbt
support).

## dbt Cloud setup (account "Lightdash (Partner)", id 20983)

- Project **MetricFlow Cloud demo** (563664), subdirectory
  `examples/metricflow-demo/cloud`, BigQuery connection
  `lightdash-database-staging`, dataset `metricflow_cloud_demo`
- Production environment **469722** (release track `latest`), job
  "Build MetricFlow demo" (1097865) runs `dbt build`
- After a successful run, the Discovery API definition state
  (`environment(id:).definition.semanticModels/metrics`) returns 1 semantic
  model and 15 metrics for the environment

## Translation result via the Discovery API

`DbtMetadataApiClient` maps the definition state into manifest-shaped
`semantic_models` + `metrics`, and the shared translator produces **13
Lightdash metrics, 2 skipped**:

- `cumulative_revenue` — cumulative metrics are unsupported (same as CLI)
- `p95_order_value` — the Discovery API does not expose measure
  `agg_params.percentile`, so percentile metrics are skipped server-side
  (the CLI translates them from a local manifest)

Other Discovery API gaps vs a local manifest: measure/dimension `config.meta`
(e.g. a measure-level `hidden:`) and dimension `expr` are not exposed —
dimension filter references resolve against the dimension name.
