# View-Time Formatting Migration — Performance Instrumentation & Dashboard Plan

Status: proposed
Date: 2026-08-24
Related: Linear project "Standardize query results interface for viz"
(PROD-9829…9844), `01-design.md`, and the project's "moving
`ResultsRow.formatted` to view time" research note.

## Why this doc exists

The migration moves value formatting out of the backend query path and into
the client (and backend-terminal artifact generators). The current query path
— including formatting — has been heavily optimised (worker-thread formatter,
streamed S3 JSONL, lazy per-page formatting), and we will not accept a
regression in perceived query performance to buy architectural cleanliness.

This doc pins down, with code references:

1. exactly which hops of the query chain the migration changes,
2. what is already instrumented (our retroactive "before" baseline),
3. the small set of new instrumentation to ship **before** any behavior flag
   flips, and
4. a dashboard plan to compare before/after per cohort.

**Sequencing rule: the instrumentation PR lands and bakes for ≥2 weeks before
the first behavior change ships.** Comparisons are cohort-based (flag
on/off), not calendar-based, so seasonality and unrelated releases don't
pollute the read.

---

## 1. The chain, hop by hop

### Hop A — Execute → warehouse → S3 (unchanged by the migration; guardrail only)

`executeAsync*Query` → queue → `runAsyncWarehouseQuery` → stream rows to S3
JSONL. The only formatting on this hop is pivot **header** display values
(`formatItemValue` inside `AsyncQueryService.runQueryAndTransformRows`,
`packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts:2565`),
persisted to `query_history.pivot_values_columns`. Later phases of the project
recompute those client-side; the cost is per pivoted column, not per cell, so
this is a guardrail, not a target.

Already instrumented (nothing to add):

| Signal | Where |
|---|---|
| State transitions counter (`from`,`to`,`context`) | `AsyncQueryService.ts:1097,3075,3179` → `PrometheusMetrics.trackQueryStateTransition` |
| Queue wait histogram | `AsyncQueryService.ts:3184` |
| Warehouse duration + per-phase histograms (`warehouse_type`,`context`) | `AsyncQueryService.ts:3411,3417` (per-project variant gated by `queryPhaseMetrics.projectUuids`, `:3428`) |
| S3 results upload duration | `AsyncQueryService.ts:3509` (gated: pre-agg or `prometheus.allQueryMetricsEnabled`) |
| Total query duration | `AsyncQueryService.ts:3837` |
| `query.ready` / `query.completed` analytics (warehouseExecutionTimeMs, totalRowCount, columnsCount, isPivoted) | `AsyncQueryService.ts:3438,3459` |
| Durable per-query record | `query_history` (`warehouse_execution_time_ms`, `created_at`, `processing_started_at`, row/column counts) |
| Sentry spans | `query.execute.<source>` (`AsyncQueryService.ts:3383`), `s3.results.upload` (`:3492`) |

### Hop B — Results-page serve (THE hop the migration changes)

`GET /api/v2/projects/:projectUuid/query/:queryUuid` →
`getAsyncQueryResults` → `getResultsPageFromS3`
(`AsyncQueryService.ts:1001`): S3 download stream (`:1022`) → JSONL line
split → per-row `JSON.parse` + **`formatRow`** (`:1031-1041`; formatter bound
at `:1382-1389` with fields, pivotValuesColumns, displayTimezone) → JSON
response.

After the migration this hop stops calling `formatRow` and the response drops
every `formatted` string — the payload roughly halves for wide/numeric
results. This is where the backend win (CPU, latency, egress) must show up,
and where a silent regression would hide if S3 paging behavior were changed
at the same time.

Today's instrumentation measures the whole hop as **one blob**:
`measureTime` (`:1394`) → `results_cache.read` (`:1419`) and
`query_page.fetched` (`:1432`) analytics with `resultsPageExecutionMs`, also
returned to the client in `metadata.performance` (`:1484-1496`). The HTTP
envelope is separately covered by `http_server_request_duration_seconds`
(route-labeled, `packages/backend/src/prometheus/otelHttpMetrics.ts`, gated
`prometheus.httpMetricsEnabled`) — that pre-existing route histogram is our
**retroactive Prometheus baseline** for this hop.

