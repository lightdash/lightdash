# Multi-Source Query Platform — Plan

Goal: a new query path where there are many query sources (not just data warehouse) — and they all
return a standard table format with an id. Then there is a first-class way to query across those
results with a DuckDB instance (and get another standard table). All tables can have the same viz
stack built on top.

The standard table format already exists and is universal: every query path returns
`ResultColumns` (`Record<string, {reference, type}>`) + rows, addressed by a `queryUuid`
(`query_history` row → S3 results file).

## Status (2026-08-18)

Shipped on `claude/query-dag-agent-ergonomics-p6s957` (see
[multi-source-queries.md](multi-source-queries.md) for the implementation doc):

- **Query API** — done: one tagged-union submit endpoint
  (`POST /query-sources/queries`, 1..n queries, flat agent-friendly payloads), batch status
  endpoint, everything riding the standard async pipeline.
- **Source adapters** — contract + three built-ins done (`QuerySourceClient` registry:
  `semanticLayer`, `sql`, `duckdb`); csv/http/graphql adapters not started.
- **DuckDB service** — v1 done as `executeAsyncComposeSqlQuery`: reference resolution with
  results-by-uuid authz, `createForHandles`-style validation split, and cross-query chaining —
  references to still-running queries wait inside the referencing query, so multi-query pipelines
  need no orchestrator (we built and then deliberately deleted a DAG executor + tables in favour
  of this).
- **Catalog** — minimal: per-source schema scan endpoint (explores with field ids; warehouse
  tables without columns). Source-keyed cached catalog, search, and refresh not started.
- **Saved objects** — not started; the submission body is the serialization format for now
  (node-id references make an interactive session replayable verbatim).
- **Source management, results store upgrades (parquet/range reads), structural caching, MCP
  tools, usage/cost capture, viz binding to bare queryUuids** — not started.

One deliberate divergence from the v1 plan below: no opaque handle table — references are
`queryUuid`s (or in-submission node ids) directly. Revisit handle minting when copy-on-save or
cross-user sharing arrives.

## Product features

### Source adapters

Adapter abstraction/interface + oob implementations: warehouse sql, lightdash semantic layer
(port existing), csv, http api, graphql. Adapter contract = extension point for future sources.

- **Related existing:** `QueryComposer` (with `SqlQueryComposer` / `MergeQueryComposer` subclasses)
  is the seam every execution path reads from; `WarehouseClient` / `WarehouseTypes` is the
  warehouse-only adapter layer beneath it.
- **Different:** `WarehouseClient` assumes a SQL dialect + database/schema/table introspection, so
  it can't be the contract for CSV/HTTP/GraphQL. New sources plug in at the composer level with a
  new `SourceType` discriminator — not new `WarehouseTypes` values. "Adapter" already means dbt
  metadata source (`ProjectAdapter`); the new concept needs a different name.

### Source management

Create source on project, permissions/sharing/access. Credentials stored per project, org, or
user — shareable across those scopes. Auth modes per-source: per-user (oauth) vs shared token.
Per-user auth scopes cache keys to principal.

- **Related existing:** `ai_mcp_server` + `ai_mcp_server_credential` (`credential_scope:
  'shared'|'user'`, oauth-sharing flag, user-wins resolution); `external_connections` (secrets in a
  side table, per-row sharing flag in CASL conditions); the org/user/project warehouse-credential
  scopes with a unified precedence resolver; `project_dbt_sources` (N named sources per project);
  principal-scoped cache keys (`getCacheUserUuid`).
- **Different:** each of those is a single-purpose one-off; there is no general `sources` entity.
  The project warehouse connection is 1:1 (`warehouse_credentials.project_id` UNIQUE) — wrap it as
  a legacy source behind the new resolver rather than migrating it.

### Catalog

Build/refresh cached catalog per source, storage, fetch + search api for agents. Refresh: manual,
scheduled, on-connect.

- **Related existing:** `catalog_search` (tsvector search, AI/MCP-specific contexts,
  user-attribute filtering), `cached_explore`, `WarehouseClient.getCatalog/getAllTables/getFields`,
  the warehouse-tables cache.
