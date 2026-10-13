# Merge queries: architecture

How a merge executes, and the traps around it.

## One execution path

A merge is a composed query: two semantic-layer nodes and one DuckDB join node,
submitted through `QuerySourceService`. Nothing about merges is special at
execution time.

```
compileMergeQuery          QuerySourceService.submitQueries
  resolve sources     ->     semanticLayer node  ->  leg result
  validate                   semanticLayer node  ->  leg result
  build join SQL             duckdb node (join)  ->  merged result
  build items map
```

Merge compilation (`ProjectService.compileMergeQuery`) keeps what it is good
at: source resolution, validation, the fan-out check, join-key typing and the
items map that carries labels and formats. It compiles each metric source to
the statement that source's leg runs (whole, at the source row cap, unsorted)
and builds the join in the DuckDB dialect over `merge_source_N` reference
tables. It returns both: `legs` and `sql` together are the SQL that runs, and
the SQL card shows them as such. Validation stays ahead of submission. The DAG
is a dumb executor and must not become the place refusals are decided.

Submission (`AsyncQueryService.submitMergeDag`) turns the compile into nodes:
one `semanticLayer` node per metric source (`buildMergeLegNode`), and one
`duckdb` node holding the join core and the merge's pivot, whose references
map each `merge_source_N` to a leg node or, for a result source, straight to
that result's queryUuid. The join node carries an execution plan: a composer
factory over the core (`MergeQueryComposer`, built by the node for the DuckDB
dialect and the node's own pivot, so the pivot stage and the terminal wrapper
are composed with the node and nothing upstream knows the merge is pivoted),
the columns with their provenance, and the row-cap guard. Provenance on a
supplied column may name a leg node; the duckdb source resolves it to the leg's queryUuid at
submit, the way it resolves a table reference. The join's queryUuid is what
the Explorer pages.

