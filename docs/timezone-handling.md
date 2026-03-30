# Timezone Handling in Lightdash — Current State

This document describes how timezone handling works in Lightdash today, covering the full path from warehouse query to user display.

---

## Timezone Concepts

There are six distinct timezone concepts in the codebase:

| Concept | What it is | Current behavior |
|---------|-----------|-----------------|
| **Data timezone** | The timezone raw data was written in at the warehouse (e.g., NTZ columns in Snowflake) | Unknown to Lightdash — always assumed to be UTC |
| **Session timezone** | The warehouse connection's timezone setting. Affects how the warehouse interprets ambiguous timestamps (NTZ) and displays LTZ values | Hardcoded to `'UTC'` for all warehouses |
| **Project timezone** | Project-level setting in DB (`projects.query_timezone`). Intended to control filter boundaries, grouping, and display | Exists in DB but only affects 2 of 5 relative date filter operators |
| **Chart timezone** | Per-chart override (`metricQuery.timezone`). Behind `EnableUserTimezones` feature flag | Stored but ignored during query compilation |
| **Process timezone** | Node.js server's system timezone | `'UTC'` in production Docker containers (by convention) |
| **Browser timezone** | End user's local machine timezone | Detected via `dayjs.tz.guess()`, not used for data display |

---

## Snowflake Timestamp Types

Snowflake has three timestamp types that behave differently with timezone operations. Lightdash wraps all three with the same `CONVERT_TIMEZONE('UTC', col)` call.

| Type | Stores TZ? | What's stored | How `CONVERT_TIMEZONE('UTC', col)` behaves | How session timezone affects it |
|------|-----------|---------------|-------------------------------------------|-------------------------------|
| **TIMESTAMP_NTZ** | No | Wall clock time, no TZ info | Interprets as session TZ (UTC), converts to UTC — **no-op** | If session were non-UTC, Snowflake would reinterpret the value |
| **TIMESTAMP_LTZ** | Implicitly | Stored as UTC internally, displayed in session TZ | Converts from session TZ (UTC) to UTC — **no-op** | If session were non-UTC, display would shift |
| **TIMESTAMP_TZ** | Yes (explicit offset) | Stored with offset, e.g. `09:00:00 +10:00` | Converts from stored offset to UTC — **actually works** | Not affected — stored offset takes precedence |

Since the session timezone is always UTC, `CONVERT_TIMEZONE('UTC', col)` is effectively a no-op for NTZ and LTZ. It only does real work for TZ columns with non-UTC offsets.

---

## Layer 1: Warehouse Session Setup

### Snowflake
**File:** `packages/warehouses/src/warehouseClients/SnowflakeWarehouseClient.ts`

When a Snowflake connection is opened, the client runs:
```sql
ALTER SESSION SET TIMEZONE = 'UTC';
```

The code accepts an `options.timezone` parameter but no caller ever passes one. The session timezone is always UTC.

### Postgres
**File:** `packages/warehouses/src/warehouseClients/PostgresWarehouseClient.ts`

Plumbing exists to run `SET timezone TO '<tz>'` if `options.timezone` is provided, but no caller passes it. Defaults to the server's timezone (typically UTC in containers).

### Databricks
**File:** `packages/warehouses/src/warehouseClients/DatabricksWarehouseClient.ts`

Plumbing exists to run `SET TIME ZONE '<tz>'` if `options.timezone` is provided, but no caller passes it.

### DuckDB
**File:** `packages/warehouses/src/warehouseClients/DuckdbWarehouseClient.ts`

Plumbing exists to run `SET TimeZone = '<tz>'` if `options.timezone` is provided, but no caller passes it.

### Trino / Athena
**File:** `packages/warehouses/src/warehouseClients/TrinoWarehouseClient.ts`

Plumbing exists to run `SET TIME ZONE '<tz>'` if `options.timezone` is provided, but no caller passes it.

### ClickHouse
**File:** `packages/warehouses/src/warehouseClients/ClickhouseWarehouseClient.ts`

Plumbing exists to set `clickhouse_settings.timezone` on the query request if `options.timezone` is provided, but no caller passes it.

### Other warehouses
BigQuery, Redshift — no session timezone handling exists.

---

## Layer 2: SQL Generation — Timestamp Conversion

### CONVERT_TIMEZONE wrapper (Snowflake only)
**File:** `packages/common/src/compiler/translator.ts`

When a dimension has type `TIMESTAMP`, the translator wraps it:
```sql
TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', <column>))
```

The `convertTimezone()` function accepts `default_source_tz` and `target_tz` parameters, but both are hardcoded to `'UTC'`:
```typescript
sql = convertTimezone(sql, 'UTC', 'UTC', targetWarehouse);
```

The function has `// todo: implement target_tz` and `// todo: implement default_source_tz` comments.

### `disableTimestampConversion` escape hatch
**File:** `packages/common/src/types/projects.ts`

A per-warehouse-connection boolean (`disableTimestampConversion`) can be set to skip the `convertTimezone()` call entirely. When `true`, TIMESTAMP dimensions use the raw column SQL with no wrapping. This is the main workaround for customers where the Snowflake conversion causes incorrect results (e.g., when all data is already in UTC and the conversion double-converts).