- **Different:** everything is keyed to `project_uuid` + `Explore` (`catalog_search` has a NOT NULL
  cascade FK to `cached_explore`); there is no source entity to hang a catalog on; refresh is a
  per-project wipe-and-rebuild behind one lock; scheduled refresh does not exist at all. Needs a
  source-keyed schema that reuses the search internals.

### Query API

Submit query to source (payload typed by source), returns id to standardised dataset. Async by
default.

- **Related existing:** the v2 async query API — submit → `queryUuid` → poll → paginated results,
  `query_history`, NATS worker whose payload is just `{queryUuid}`.
- **Different:** the request union is untagged (discriminated by URL path + `in` sniffing) — needs
  a `kind` tag and one submit endpoint; the id is project-scoped in the URL; the pipeline requires
  an explore/metricQuery off the composer (SQL already fakes it).

### Results store/serve

Persist standard datasets (arrow/parquet), streaming fetch, range reads, signed-url/token auth for
direct access (wasm/cli).

- **Related existing:** S3 JSONL results files; `LocalParquetUploadStream` (zstd parquet writes,
  used by pre-agg materialization); the format-polymorphic locator `{storage, format:
  'jsonl'|'parquet', uri}`; `PersistentDownloadFileService` (short-lived JWT token auth);
  `S3_PUBLIC_ENDPOINT` for browser-reachable presigning.
