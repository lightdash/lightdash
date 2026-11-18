# Performance

## Review

- **Worst case:** slow or costly only for the largest customers, after release.
  Cloud tenants share Postgres, so one org's load slows others.
- **Evidence:** judge it against the limits in code: `query.maxLimit` 5000 rows, `maxPageSize` 2500, `csvCellsLimit` 100000, `pivotTable.maxColumnLimit` 200, dashboards with dozens of tiles across many tabs, and version tables that grow with every save.
- **N+1:** a database or warehouse query inside a loop, or a join that multiplies rows (versioned tables, correlated joins, wide JSON reads).
  Fix when it grows with customer data.
- **polling:** pending-state paths (async query poll, embeds, tabs) do no auth or database work per poll and back off with jitter; a warehouse stall must not become a Postgres stall.
- **unbounded:** a query, response or cache without a limit, pagination or eviction. Heads-up.
  When a limit bites, the user is told.
- **fan-out:** parallel calls against a real limit (warehouse concurrency, `TileQueryQueue`, DuckDB slots per org and per process); slots release on every path, and caps queue with a timeout instead of failing tiles that start together.
- **database load:** new bulk, scheduled or cleanup work and new pools fit a shared instance (connections, CPU); no migration or heavy work on the pod startup path.
- **event loop:** per-row synchronous work on result streams yields in bounded batches.
- **hung work:** warehouse and DuckDB calls have a first-row and a total timeout; Postgres reads over user history run under `statement_timeout`.
  A poll timeout does not stop the warehouse query.
- **warehouse cost:** extra warehouse queries or a bypassed results cache.
- **indexes:** new `WHERE`, `JOIN`, `ORDER BY` and foreign-key columns are indexed (cascade deletes scan unindexed foreign keys); `ILIKE '%x%'` needs a trigram index; no casts or JSON-path filters that defeat an index; indexes on big tables are created `CONCURRENTLY` with lock timeouts.
- **frontend:** re-renders or large payloads on a hot path, and polling that runs in every open tab.
- **memory:** per-run buffers times concurrent runs fit; DuckDB and Parquet caps hold for wide results and name the cause when hit; per-process limits are stated as such when several pods run.

## Impact

- **breaking:** growing data/user/tile cost hits a previously working limit.
- **notable:** measurable cost change on a common path.
- **minor:** small or rare-path cost change.

## Diff

```ts
type PerformanceDiff = Diff & {
    direction: "cheaper" | "costlier";
};
```

- **Name:** the path as users or ops know it (`dashboard open`, `GET …/charts`).
- **Note:** what is counted and what it grows with (`one query per tile`).
- **Granularity:** one diff per path whose cost moves.

```json
{ "lens": "Performance", "change": "modified", "impact": "notable", "name": "dashboard open", "note": "one query per tile, not per filter", "direction": "cheaper" }
```
