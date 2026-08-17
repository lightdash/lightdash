# Multi-source query DAGs

Implements the query-API layer of the
[multi-source query platform plan](multi-source-query-platform-plan.md): one
common interface to scan schemas and execute queries against heterogeneous
query sources, and a DAG executor that chains those queries across sources.
Every query — whatever its source — lands in the standard async query pipeline
(`query_history` row → S3 results file), so each step yields a `queryUuid`
whose results are fetched with the standard results endpoint and carry the
universal `ResultColumns` table format.

## Concepts

- **Query source** (`QuerySourceType` in
  `packages/common/src/types/querySources.ts`): anything that can scan a
  schema and run a query returning the standard table format. Built-ins:
  `semanticLayer` (metric queries), `sql` (SQL runner), `duckdb` (compose
  engine over previous results). Sources are deliberately not
  `WarehouseTypes` — they plug in above the warehouse client layer, so
  non-SQL sources (HTTP APIs, Google Sheets, CSV uploads) fit the same
  contract.
- **Source query** (`SourceQuery`): the tagged union every submit endpoint
  takes, discriminated by `sourceType`. Adding a source means adding a union
  member plus a `QuerySourceClient` implementation — this union is the
  extension point.
- **Query DAG**: a set of nodes, each a source query with a DAG-unique node
  id. Edges are implicit: a `duckdb` node's `references` map
  (`{tableName: nodeIdOrQueryUuid}`) names the upstream nodes whose results
  it consumes. The canonical shape is n source queries fanned out in
  parallel feeding one `duckdb` node that merges them.

## Backend structure

`packages/backend/src/services/QuerySourceService/`:

- `types.ts` — `QuerySourceClient`: `scanSchema` (standard
  tables/columns shape), `getQueryReferences` (declares DAG edges),
  `submitQuery` (returns a `queryUuid`). Each source owns its authorization,
  applying the same checks as the execution path it wraps; how a source
  authenticates against its backing system is an implementation detail
  behind the contract.
- `QuerySourceRegistry.ts` — sources register by `sourceType`; the service
  resolves and lists them. Commercial/self-hosted extensions register
  additional sources at construction time (`ServiceRepository`).
- `sources/` — the three built-ins, thin wrappers over
  `AsyncQueryService.executeAsyncMetricQuery` / `executeAsyncSqlQuery` /
  `executeAsyncComposeSqlQuery`.
- `QuerySourceService.ts` — endpoint logic plus the DAG executor:
  validates the DAG (bounded size, unique node ids, references resolve to a
  node or a query uuid, no cycles via Kahn's algorithm), persists it, then
  orchestrates in-process: every node whose dependencies are satisfied is
  submitted concurrently, completion is polled with
  `QueryHistoryModel.pollForQueryCompletion`, node references are resolved
  to queryUuids before dependents submit, and failures cascade (failed node
  → `error`, downstream → `skipped`). All state transitions persist to
  `query_dags` / `query_dag_nodes`, so any pod serves status polls.

## API

All endpoints require the `multi-source-query` feature flag (on by default in
preview environments) and live under
`/api/v2/projects/{projectUuid}/query-sources`:

| Endpoint | Purpose |
| --- | --- |
| `GET /` | List registered sources |
| `GET /{sourceType}/schema` | Scan one source's schema into the standard `{tables: [{reference, columns: [{reference, type}]}]}` shape |
| `POST /query` | Submit one source query (body tagged by `sourceType`) → `queryUuid` |
| `POST /dags` | Submit a DAG → immediate `queryDagUuid` + node statuses |
| `GET /dags/{queryDagUuid}` | Poll DAG state; each node exposes its `queryUuid` once submitted |

Node results are fetched with the existing
`GET /api/v2/projects/{projectUuid}/query/{queryUuid}` endpoint. DAGs are
creator-only, mirroring query history access.

Example DAG body — two parallel sources merged by DuckDB:

```json
{
    "nodes": [
        { "nodeId": "orders", "query": { "sourceType": "sql", "sql": "SELECT ..." } },
        {
            "nodeId": "revenue",
            "query": { "sourceType": "semanticLayer", "query": { "exploreName": "payments", "...": "..." } }
        },
        {
            "nodeId": "merged",
            "query": {
                "sourceType": "duckdb",
                "sql": "SELECT * FROM o JOIN r USING (order_id)",
                "references": { "o": "orders", "r": "revenue" }
            }
        }
    ]
}
```

## Current limitations / next steps

- The `sql` source's schema scan lists tables from the cached warehouse
  catalog without column detail; the `duckdb` source scans empty (its tables
  are the references handed to each query). A richer, source-keyed catalog
  is a separate plan item.
- DAG orchestration is in-process on the API pod (like single async query
  execution); the scheduler-worker/NATS path is a follow-up if DAGs need to
  survive pod restarts mid-flight.
- Source management (per-project source instances, credentials, per-user
  auth) is out of scope here: the built-ins ride on the project's existing
  connections. The `QuerySourceClient` contract is the seam where per-source
  auth models will live without changing the query interface.
