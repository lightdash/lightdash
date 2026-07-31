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

The `models/schema.yml` (semantic model + metric definitions) is a verbatim
copy of `../legacy-spec/models/schema.yml`.
