# Merge queries: architecture

How a merge executes today, where it is going, and the traps in between.

**If you are here to change merge execution, read the migration section first.**
There are two execution paths in the code right now and only one of them has a
future. Building against the wrong one is the most common mistake in this area.

## Where it is going

A merge is a composed query: two semantic-layer nodes and one DuckDB join node,
submitted through `QuerySourceService`. Nothing about merges is special at
execution time.

```
compileMergeQuery          QuerySourceService
  resolve sources     ->     semanticLayer node  ->  leg result
  validate                   semanticLayer node  ->  leg result
  build join SQL             duckdb node (join)  ->  merged result
  build items map
```

Merge compilation keeps what it is good at: source resolution, validation, the
fan-out check, join-key typing and the items map that carries labels and
formats. It emits node definitions rather than a warehouse statement.
Validation stays ahead of submission. The DAG is a dumb executor and must not
become the place refusals are decided.

## Where it is today

Two paths, chosen per submission in `executeAsyncMergeQueryInternal`:

- **Warehouse merge**, the original. Both sources compile as CTEs of one
  statement in the project's dialect and run on the project warehouse.
  **Being deleted.** Do not extend it, do not add a dialect to it, do not fix
  bugs in it that the other path does not share.
- **Compose merge**, behind the `merge-on-compose` flag. Each source runs as an
  ordinary metric query, and the DuckDB engine joins the materialized results.
  This is the one with a future.

The compile emits the warehouse statement on **every** run and discards it when
DuckDB executes, which is why the SQL card can show SQL that never ran.

Both paths generate their join with the same `MergeQueryBuilder` and the same
key-option derivation, so join semantics agree by construction rather than by
two implementations kept in step. That is why collapsing to one engine is a
deletion rather than a rewrite.

### Why DuckDB won

- One join dialect instead of ten. `FULL OUTER JOIN` is the least portable
  construct in SQL: Postgres rejects a join condition that is not hash-joinable,
  so the warehouse path cannot use a null-safe comparison and instead emits a
  typed sentinel per key type per dialect, because BigQuery and Trino refuse to
  coalesce a `DATE` key with a `TIMESTAMP` literal. All of that disappears.
- Legs are ordinary queries, so they cache and appear individually in query
  history.
- It is the only path that can reach existing results or external sources.

## The five paths to the DuckDB engine

Merge is not the only caller, and this is the map worth having before touching
any of it.

| Path | What it is | Execution tail | Binds data with |
| --- | --- | --- | --- |
| `runAsyncPreAggregateQuery` | Managed pre-aggregates | its own | materialized table |
| `runExternalSourceQuery` | External-source explores | its own, scoped client | `read_parquet` |
| `executeAsyncComposeSqlQuery` | Compose SQL runner | `runDuckdbQuery`, discover | `read_json` |
| `executeAsyncExternalSqlQuery` | External SQL as a DAG node | `runDuckdbQuery`, discover | `read_parquet` |
| `tryExecuteComposeMergeQuery` | Merge | `runDuckdbQuery`, supplied | `read_json` |

Two things follow from that table.

**Compose SQL, external SQL and merges share one tail**, `runDuckdbQuery`,
with two column modes: *discover* probes raw SQL with a one-row query because
nobody knows its shape ahead of time; *supplied* takes the fields map, columns
and pivot a merge already produced at compile time, so no probe runs and the
labels, formats and provenance survive. References are either *bound* (CTEs
built at submit time, as external SQL does) or *queries* waited on until they
complete, with a guard between "references complete" and "query builds" that
carries the merge row-cap refusal. Merge is still the only caller absent from
`QuerySourceRegistry`; the shared tail is what the DAG work plugs into.

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

**Do not route the merge join through `executeAsyncComposeSqlQuery`.** It gates
on the compose SQL flag and requires a broader ability, so a merge would land
behind three feature flags and a permission it should not need. The join node
calls the shared execution tail directly, below the flag gate.

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
no per-org concurrency budget on the shared client, and the join is fired off
inside the API process behind a wait for its legs. Moving the join to the worker
contains the blast radius but does not supply the budgets.

## Correctness properties worth preserving

These exist because getting them wrong produces confident wrong numbers.

- **Sources compile without their own limit or sort.** A limited side would join
  only its top rows, which looks like real data. The merged statement limits
  once, for the whole result.
- **Null keys match each other**, via a typed sentinel plus a separate
  null-ness equality that keeps the sentinel collision-safe. On DuckDB this
  reduces to the null-safe operator.
- **Fan-out is refused before execution**, naming the source and the dimension.
- **A leg that reaches the row cap is refused before the join**, from the leg's
  own `query_history` row count. On the compose path the legs run at the cap,
  so no guard inside the join SQL could ever see past it.
- **A result source cut short at its own limit is refused at compile time**,
  from the referenced query's stored limit and row count. It is checked
  against its own limit only, never the row cap: it was never run at the cap,
  and the remedy is re-running that query, not filtering it.
- **Table calculations that depend on a source's own row set are refused**,
  because merging changes those rows.

## Verification

- `packages/api-tests/tests/mergeQuery.test.ts` is the parity bar and is engine
  independent by construction: merged values must equal what each source returns
  on its own, per join type, per warehouse. It runs on the seeded Postgres
  project plus every warehouse with CI credentials.
- `packages/backend/src/utils/QueryBuilder/composeMergeSql.test.ts` executes the
  generated join on a real in-memory DuckDB.

Known gaps in that coverage, so you do not assume it is proving more than it is:
the parity suite compares values numerically, so it cannot catch a formatting
regression; there is no end-to-end test of merging at all; and a live row-cap
trip needs more rows than the seed carries (the refusal itself is proven in
`AsyncQueryService.test.ts` with the cap lowered through config, and the
result-source refusal the same way with the referenced query's limit lowered).

## Current work

Tracked in Linear under the `merge-queries` label, in the Query & Explore V2
project. The sequence is: correctness fixes that are independent of the engine,
then typed results, then the collapse to one execution path, then the Explorer
surface. The collapse ticket names precisely what gets deleted.