Gaps: no download/parse/format phase split, no payload size anywhere, no
Prometheus histogram scoped to this operation (analytics events sample the
what, not the ops view).

### Hop C — Network transfer

Uninstrumented on both ends. The migration's biggest user-visible win is
probably here (smaller JSON, less decompression), and it's currently
invisible.

### Hop D — Frontend fetch/poll → first render

`useQueryResults.ts`: per-page `clientFetchTimeMs`
(`packages/frontend/src/hooks/useQueryResults.ts:415-425`),
`totalClientFetchTimeMs` (`:537-554`, includes backend
`initialQueryExecutionMs`), shown in `TileExecutionInfo` and tracked once per
tile as `DASHBOARD_CHART_LOADED`
(`packages/frontend/src/components/DashboardTiles/DashboardChartTile.tsx:695-712`)
with `warehouseExecutionTimeMs`, `totalTimeMs`, `totalResults`, `loadedRows`.
Sentry browser tracing is on (`hooks/thirdPartyServices/useSentry.ts`) with
route transactions and INP web vitals.

### Hop E — Frontend formatting/pivot/render (where the cost MOVES TO)

Entirely unmeasured today:

- Table cell formatting: `useColumns.tsx` (legacy backend-string
  `formatCellContent` vs view-time `formatResultsTableCell`) and
  `useTableConfig.ts` row model build.
- Client pivot in a web worker: `usePivotTableData.ts`
  (`pivotQueryResults` via `@shopify/react-web-worker`) — off-main-thread but
  its duration gates pivot table paint.
- Chart option builders (`formatItemValue`/`getFormattedValue` call sites in
  cartesian/pie/funnel/gauge configs).

The migration adds per-cell format work here (main thread unless we keep it
in workers). Risk concentrates on dashboards: N tiles × M cells formatting
concurrently on one main thread.

### Hop F — Sync v1 path (legacy; shrinking)

`ProjectService.runQueryAndFormatRows`
(`packages/backend/src/services/ProjectService/ProjectService.ts:6910`) with
the dedicated Sentry span `…formatRows` (`:6948`, attrs: rows, warehouse,
useWorker) and the >500-row worker thread (`:6954-6975`). Feeds `runQuery`,
view-chart endpoints, underlying data, and `EmbedService.getChartAndResults`
(`packages/backend/src/ee/services/EmbedService/EmbedService.ts:1673`).
Already span-instrumented — that span *is* the before-metric, and its
disappearance is the after. No new code needed; one Sentry dashboard panel.

Backend-terminal paths (CSV/Excel/Sheets scheduler jobs, pg-wire) keep
formatting server-side at artifact-generation time — out of scope for
before/after, they only need their existing job-duration telemetry.

---

## 2. Instrumentation to add

Design rules: every new signal carries a **`format_mode` dimension**
(`backend` = formatted rows shipped, `frontend` = raw + view-time
formatting), derived from the rollout flag, so before/after is a label
filter, not a date range. Backend histograms follow the existing
`PrometheusMetrics` pattern (nullable, config-gated, seconds). Frontend
timing events are sampled (e.g. 10%) — we need distributions, not a firehose.

### Backend

**B1 — Phase-split the results-page serve** (`getResultsPageFromS3`,
`AsyncQueryService.ts:1001-1046`). Restructure the loop to collect the raw
parsed rows for the requested window, then format the page in one timed
block:

- `stream_ms`: S3 open + JSONL iteration + `JSON.parse` for in-window lines
- `format_ms`: the `formatter` pass over the page (drops to ~0 after
  migration)
- `total_ms`: existing `measureTime` value, unchanged

