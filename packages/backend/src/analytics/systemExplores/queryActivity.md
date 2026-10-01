# Query activity (Query Events)

This extends the existing **Query Events** Explore and `query_events` stream.
There is no extra nightly job, derived dataset, database migration or additional
query-history read. The existing usage capture flags, tenant scope, preview
exclusions, retention and missed-night compaction apply unchanged.

## Timing and counting

`response_time_ms` measures backend time to the query's outcome. Successful
queries include queueing, execution, result upload and persistence of READY;
cache hits include their lookup and READY persistence. Errors include persistence
of ERROR. It excludes client/network transfer, results pagination and rendering.
Use `status = success` when investigating successful dashboard response latency.

`response_timing_basis = request` starts at the authenticated request middleware,
before query preparation. Background callers without a request use
`query_submission`, starting when query history is created; this excludes earlier
compilation/cache lookup. Filter the basis to `request` for comparable end-to-end
backend latency. Average, p50, p90 and p95 response metrics ignore missing timing.

Warehouse execution time and its phase breakdown retain their existing meanings
and metrics. Cache hits still have zero warehouse time. One captured terminal
event remains one query: adding dimensions does not multiply counts. A failed
result upload now emits only an error completion, rather than a success followed
by an error. Cancellations, expirations and failures before the existing terminal
capture paths are not added to query totals by this change. Transport redelivery
is still counted under the existing event-count semantics.

## Attribution

- `dashboard_tile_id` distinguishes two tiles using the same saved chart; it is
  taken from the existing dashboard request and does not change cache keys.
- `workload_origin` identifies `interactive`, `scheduled`, `autorefresh`, `agent`,
  `app`, `mcp` or `unknown`. Explicit scheduler context takes precedence. Detailed
  execution context, cache hit and execution source remain available separately.
- API/CLI, totals and other ambiguous contexts remain unknown unless their parent
  supplies explicit scheduler/app attribution. Interactive describes the requested
  UI workflow; it is not proof a human initiated it. Actor type is separate.
- `initiating_actor_type` distinguishes registered users, service accounts and
  anonymous actors; the existing user ID and user-name join are unchanged.
- `request_id` is generated on the server. `parent_operation_id` uses an available
  scheduler job or trace identity. IDs are nullable when unavailable.
- `app_id` retains existing request app attribution. `app_version` is populated
  where the signed app-version provenance path already validates the version and
  access; other app queries retain a null version. No new token decoding, access
  checks or database lookup is introduced just for analytics.

Metadata is persisted in existing query-history JSON so a NATS worker or an
in-process executor sees the same initiating context. Client-supplied internal
metadata is overwritten. SQL, tokens, prompts and request headers are not added
to the event projection.

## Older data

Additive fields are null on old raw events, already compacted files and queued
queries without metadata. Managed Parquet views add a typed zero-row branch,
including when **all** retained files are old. This supplies absent columns
without adding rows. Neither history nor app versions are reconstructed. Existing
analytics projects must sync their cached Explore definitions before new fields
appear; queries using old definitions still work.

## Examples and validation

For customer question 16, open **Query Events**. Select Dashboard name, Dashboard
tile ID, Total queries, Average response time ms and P95 response time ms. Filter
Status to success and Response timing basis to request; sort P95 descending.
Add Cache hit to distinguish cache latency from warehouse-backed requests.

For question 18, group Total queries by Event ts day and Workload origin. Add
Initiating actor type, Context, App ID and App version to investigate a spike.
Keep the unknown group in totals. Existing Status/User and Execution source/Cache
hit breakdowns remain available for questions 17 and 19.

Run the bounded local native-DuckDB fixture from the repository root:

```sh
QUERY_ACTIVITY_SMOKE=1 pnpm -F backend test src/analytics/systemExplores/queryActivity.smoke.test.ts
```

The opt-in test needs the DuckDB `httpfs` extension (the managed reader installs
it when absent). It compacts 100,000 synthetic events, reads 100 historical rows, and runs compiled
Explore queries through the real managed Parquet reader over a loopback HTTP
fixture. It checks old-only and mixed schemas, all latency metrics, dimensions,
user joins and repeated reads. Files and the HTTP server are disposable; it does
not connect to production or write to shared object storage. Reported timings
measure synthetic local data, not production object-storage throughput.
