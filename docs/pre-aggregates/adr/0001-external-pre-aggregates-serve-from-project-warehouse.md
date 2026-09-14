# External pre-aggregates serve from the project warehouse via the exact generated-column contract

Customers at large scale (30–60TB scans) want to manage pre-aggregate lifecycle
themselves (e.g. BigQuery materialized views with incremental refresh) and use
Lightdash only for matching and serving. We decided an external pre-aggregate
declares a `table` — a validated qualified SQL identifier — and serving compiles
the matched query against the generated pre-aggregate explore in the **project
warehouse dialect** and runs it on the project warehouse client. The entire
managed machinery
(materialization jobs, DuckDB, S3, materialization rows) is bypassed: the
definition stores a null materialization metric query, which the scheduler
already skips.

The external table must expose the **exact generated column names**: metric
columns named by canonical fieldId, average components as `<fieldId>__sum` /
`<fieldId>__count`, the time dimension as its granularity-specific fieldId
(`<dim>_<grain>`), joined dimensions as their plain compiled fieldId. Columns
hold partial aggregates at the definition's grain (re-aggregated at serve
time), with definition filters applied.

`sql_filter` is applied at serve time against the materialization: field
references (`${field}`, `${joined_table.field}`) are rewritten to the
materialized fieldId columns, so every referenced field must be one of the
pre-aggregate's dimensions — otherwise matching records a
`sql_filter_field_not_in_pre_aggregate` miss and the query runs on the
warehouse. Non-field references (`${TABLE}.col`, hand-written `table.col`) pass
through verbatim, so those columns must exist under their raw source names;
correctness of the resulting grain (notably for non-additive metrics / exact
match) is the table owner's responsibility. `${lightdash.*}` user attributes
are substituted with the querying user's values at serve time (fail-closed when
missing).

## Considered options

- **Column mapping in YAML** — rejected for the PoC; customers conform via
  aliases in their MV/view definitions. First QoL candidate if that proves
  painful.
- **Synthetic "active" materialization row pointing at the table** — rejected;
  pollutes the materialization status lifecycle with rows that never
  materialized.
- **Serving external tables through DuckDB** — rejected; the data already lives
  in the warehouse, and per-user warehouse credentials / RLS apply naturally
  there.

## Consequences

- The column contract is hard to reverse once customers build MVs against it.
- `buildPreAggregateExplore` is parameterized by SQL dialect: DuckDB for managed
  pre-aggregates, the project adapter for external ones (avg re-aggregation
  casts and date-trunc derivation are dialect-specific).
- Correctness of external data is entirely the customer's responsibility:
  freshness is never checked, and missing rows are silently wrong results.
- Serve errors (missing table/column) fall back to the warehouse per query, so
  a wrong schema degrades to "pre-aggregate never serves", not failures.
- Outdated CLIs strip the unknown `table` key at parse time, turning the
  definition managed and enqueueing the full warehouse scan — deploys must use
  a CLI that knows the key (or refresh from the UI).
