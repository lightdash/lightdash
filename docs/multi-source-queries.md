# Multi-source queries

Implements the query-API layer of the
[multi-source query platform plan](multi-source-query-platform-plan.md): one
common interface to scan schemas and execute queries against heterogeneous
query sources, and the ability to chain queries across sources. Every query —
whatever its source — lands in the standard async query pipeline
(`query_history` row → S3 results file), so each yields a `queryUuid` whose
results are fetched with the standard results endpoint and carry the universal
`ResultColumns` table format.

## Concepts

- **Query source** (`QuerySourceType` in
  `packages/common/src/types/querySources.ts`): anything that can scan a
  schema and run a query returning the standard table format. Built-ins:
  `semanticLayer` (metric queries), `sql` (SQL runner), `duckdb` (compose
  engine over other results). Sources are deliberately not `WarehouseTypes` —
  they plug in above the warehouse client layer, so non-SQL sources (HTTP
  APIs, Google Sheets, CSV uploads) fit the same contract.
- **Source query** (`SourceQuery`): the tagged union the submit endpoint
  takes, discriminated by `sourceType`. Adding a source means adding a union
  member plus a `QuerySourceClient` implementation — this union is the
  extension point. A query optionally carries a `nodeId` so other queries in
  the same submission can reference its results.
- **References**: a `duckdb` query's `references` expose other queries'
  results as named tables — the array shorthand `["orders", "revenue"]` names
  queries in the same submission (each exposed as a table named by its node
  id); the map form `{"o": "orders", "prev": "<queryUuid>"}` aliases tables
  and reaches results of previous submissions. A referenced result keeps the
  column names of the query that produced it: field ids for `semanticLayer`
  queries, SELECT output names for `sql` queries.
- **Execution context** (`SourceQueryExecutionContext` on the backend): what a
  submission carries besides its queries — parameter values, user attribute
  overrides and cache invalidation, shared by every node — plus each node's
  own `pivotConfiguration`. All of it is required on the submit contract, so a
  new source or caller decides each value explicitly. User attribute overrides
  in particular are never optional: they come from the caller's runtime
  (embed, MCP, the AI agent) and a dropped override shows a user another
  tenant's rows. The HTTP API has none and passes an empty map.

## No orchestrator

There is deliberately no server-side pipeline executor, no pipeline tables and
no new queue infrastructure. Submitting many queries at once validates them
(unique node ids, resolvable references, no cycles) and submits every query
immediately in dependency order, rewriting node-id references to the real
queryUuids as each fire-and-forget submit returns. The dependency *wait*
happens inside the referencing query: a `duckdb` query's background execution
blocks (via `QueryHistoryModel.pollForQueryCompletion`, bounded by a 15-minute
timeout) until every referenced result exists, and fails with the upstream
error if a referenced query fails. Pipeline robustness is therefore exactly
that of any single async query — each node is an ordinary `query_history` row
with the standard status lifecycle.

Interactive and batch use are the same API at different cadences: an agent
typically submits one query at a time, reads the resulting `ResultColumns` as
the schema for its next step, and references previous results by `queryUuid`.
Serializing that session into a shareable, re-executable pipeline is a pure
substitution — keep the query bodies, attach node ids, swap `queryUuid`
references for node ids — because a query submitted alone and a query
submitted in a pipeline are byte-identical shapes. Results expire
(`resultsExpiresAt`), so long-lived sessions re-run upstream queries rather
than referencing expired results.

## Backend structure

`packages/backend/src/services/QuerySourceService/`:

- `types.ts` — `QuerySourceClient`: `scanSchema` (standard tables/columns
  shape), `getQueryReferences` (declares which results a query reads),
  `submitQuery` (returns a `queryUuid`). Each source owns its authorization,
  applying the same checks as the execution path it wraps, and honours the
  execution context it is handed: `semanticLayer` and `sql` nodes apply all
  of it; `duckdb` and `external` nodes resolve parameters, never serve from a
  cache (so invalidation is trivially honoured), have no attribute-scoped SQL
  to apply overrides to, and refuse a pivot until the join node owns the
  pivot stage.
