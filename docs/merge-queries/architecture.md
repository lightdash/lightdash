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
factory over the core (`MergeQueryComposer`, built by the node for the
engine's dialect and the node's own pivot, so the pivot stage and the
terminal wrapper are composed where the node runs and nothing upstream knows
the merge is pivoted), the columns with their provenance, a session scoped to
the leg files it reads, and the row-cap guard. Provenance on a supplied column
may name a leg node; the duckdb source resolves it to the leg's queryUuid at
submit, the way it resolves a table reference. The join's queryUuid is what
the Explorer pages.

Submit writes everything the run needs beyond the row itself to the row's
`duckdb_execution` column: the references, the engine, how columns are found,
the row-cap guard as data, and whether the run was refused. With the NATS
worker on, submit then hands the queryUuid to the `warehouse.duckdb.jobs`
subject and the worker rebuilds the run from the row; with the worker off, the
API process runs exactly the same rebuild. A refusal by the guard is recorded
on the row too, so the outcome reporter, which polls the join row rather than
awaiting any run, tells a refusal from a failure wherever the join executed.

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

## The paths to the DuckDB engine

Merge is not the only caller, and this is the map worth having before touching
any of it.

| Path                           | What it is                 | Execution tail                            | Binds data with    |
| ------------------------------ | -------------------------- | ----------------------------------------- | ------------------ |
| `runAsyncPreAggregateQuery`    | Managed pre-aggregates     | its own                                   | materialized table |
| `runExternalSourceQuery`       | External-source explores   | its own, scoped client                    | `read_parquet`     |
| `executeAsyncComposeSqlQuery`  | Compose SQL runner (gated) | `executeAsyncDuckdbSourceQuery`, discover | `read_json`        |
| `executeAsyncExternalSqlQuery` | External SQL as a DAG node | `runDuckdbQuery`, discover                | `read_parquet`     |
| `submitMergeDag`               | Merge, as a DAG            | `executeAsyncDuckdbSourceQuery`, supplied | `read_json`        |

Two things follow from that table.

**Compose SQL and merges share one tail below every flag**,
`executeAsyncDuckdbSourceQuery`, with the plan deciding two things. Columns
are either _discovered_, probing raw SQL with a one-row query because nobody
knows its shape ahead of time, or _supplied_ from a compile, so no probe runs
and the labels, formats and provenance survive. The engine is either the
shared results session or one scoped to exactly the result files the query
reads. References are either _bound_ (CTEs built at submit time, as external
SQL does) or _queries_ waited on until they complete, with a guard between
"references complete" and "query builds" that carries the merge row-cap
refusal.

**Precision is lost in the drivers, not in the file format.** Ingested data is
written as parquet and carries its own schema. Referenced query results are
written as JSONL, which carries whatever digits the driver serialised; the
parquet writer re-types through the same five-value map, so switching formats
would have changed nothing. Referenced results are bound with a typed read
(`getJsonlReferenceSelect` in `duckdbSqlTables.ts`): every column is read as
text and cast in SQL, NUMBER by the per-column numeric kind the driver reports
(`integer`, `decimal(scale)`, `float`), timestamps as instants unless naive,
and an uncastable value refuses naming the column. Postgres and DuckDB report
a kind; a column without one binds as DOUBLE. What that read cannot recover is
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

**The engine is OSS; managed pre-aggregates are not.** `ComposeEngineClient`
(`services/AsyncQueryService/`) owns the compose engine in every edition. A
session is built from the S3 config that owns the bucket it reads, because a
DuckDB S3 secret pins one endpoint and region: compose SQL and merges read
result files on the results session, which every instance that can run a
query already has; external SQL reads external-source files on the
pre-aggregates bucket's session. `PreAggregateStrategy` is only about managed
pre-aggregates (routing, resolution, stats, audit) and reads materializations
through its own pre-aggregate-bucket session. Do not route a composed query
through the strategy. An instance without results storage is refused with a
`MissingConfigError` naming the variables; the engine is never a silent
fallback.
An HTTPS session with no CA bundle is refused the same way: httpfs verifies
object storage with the system bundle (`SSL_CERT_FILE` overrides it), which the
runtime image installs as `ca-certificates`; Node's own trust store does not
help it.

**The compose path has no resource governance.** No query timeout (the deadline
that exists applies only to the playground path), memory limit unset by default,
and no per-org concurrency budget on the shared client. The join runs on the
NATS worker where one is configured, which contains the blast radius, but a
join waiting on its legs holds a worker slot while it waits, and the worker
supplies no budgets either.

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