New histogram in `PrometheusMetrics`:
`lightdash_results_page_duration_seconds{phase=stream|format|total, context,
format_mode}`, gated by `prometheus.allQueryMetricsEnabled` like the S3
upload histogram. Extend `query_page.fetched` +
`metadata.performance` with `formatRowsMs` and `cellCount`
(`rows.length × columnsCount` — the normalizer for every per-size
comparison).

**B2 — Response payload size.** Cheapest exact source is the HTTP layer:
an `on-headers`/`res.end` hook scoped to the v2 query routes recording
`content-length` into
`lightdash_results_page_response_bytes{context, format_mode}` and onto the
`query_page.fetched` event as `payloadBytes`. Do not `JSON.stringify` twice
to measure — take the length where serialization already happens.

**B3 — Nothing new for CPU/event-loop.** `collectDefaultMetrics`
(`PrometheusMetrics.ts:375`) already exports
`nodejs_eventloop_lag_*_seconds` and `process_cpu_*`; the dashboard just
needs panels + rollout annotations.

**B4 — Sync v1 formatRows**: already covered by the Sentry span (Hop F). Do
not add Prometheus here; the path is being deleted.

### Frontend

**F1 — View-time format cost.** Wrap the shared formatter entry points (the
M2 formatter; today `formatResultsTableCell` in `useColumns.tsx` and the row
model build in `useTableConfig.ts`) in a `Sentry.startSpan`
(`op: 'results.format'`, attrs: rows, columns, surface) plus a sampled
Rudderstack event `results_formatting.client` `{formatMs, rows, columns,
cellCount, surface: explorer|dashboard_tile|sql_runner|embed, format_mode}`.
Measure the batch (row-model build), never per cell.

**F2 — Pivot worker duration.** `performance.now()` around the worker call in
`usePivotTableData.ts`; attach as `clientPivotMs` to the same event/span.

**F3 — Extend `DASHBOARD_CHART_LOADED`**
(`DashboardChartTile.tsx:695`) with `clientFormatMs`, `clientPivotMs`,
`transferBytes` + `decodedBodyBytes` (from `PerformanceResourceTiming` for
the results-page fetches — exact, compression-aware, free), and
`format_mode`. Add the missing Explorer twin (`EXPLORE_RESULTS_LOADED`, fired
once per fresh query with the same shape + `totalClientFetchTimeMs`) so the
Explorer surface is comparable to dashboards.

**F4 — Interaction health.** No new code: Sentry already reports INP and
long-task data via browser tracing. Add a `page_type` tag
(`explorer|dashboard`) when the root transaction starts so INP can be split
by surface, and monitor p75 INP as the "did we melt the main thread"
guardrail.

---

## 3. Rollout & comparison methodology

1. **Ship instrumentation first** (B1–B2, F1–F4). Bake ≥2 weeks. This window
   *is* the "before" dataset, and `http_server_request_duration_seconds`
   plus `query_page.fetched` extend the baseline back further.
2. **Flag the behavior per project** (same flag that gates "stop shipping
   `formatted`"). Every new signal reads the flag into `format_mode`.
3. **Primary read: concurrent cohort comparison** — enabled vs. control
   projects over the same window, normalized by `cellCount` (format cost and
   payload scale with cells, and project mix differs). Secondary read:
   same-project 14 days pre / 14 days post enable.
4. **Guardrails (auto-rollback the flag if breached for 24h):**
   - Results-page `total` p95 (B1) worse for `frontend` cohort at matched cellCount
   - `DASHBOARD_CHART_LOADED.totalTimeMs` p75 regression > 10%
   - INP p75 on dashboards regression > 20%
   - Any increase in results-endpoint error rate
5. **Expected wins to confirm (if these don't move, investigate before
   proceeding to later milestones):** `format_ms` → ~0; payload bytes p50
   down 30–55% on numeric-heavy results; backend event-loop lag p95 down on
   API pods; Hop F worker-thread span volume trending to zero as v1 callers
   migrate.

---

## 4. Dashboard plan

Two dashboards + one Sentry view. Grafana answers "is the platform healthy /
did the backend win materialize"; the Lightdash dashboard (self-hosted
analytics project, Rudderstack events in the warehouse) answers "did users
get faster"; Sentry covers main-thread health and the dying v1 path.