**Per-warehouse behavior:**
- **Snowflake**: `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))` — the only warehouse with conversion
- **All others** (BigQuery, Postgres, Redshift, Databricks, Trino, DuckDB, ClickHouse, Athena): return the raw column SQL with no conversion

### DATE_TRUNC (time dimension grouping)
**File:** `packages/common/src/utils/timeFrames.ts`

When grouping by day/week/month/etc, each warehouse generates its own DATE_TRUNC variant:
- Snowflake: `DATE_TRUNC('DAY', col)`
- BigQuery: `DATE_TRUNC(col, DAY)`
- Postgres: `DATE_TRUNC('day', col)`

**Timezone is never applied to DATE_TRUNC.** There is no wrapping like `DATE_TRUNC('DAY', CONVERT_TIMEZONE('America/New_York', col))`. Grouping boundaries are always in UTC.

---

## Layer 3: Filter Compilation

**File:** `packages/common/src/compiler/filtersCompiler.ts`

The `renderDateFilterSql()` function accepts a `timezone` parameter. However, only 2 of 5 relative date filter operators use it:

### Uses timezone:
- **`IN_THE_CURRENT`**: Uses `.tz(timezone).startOf(unitOfTime).utc()` to calculate boundaries in the project timezone, then converts to UTC for the WHERE clause
- **`NOT_IN_THE_CURRENT`**: Same pattern

### Does NOT use timezone:
- **`IN_THE_PAST`**: Uses `moment().startOf(unitOfTime)` — no `.tz()` call, uses process timezone (UTC in production)
- **`NOT_IN_THE_PAST`**: Same — no timezone
- **`IN_THE_NEXT`**: Same — no timezone

### How timezone is resolved
**File:** `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`

The timezone passed to filter compilation comes from `getQueryTimezoneForProject()`:
```
project.query_timezone → LIGHTDASH_QUERY_TIMEZONE env var → 'UTC'
```

The middle step (`LIGHTDASH_QUERY_TIMEZONE`) is parsed in `packages/backend/src/config/parseConfig.ts` and allows self-hosted deployments to set a server-wide default without configuring each project.

`metricQuery.timezone` (the per-chart override) is NOT used — the service always resolves via the project setting.

### Absolute date filters ignore timezone entirely