- `QuerySourceRegistry.ts` — sources register by `sourceType`; the service
  resolves and lists them. Commercial/self-hosted extensions register
  additional sources at construction time (`ServiceRepository`).
- `sources/` — the three built-ins, thin wrappers over
  `AsyncQueryService.executeAsyncMetricQuery` / `executeAsyncSqlQuery` /
  `executeAsyncComposeSqlQuery`.
- `QuerySourceService.ts` — endpoint logic: validation, dependency-ordered
  submission, batch status.

The reference wait lives in `AsyncQueryService.runDuckdbQuery` (the
background phase of `executeAsyncComposeSqlQuery`): references are validated
and authorized at submit time with the exact access checks of fetching results
by uuid, then resolved to S3-backed CTEs once the referenced queries complete.
One caveat inherited by design: when compose queries move to NATS workers, a
waiting query occupies a worker slot; dependency-ordered submission keeps
queue order aligned with dependency order, and a dedicated consumer is the
fix if slot starvation ever materializes.

## API

All endpoints require the `multi-source-query` feature flag (on by default in
preview environments) and live under
`/api/v2/projects/{projectUuid}/query-sources`:

| Endpoint | Purpose |
| --- | --- |
| `GET /` | List registered sources |
| `GET /{sourceType}/schema` | Scan one source's schema into the standard `{tables: [{reference, columns: [{reference, type}]}]}` shape |
| `POST /queries` | Submit 1..n source queries → immediate `{nodeId, queryUuid}` per query. Optional `parameters` and `invalidateCache` apply to every query; a query may carry its own `pivotConfiguration` |
| `GET /queries/status?queryUuids=...` | Batch status poll (standard async query lifecycle) |

Individual results are fetched with the existing
`GET /api/v2/projects/{projectUuid}/query/{queryUuid}` endpoint. Statuses are
creator-scoped, mirroring query history access. Polling only the terminal
merge query is sufficient — its completion implies upstream completion, and
its error carries upstream failures.

Example body — two parallel sources merged by DuckDB:

```json
{
    "queries": [
        { "nodeId": "orders", "sourceType": "sql", "sql": "SELECT ..." },
        {
            "nodeId": "revenue",
            "sourceType": "semanticLayer",
            "exploreName": "payments",
            "dimensions": ["payments_order_id"],
            "metrics": ["payments_total_revenue"]
        },
        {
            "sourceType": "duckdb",
            "sql": "SELECT * FROM orders JOIN revenue ON orders.order_id = revenue.payments_order_id",
            "references": ["orders", "revenue"]
        }
    ]
}
```

## Current limitations / next steps

- The `sql` source's schema scan goes through the SQL runner catalog path
  (`ProjectService.getWarehouseTables`, so per-user warehouse credentials are
  respected) but without column detail; the `duckdb` source scans empty (its
  tables are the references handed to each query). A richer, source-keyed
  catalog is a separate plan item.
- There is no server-side record grouping a submission's queries (each is an
  ordinary query history row). If a UI ever needs "pipeline runs", a thin
  grouping table can be added without changing this API.
- Source management (per-project source instances, credentials, per-user
  auth) is out of scope here: the built-ins ride on the project's existing
  connections. The `QuerySourceClient` contract is the seam where per-source
  auth models will live without changing the query interface.
- The agent SQL scope (`scopedSqlContexts.ts`) applies to `ai`/`mcp.runSql`
  contexts only; `multiSourceQuery` and `composeSqlRunner` are not
  agent-scoped, matching the human SQL runner. If the AI agent or MCP tools
  ever submit through these endpoints, they must set an agent-scoped context
  server-side (the scope check lives in
  `AsyncQueryService.executeAsyncSqlQuery`), or the `sql` source would bypass
  the project's agent SQL scope.