### 4.1 Grafana — "Results serving: formatting migration" (Prometheus)

Layout top-to-bottom = the chain. Every panel split by `format_mode`, with
deploy/flag annotations.

| # | Panel | Query sketch | Expected after |
|---|---|---|---|
| 1 | Results-page serve p50/p95 by phase | `histogram_quantile(.95, sum by (le, phase, format_mode) (rate(lightdash_results_page_duration_seconds_bucket[5m])))` | `format` → ~0; `total` down |
| 2 | Format share of serve time | `format` sum / `total` sum | → 0% |
| 3 | Results route HTTP p95 (baseline series, predates B1) | `http_server_request_duration_seconds{http_route=~".*query/\\{queryUuid\\}"}` | down |
| 4 | Payload bytes p50/p95 | `lightdash_results_page_response_bytes` | down 30–55% |
| 5 | Event-loop lag p95 + CPU, API pods | `nodejs_eventloop_lag_p95_seconds`, `process_cpu_seconds_total` rate | down / flat |
| 6 | Guardrail: query total + warehouse duration | existing `observeQueryTotalDuration` / warehouse histograms | flat (execute path untouched) |
| 7 | Guardrail: S3 upload duration + queue wait | existing histograms | flat |
| 8 | Results endpoints error rate & 5xx | HTTP metric, status dimension | flat |

### 4.2 Lightdash — "View-time formatting rollout" (internal analytics)

Source events: `query_page.fetched` (+ new `formatRowsMs`, `payloadBytes`,
`cellCount`, `format_mode`), `results_formatting.client` (new),
`dashboard_chart_loaded` (+ new props), `explore_results_loaded` (new),
`query.completed`.

| # | Tile | Definition | Expected after |
|---|---|---|---|
| 1 | Page serve p50/p95, weekly | `resultsPageExecutionMs` by `format_mode` | down |
| 2 | Backend format ms per 10k cells | `formatRowsMs / cellCount` | → 0 |
| 3 | Tile time-to-loaded p75 | `dashboard_chart_loaded.totalTimeMs` by `format_mode` | flat→down |
| 4 | Client format ms per 10k cells, by surface | `results_formatting.client` | new cost — watch p95 tail |
| 5 | Client pivot ms p75 | `clientPivotMs` | flat |
| 6 | Transfer bytes p50 per 10k cells | `transferBytes / cellCount` | down |
| 7 | Slow-tile rate | % `dashboard_chart_loaded.totalTimeMs > 5000` | flat→down |
| 8 | Cohort delta table | per-project 14d-pre vs 14d-post: page-serve p95, tile p75, transfer p50 | drill-down for rollback decisions |
| 9 | Rollout coverage | distinct projects by `format_mode` | tracks flag rollout |

### 4.3 Sentry

- INP p75 by `page_type` (dashboard vs explorer), enabled cohort vs control —
  the main-thread guardrail.
- Span duration + volume for
  `ProjectService.runQueryAndFormatRows.formatRows` and `results.format`
  (F1): the first should trend to zero (v1 callers migrating), the second is
  the new cost's trace-level view with `useWorker`-style attrs for debugging
  outliers.

---

## 5. What could go wrong, and which panel catches it

| Risk | Catches it |
|---|---|
| Client formatting melts dashboards with many big tiles | 4.2 #3/#4/#7, Sentry INP |
| Backend win doesn't materialize (serve time dominated by S3 streaming, not formatting) | 4.1 #1/#2 — phase split proves where time actually goes |
| Payload doesn't shrink (compression already absorbed `formatted` redundancy) | 4.1 #4, 4.2 #6 |
| Regression blamed on migration is actually warehouse/queue drift | 4.1 #6/#7 guardrails isolate the untouched hops |
| Legacy v1 consumers silently degrade (embed) | Hop F span volume in Sentry; embed surface in `results_formatting.client` |
| Pivot header recompute (client) slower than persisted values | 4.2 #5 |