Submit first checks that a sandbox provider is configured and fails with a
missing-configuration error naming the fix if not (see
[Operating prerequisite](#operating-prerequisite)). It then writes the row,
records the result's producer, and writes everything the run needs beyond the
row itself to the row's `duckdb_execution` column: the references, how columns
are found, the row-cap guard as data, and whether the run was refused. It
returns the queryUuid and the API process drives the run in the background,
the way a Python transformation runs. No worker and no queue are involved.

The run is one sequence, the same for every DuckDB-over-results query:

```
wait for references   each referenced query completes (up to 15 minutes);
                      an upstream error fails the join with that error
row-cap guard         a leg at the row cap is refused, before any sandbox
cache lookup          a hit lands on the earlier result
stream inputs         each referenced result file is read from results
                      storage, within the input byte budget
sandbox               one-shot sandbox: write inputs, probe columns
                      (discover mode only), run the statement, read the
                      result back, destroy the sandbox
validate              fields map parsed; row count and byte size capped
upload                result file stored under the cache key
ready                 row marked ready with its columns and row count
```

When references are still running, the sandbox is created during the wait so
its cold start overlaps it; when they are already complete, a cache hit lands
before any sandbox is created. The run has a 5 minute timeout; a timeout, a DuckDB
error or an output over the cap marks the row errored with a message safe to
show, and the sandbox is always destroyed. A refusal by the guard is recorded
on the row too, so the outcome reporter, which polls the join row rather than
awaiting any run, tells a refusal from a failure.

The join is served from the results cache by the files it reads, not by the
rows it referenced: a leg served from cache mints a new history row over the
same result file, so the row uuids change on every run while the files do
not. Once the references are bound, the run keys itself on the join's SQL,
the referenced result files in reference-table order, its parameters and the
sandbox version (provider, template and runner script), looks that key up,
and either lands on the earlier run's results or runs and stores its own under
that key. Because the sandbox version is in the key, a result produced by an
older engine or image is never served to a newer one. With agent identity on,
identity joins the key and the shared cache is bypassed. `invalidateCache` on
the merge reaches the legs at submit and the join through its persisted spec.

### Why DuckDB

- One join dialect instead of ten. `FULL OUTER JOIN` is the least portable
  construct in SQL: Postgres rejects a join condition that is not
  hash-joinable, so a warehouse merge could not use a null-safe comparison and
  instead emitted a typed sentinel per key type per dialect, because BigQuery
  and Trino refuse to coalesce a `DATE` key with a `TIMESTAMP` literal. On
  DuckDB the join is `IS NOT DISTINCT FROM` and all of that is gone.
- Legs are ordinary queries, so they cache and appear individually in query
  history.
- It is the only engine that can reach existing results or external sources.

## What a chart version stores

A merged chart version stores its definition in `saved_queries_version_merges`
(schema version 3, jsonb in the `merge` column): the other queries by the
name they go by, one join, and the sort and limit of the merged result. The
chart's own query is the first input and goes by its explore's name. This is
also the `merge` field of the chart API and the `merge:` block of
chart-as-code; nothing translates between them.

```yaml
merge:
  queries:
    payments:
      explore: payments
      dimensions: [orders_order_date_month]
      metrics: [payments_unique_payment_count]
  join: left
  keys:
    orders_order_date_month: [payments.orders_order_date_month]
  sort:
    - by: orders_order_date_month
      direction: desc
  limit: 500
```

Names are the merged result's table names: `payments` yields
`payments_payments_unique_payment_count`, the chart's `orders` yields
`orders_orders_total_order_amount`, and a key named after the chart's field
yields `merge_orders_order_date_month`. A `by` is a chart field id, a
`query.fieldId` reference, or a merge table calculation's name; a chart field
that is a key sorts the key column. A query that repeats its values says
`repeat: true`; the chart's own query says `chartRepeats: true` on the
merge. Filters and table calculations appear only when there are some.

What the validator enforces (`parseSavedMergeDefinition` in
`packages/common/src/types/mergeQuery.ts`): at least one query, names that
are identifiers and not `merge`, a known join type with no fallback, a key
whose every entry reaches every query exactly once, a numeric limit, sorts
with a direction. Intent only, never SQL.

Rows written under schema version 2 (primary id plus source kinds, sort on
the chart) are rewritten when read, once, by `upgradeSavedMergeQuery`, and
keep the ids they had so no chart config moves: `chartAs: a` names the
chart's query as it was, `keyNames` keeps a key column's old name
(`merge_join_key_0`), and the other query keeps `b`. Nothing is backfilled
and no row is rewritten in place; writes emit version 3. A request may still
send `merge` in the v2 shape and is rewritten on save; a v2 merge whose
primary was not the chart is refused on write and omitted when reading old rows. Every reader
goes through `SavedChartModel`, which returns `merge`, and every runner
through `buildMergeQueryFromMergeDefinition`: saved charts, dashboard tiles,
scheduled deliveries, chart-as-code, promotion and version history. Document
chart cells keep the v2 shape inside the document's own schema.

In the Explorer the editor addresses its sources by fixed handles (`a`, `b`)
and runs them under names (`getMergeSourceNames`): the chart's explore, the
other query's explore, `_2` on a repeat. A restored chart carries its saved
names so its column ids hold.

Kept as decided: the side table stays (a column on `saved_queries_versions`
would widen every version read for a value almost no version has), and
`tableConfig.columnOrder` keeps the ids it always had.

## The paths to DuckDB

Merge is not the only caller, and this is the map worth having before touching
any of it.

| Path                           | What it is                 | Submitted through                         | Where DuckDB runs  | Binds data with    |
| ------------------------------ | -------------------------- | ----------------------------------------- | ------------------ | ------------------ |
| `runAsyncPreAggregateQuery`    | Managed pre-aggregates     | its own                                   | server process     | materialized table |
| `runExternalSourceQuery`       | External-source explores   | its own, scoped client                    | server process     | `read_parquet`     |
| `executeAsyncExternalSqlQuery` | External SQL as a DAG node | `runDuckdbQuery`, discover                | server process     | `read_parquet`     |
| `executeAsyncComposeSqlQuery`  | Compose SQL runner (gated) | `executeAsyncDuckdbSourceQuery`, discover | one-shot sandbox   | `read_json`        |
| `submitMergeDag`               | Merge, as a DAG            | `executeAsyncDuckdbSourceQuery`, supplied | one-shot sandbox   | `read_json`        |

Two things follow from that table.

**DuckDB over results runs only in a sandbox.** Composer SQL transformations,
the compose SQL runner, the query-sources API and merges (totals legs and the
agent merge-parity path included) all read other query results, and all of
them run in a one-shot sandbox. Pre-aggregates and external sources read their
own parquet and keep their DuckDB in a server process. See
`docs/composer-queries/adr/0001-duckdb-over-results-runs-only-in-a-sandbox.md`.

**Compose SQL and merges share one submit below every flag**,
`executeAsyncDuckdbSourceQuery`, with the plan deciding two things. Columns
are either _discovered_, probing raw SQL with a one-row query in the same
sandbox before the statement runs, because nobody knows its shape ahead of
time, or _supplied_ from a compile, so no probe runs and the labels, formats
and provenance survive. References are either _bound_ (CTEs built at submit
time, as external SQL does) or _queries_ waited on until they complete, with
a guard between "references complete" and "query builds" that carries the
merge row-cap refusal. In the sandbox each reference is a local file in the
sandbox's input directory, read with the same typed JSONL select.

**Precision is lost in the drivers, not in the file format.** Ingested data is
written as parquet and carries its own schema. Referenced query results are
written as JSONL, which carries whatever digits the driver serialised; the
parquet writer re-types through the same five-value map, so switching formats
would have changed nothing. Referenced results are bound with a typed read
(`getJsonlReferenceSelect` in `duckdbSqlTables.ts`): every column is read as
text and cast in SQL, NUMBER by the per-column numeric kind the driver reports
(`integer`, `decimal(scale)`, `float`), timestamps as instants unless naive,
and an uncastable value refuses naming the column. Every warehouse client
reports a kind for integer and float columns and for a decimal whose scale it
knows (Snowflake from the column scale, BigQuery from the schema field,
Trino and ClickHouse from the type string, Databricks from the type
qualifier, Athena from `ColumnInfo.Scale`, Postgres and Redshift from the
typmod); a decimal of unknown scale reports none rather than a guess, and a
column without a kind binds as DOUBLE. What that read cannot recover is
what the driver already rounded: Postgres NUMERIC through `parseFloat`,
BigQuery through `Number(toFixed)`, Snowflake without `fetchAsString`, Trino
bigints through `JSON.parse`. Those are driver fixes, not merge bugs.

## Traps

**The public DAG entry is gated; the merge uses the ungated one.**
`QuerySourceService.executeSourceQueries` applies the multi-source flag and
the `manage Explore` ability, and a public duckdb node runs through the compose
SQL runner, which applies the compose SQL flag again. A merge would land behind
three flags and a permission it should not need. `submitQueries` is the same
submission without the gates, for callers that have already authorized what
they submit; it takes an execution plan per duckdb node, and a duckdb node
with a plan goes straight to `executeAsyncDuckdbSourceQuery`. The public body
cannot express a plan.

**User attribute overrides are load-bearing.** They were silently dropped on the
merge path once and fixed as an embed row-level-security risk. The query source
submit contract therefore requires them (`SourceQueryExecutionContext` in
`QuerySourceService/types.ts`): a caller without overrides passes an empty map,
never leaves the field out. Keep it that way when adding callers or sources; the
failure mode is a user seeing another tenant's rows.

**The sandbox gets files, never credentials.** It has no storage credentials
and no network egress. The API process reads each referenced result file from
results storage and writes it into the sandbox's input directory; the sandbox
writes one JSON line per row, with the same serialisation the results upload
uses, plus a fields map, and the API process reads them back and uploads the
file. Inside the sandbox the DuckDB session is locked to its input and temp
directories with external access disabled before any input loads, so even
SQL that passed validation can read nothing else. The sandbox runs the same
DuckDB warehouse client the server uses, built from the same commit, so
session hardening, type mapping and row serialisation have one
implementation. An instance without results storage is refused with a
`MissingConfigError` naming the variables, as is one without a sandbox
provider; nothing silently falls back to running DuckDB in a server process.

**Storage sessions are for external sources only.** `ComposeEngineClient`
(`services/AsyncQueryService/`) keeps the DuckDB sessions external SQL uses to
read external-source parquet on the pre-aggregates bucket. A session is built
from the S3 config that owns the bucket it reads, because a DuckDB S3 secret
pins one endpoint and region. `PreAggregateStrategy` is only about managed
pre-aggregates (routing, resolution, stats, audit) and reads materializations
through its own pre-aggregate-bucket session. Do not route a composed query
through the strategy. An HTTPS session with no CA bundle is refused: httpfs
verifies object storage with the system bundle (`SSL_CERT_FILE` overrides
it), which the runtime image installs as `ca-certificates`; Node's own trust
store does not help it. With `S3_AUTH_MODE=gcp_oauth`, the runtime config
supplies a Google token provider and a bucket scope, and DuckDB uses a native
`TYPE gcs` bearer secret, including for `s3://` locators; an HTTP bearer
secret alone does not authenticate those reads. None of this reaches the
sandbox, which never talks to storage.

**Resource governance is per sandbox.** Each run has a 5 minute timeout, a
DuckDB memory limit (`DUCKDB_SANDBOX_MEMORY_LIMIT`, default `1GB`) and thread
count (`DUCKDB_SANDBOX_THREADS`, default 2), and spills to a temp directory
inside the sandbox. Inputs share one byte budget (`SANDBOX_INPUT_MAX_BYTES`,
default 64 MiB) and the output is capped at the row limit and 64 MiB. The wait
for references happens on the API process as an awaited poll, not a held
worker slot. The only concurrency bound is the 25-queries-per-submission cap;
there is no cross-submission cap on sandboxes per pod yet.

## Operating prerequisite

A sandbox provider is a prerequisite for merges and composer transformations.
`SANDBOX_PROVIDER` defaults to `e2b`, which needs `E2B_API_KEY`; locally the
`docker` provider runs the image built from `sandboxes/duckdb-runner/`. Like
the Python runner, only the `e2b` and `docker` providers are supported. Without
one, submission fails with a missing-configuration error naming `E2B_API_KEY`
or `SANDBOX_PROVIDER`, and the merge never starts. A pre-aggregate worker is no
longer needed for merges. The variables are listed in `docs/sandbox-runtime.md`.

**Two response fields are dead but required.** `requiresCompose` on the
compiled merge and `sourceLimitExceededSql` on its terminal wrapper are always
false and null. Removing a required response property is an API break, so
they leave with the legacy merge endpoints (PROD-10904), not before.

## Correctness properties worth preserving

These exist because getting them wrong produces confident wrong numbers.

- **Legs run whole: no sort, and only the source row cap as a limit.** A
  limited side would join only its top rows, which looks like real data. The
  merged statement limits once, for the whole result.
- **Null keys match each other**, through `IS NOT DISTINCT FROM`, under every
  join type, so toggling full, left and inner never changes what a null key
  means.
- **Fan-out is refused before execution**, naming the source and the dimension.
- **A leg that reaches the row cap is refused before the join**, from the leg's
  own `query_history` row count. The legs run at the cap, so no guard inside
  the join SQL could ever see past it, and there is none.
- **A result source cut short at its own limit is refused at compile time**,
  from the referenced query's stored limit and row count. It is checked
  against its own limit only, never the row cap: it was never run at the cap,
  and the remedy is re-running that query, not filtering it.
- **Table calculations that depend on a source's own row set are refused**,
  because merging changes those rows.
- **A sorted merge states its null placement.** DuckDB's default
  (nulls last) is not every warehouse's, so under a limit the join would keep
  different rows from the same query run on the warehouse. Each sort term
  carries `NULLS FIRST` or `NULLS LAST`: the sort's own, else the project
  warehouse's default (`getWarehouseDefaultNullsFirst`).

## Verification

- `packages/api-tests/tests/mergeQuery.test.ts` is the parity bar: merged
  values must equal what each source returns on its own, per join type, per
  warehouse, pivoted and unpivoted, through a saved merged chart and a
  dashboard tile. It runs on the seeded Postgres project plus every warehouse
  with CI credentials.
- `packages/backend/src/utils/QueryBuilder/composeMergeSql.test.ts` executes the
  generated join on a real in-memory DuckDB.
- `packages/backend/src/utils/QueryBuilder/composeMergeFidelity.test.ts` pins
  value fidelity through the typed read, one case per type, with the known
  driver losses as expected failures.

Known gaps in that coverage, so you do not assume it is proving more than it is:
there is no browser end-to-end test of merging (PROD-10950); and a live row-cap
trip needs more rows than the seed carries (the refusal itself is proven in
`AsyncQueryService.test.ts` with the cap lowered through config, and the
result-source refusal the same way with the referenced query's limit lowered).

## Current work

Tracked in Linear under the `merge-queries` label, in the Query & Explore V2
project. With one execution path in place, what remains is the pivot stage
moving onto the join node (PROD-10902), consolidating the merge endpoints
(PROD-10904), and the Explorer surface.