Absolute filter operators (`EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `IN_BETWEEN`, etc.) pass the user's input value straight through `dateFormatter()` with no timezone conversion. If a user in New York enters "2024-03-28 09:00:00" in a filter, it goes into the SQL as `('2024-03-28 09:00:00')` — compared directly against UTC-stored data. The frontend also hardcodes a `Z` suffix when serializing Date objects in `packages/frontend/src/utils/dateFilter.ts`, forcing UTC interpretation regardless of user intent.

---

## Layer 4: Query Execution

**File:** `packages/backend/src/services/AsyncQueryService/AsyncQueryService.ts`

When executing a query, the `executeAsyncQuery` call does NOT pass timezone to the warehouse client:
```typescript
warehouseClient.executeAsyncQuery({
    sql: query,
    tags: queryTags,
    // timezone is NOT passed here
});
```

This means even though the warehouse clients (Snowflake, Postgres, Databricks) can accept a timezone parameter for session setup, they never receive one. The session timezone is always UTC.

---

## Layer 5: Result Formatting (Backend)

**File:** `packages/common/src/index.ts`

`formatRow()` transforms each warehouse result row into a `ResultRow` with two values per cell:

### Raw value (`formatRawValue`)
```typescript
// For timestamps: returns UTC ISO string
dayjs(value).utc(true).format()  // e.g., "2024-01-15T14:30:00Z"

// For non-timestamps: returns the raw value unchanged
```

### Formatted value (`formatItemValue`)
**File:** `packages/common/src/utils/formatting.ts`

For timestamps, calls `formatTimestamp()`:
```typescript
const momentDate = convertToUTC ? moment(value).utc() : moment(value);
return momentDate.format('YYYY-MM-DD, HH:mm:ss:SSS (Z)');
```

`convertToUTC` is hardcoded to `false` when called from `formatRow()`, so formatting uses the **process timezone** (UTC in production containers).

The function has no parameter for an arbitrary timezone — it can only do "as-is" or "convert to UTC".

---

## Layer 6: API Response

**File:** `packages/common/src/types/results.ts`

The API returns `ResultRow` objects:
```json
{
  "order_date": {
    "value": {
      "raw": "2024-01-15T14:30:00Z",
      "formatted": "2024-01-15, 14:30:00:000 (+00:00)"
    }
  }
}
```

No timezone metadata is included in the response. The frontend doesn't know what timezone the data was formatted in.

---

## Layer 7: Frontend Display

### Tables
**File:** `packages/frontend/src/components/common/Table/ScrollableTable/BodyCell.tsx`

Table cells display the `formatted` value from the API response directly — no additional conversion.

### Chart tooltips
**File:** `packages/common/src/visualizations/helpers/valueFormatter.ts`

Chart tooltips re-format using the `raw` value with `convertToUTC=true`:
```typescript
getFormattedValue(rawAxisValue, xFieldId, itemsMap, true);
```

This converts to UTC via `moment(value).utc()` before formatting.

### Chart axes
**File:** `packages/frontend/src/hooks/echarts/useEchartsCartesianConfig.ts`

ECharts config hardcodes `useUTC: true`, forcing all time axes to display in UTC. Axis label formatting uses a mix of ECharts built-in formatting and callbacks that call `formatItemValue`.

---

## Layer 8: Scheduled Deliveries

**File:** `packages/backend/src/scheduler/SchedulerTask.ts`

Scheduled deliveries (email, Slack) execute queries through the same `AsyncQueryService` pipeline. The scheduler has its own `timezone` field on the scheduler config, but this only controls **when** the cron job fires — not **how** the query runs.

Query results in scheduled deliveries are formatted using the same `formatRow` path (process timezone / UTC).

---

## End-to-End Example

**Setup:** Project timezone = `America/New_York` (UTC-4 during EDT), Snowflake warehouse, user filters "In the current month" (March)

1. **Session timezone**: `ALTER SESSION SET TIMEZONE = 'UTC'` — always UTC, project timezone ignored
2. **CONVERT_TIMEZONE**: `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))` — no-op for NTZ/LTZ
3. **Filter compilation (IN_THE_CURRENT)**: Correctly uses project timezone — March 1 00:00 New York → March 1 04:00 UTC as filter boundary
4. **DATE_TRUNC**: `DATE_TRUNC('MONTH', col)` — truncates in UTC, not New York time
5. **Display formatting**: `moment(value).format(...)` — formats in process timezone (UTC)

### The mismatch:
The filter says "show me data from the current month in New York time" but DATE_TRUNC groups by "month in UTC". A row at March 1 02:00 UTC (= Feb 28 22:00 New York):
- **Fails** the filter (it's before "current month" in New York, which starts at March 1 04:00 UTC)
- **Groups** into March (DATE_TRUNC in UTC puts it in March)

Filter boundaries and grouping boundaries disagree on what "the current month" means.

### For IN_THE_PAST filters:
If a user sets project timezone to New York and filters "in the last 7 days", the filter boundaries are calculated using `moment().startOf('day')` without `.tz('America/New_York')` — so they use process timezone (UTC), ignoring the project setting entirely.

---

## Summary of Gaps

| # | What | Expected behavior | Actual behavior |
|---|------|-------------------|-----------------|
| 1 | `IN_THE_PAST` / `NOT_IN_THE_PAST` / `IN_THE_NEXT` filters | Use project timezone for boundaries | Use process timezone (UTC) |
| 2 | `metricQuery.timezone` | Override project timezone in query compilation | Ignored — only used for cache key generation |
| 3 | DATE_TRUNC grouping | Respect project timezone for day/week/month boundaries | Always truncates in UTC |
| 4 | Display formatting | Format timestamps in project timezone | Formats in process timezone (UTC) |
| 5 | Session timezone | Set to project/data timezone | Hardcoded to UTC |
| 6 | `CONVERT_TIMEZONE` target | Convert to project timezone | Hardcoded to UTC |
| 7 | Non-Snowflake warehouses | Have timestamp conversion equivalent | No conversion at all |
| 8 | API response | Include timezone metadata | No timezone info in response |
| 9 | Scheduled deliveries | Use project timezone for query and formatting | Use UTC for everything |
| 10 | NTZ data in non-UTC timezone | Interpret correctly via data timezone setting | Assumed UTC — silently wrong |
| 11 | Absolute date filter values | Interpreted in project/user timezone | Used as-is — compared against UTC data with no conversion |
| 12 | `disableTimestampConversion` | Documented escape hatch with clear semantics | Undocumented boolean that silently skips all timestamp conversion |
| 13 | Timezone picker coverage | Full IANA timezone list | ~28 predefined zones in `TimeZone` enum (`packages/common/src/types/timezone.ts`), though the API validates against the full IANA set |

---

## Implementation Considerations

Things to keep in mind when changing timezone handling in this codebase.

| Concern | Details |
|---------|---------|
| Timestamp type safety | Snowflake errors on `TIMESTAMP_TZ` vs `TIMESTAMP_NTZ` comparisons. Any SQL conversion wrapping must produce consistent types on both sides of comparisons. |
| Conversion performance | Wrapping every timestamp dimension with `CONVERT_TIMEZONE` can slow queries. Consider only converting fields used in filters or grouping, not all selected fields. The `disableTimestampConversion` / `convert_tz: false` escape hatch exists for individual dimensions. |
| Category vs point-in-time display | Grouped data across timezones: categorical charts (pie, bar) should label the grouping bucket, time series charts should plot at the actual point in time. Be intentional about whether a date value is a category label or a position on a continuous axis. |
| SQL vs in-memory date math | Filter boundaries can be computed in application code and passed as literals (easier to test and reason about) or via SQL truncation (may perform better on large datasets). Currently a mix of both — pick one approach and be consistent. |