- **Different:** pagination is a linear JSONL line-scan (doesn't survive parquet); range reads
  don't exist anywhere; every exporter assumes JSONL; there is an explicit recent stance against
  handing raw presigned S3 URLs to clients — direct wasm/cli access needs a deliberate decision.

### Results caching

TTL, freshness metadata, query keys (normalised ast hash), predicate matching, re-aggregation of
cached results, hot tier.

- **Related existing:** versioned `cache_key` (sha256 of compiled SQL), dual-clock TTL
  (freshness vs availability), `cacheMetadata` on every response, `invalidateCache` plumbing; the
  pre-aggregate matcher (filter subsumption, granularity rollup) and additivity/re-aggregation
  logic.
- **Different:** cache lookup is exact key equality — no structural matching over cached results;
  the matcher and re-agg are coupled to `PreAggregateDef`, not arbitrary cached datasets; no hot
  tier exists (no Redis, every hit re-reads S3). AST-hash keys are self-invalidating via the cache
  version literal.

### DuckDB service

Server-side execution over handles, resolves handle → data, handle-level authz, execution api.

- **Related existing:** hardened `DuckdbWarehouseClient` (SELECT-only + file-function blocklist,
  tiered validation factories); `duckdbSqlTables` (locator + columns → typed
  `read_json`/`read_parquet` expressions); `PreAggregationDuckDbClient` + the
  `warehouseClientOverride` execution seam; `pre_aggregate_materializations` (a working
  handle-shaped registry: query uuid → durable URI + schema); `MergeIrNode {id, sql, dependsOn}`.
- **Different:** no opaque handle registry with ACLs — query results are creator-only TTL cache
  artifacts; the pre-agg DuckDB instance is a single shared process-wide instance; its S3 config
  piggybacks the pre-agg namespace; a new validation tier is needed so server-generated file reads
  coexist with locked-down user SQL.

### Saved objects

Save endpoint takes (duckdb_sql_with_handles, viz_config); server resolves handles → materialises
source query payloads into object (copy-on-save, self-contained, portable). Agent never re-passes
source queries. Load/list/permissions/versioning. Re-run = replay embedded queries → new handles →
substitute → execute. History retention only needs to outlive handle ttl.

- **Related existing:** `saved_queries` + immutable version rows; `saved_queries_version_merges`
  (copy-on-save of a second query in a `schema_version`ed side table, request-scoped source ids
  deliberately dropped and re-minted on load — the replay/substitute pattern); non-destructive
  version history/rollback; space-scoped CASL.
- **Different:** nothing stores composition SQL + N embedded source payloads; `saved_sql` is
  one-SQL-string/one-warehouse and should not be extended; `query_history` has no parent/child
  link for fan-out; results have cache lifetime, not saved-object lifetime; merge composition is
  capped at two sources.

### MCP server

Tool surface as product: list sources/schemas/fields, source query, duckdb query, refresh(handle),
save. Schema + freshness in responses, agent-friendly error shapes.

- **Related existing:** the `defineTool` registry with snapshot/CI compat guards;
  `run_metric_query`, `run_sql`, `get_query_result` (the handle/refresh primitive),
  `create_content`/`edit_content`, `grep_fields`/`get_metadata`.
- **Different:** no freshness anywhere in tool responses (server-side `cacheMetadata` is
  discarded); `run_sql` returns column names without types; errors are mostly plain text rather
  than structured shapes; `render_chart` is gated to metric-query results.

### Usage/observability

Log every query: who, source, cost, cache hit rate, agent vs human. Feeds finops + product
analytics.

- **Related existing:** `query_history` (who/context/actor-type per query), `QueryExecutionContext`
  (incl. `ai`, `mcp.*`), the `usage_events` pipeline (buffered JSONL → nightly DuckDB compaction →
  partitioned parquet, `query_events` stream with cache_hit/warehouse_type/timings).
- **Different:** cost (bytes scanned / credits / slot-ms) is not captured anywhere — the one
  genuine hole; per-source attribution beyond warehouse type doesn't exist yet.

### Viz stack

Chart spec over result schema, render, share.

- **Related existing:** the generic viz layer (`AllVizChartConfig` + data models over
  `{reference, aggregation}` column references, isomorphic `getSpec()`); the universal
  `ReadyQueryResultsPage` envelope; `IResultsRunner`; the `/minimal/` screenshot path.
- **Different:** no surface binds a bare `queryUuid` to a chart; the only runners are
  SQL-runner-bound and frontend-only; 5 chart kinds vs the legacy 11; `ResultColumn` carries no
  format metadata; the legacy `ChartConfig` stack requires `metricQuery` + `ItemsMap` and stays
  untouched.

## V1: `duckdb_query`

The proof point is the agent loop — no sources entity, catalog, or credential model required:

1. Execute query A against the warehouse → result id *(exists: `run_sql` / `run_metric_query`
   return `queryUuid`)*
2. Execute query B → result id *(exists)*
3. `duckdb_query(sql, handles)` → joins both results → new result id *(new)*

`handles` is an explicit `{alias → queryUuid}` map, deliberately separate from `sql`:
authorization happens before execution without parsing untrusted SQL; the server generates the
`WITH alias AS (SELECT * FROM read_json(...))` prefix itself so user SQL never contains file
access and stays under the existing SELECT-only blocklist; aliases give readable SQL and
self-joins; and save/replay later re-mints handles and rebinds the map without rewriting SQL text.

Build items:

- **Handle resolution:** check ownership (`query_history` is creator-only — correct for v1) and
  `results_expires_at`; pull `results_file_name` + `columns`; build typed CTE prefix via the
  existing `duckdbSqlTables` helpers (results are JSONL — `read_json` works day one, parquet
  later).
- **`createForHandles()` validation tier** on `DuckdbWarehouseClient`: server-generated prefix may
  read files; the user SQL portion keeps the full blocklist.
- **Execution:** through the `warehouseClientOverride` seam → new `query_history` row, S3 results
  file, pagination and `get_query_result` polling inherited for free.
- **Wiring:** DuckDB S3 session config pointed at the results bucket (not the pre-agg namespace);
  fake explore/metricQuery the way `SqlQueryComposer` does.
- **Expose:** one TSOA endpoint + one MCP tool via `defineTool`.
- **See it:** un-gate `render_chart` and make it build its spec from `ResultColumns` instead of
  `metricQuery` + `ItemsMap` — agent-visible viz of the joined result, zero frontend work.

Day-one design decision: mint opaque handle ids (a thin table pointing at query uuids) rather than
exposing `queryUuid` in the tool contract, so copy-on-save and cross-user sharing don't later
break the interface.

Out of scope for v1: save (new object type on the merge-chart pattern), durable materialization,
source adapters beyond the warehouse, catalog, human-facing viz page.
