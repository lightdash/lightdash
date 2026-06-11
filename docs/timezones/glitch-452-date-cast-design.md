# GLITCH-452 — Cast day-or-coarser DATE_TRUNCs to DATE at compile time

**Status:** design · **Flag:** `EnableTimezoneSupport` (TimezoneV2), default OFF · **Branch:** `feature/glitch-452` off `main`
**Depends on:** GLITCH-450 (merged, #24086) — the consolidated calendar-value predicate this ticket updates.

## Summary

Grouping a TIMESTAMP column by **day / week / month / quarter / year** currently emits a `TIMESTAMP` pinned to project-TZ midnight (a UTC instant). A downstream "format-correction layer" then shifts that instant back into the project timezone and chops the clock off so it *displays* as a calendar date. This ticket makes the warehouse emit a real `DATE` for those grains, so the warehouse type matches the metadata (`DATE`) and the correction layer can be deleted.

Ships behind `EnableTimezoneSupport` (default OFF) — no behavior change for anyone until a project opts in.

## Intuition (why this matters)

- **DATE** = a square on a calendar (`2026-03-03`), no clock, never shifts between zones.
- **TIMESTAMP** = an instant (`2026-03-03 14:30:00`), has a clock, shifts between zones.
- "Group by day" conceptually answers with a calendar square. Today the warehouse hands back a midnight *instant* and we un-shift it for display — fragile (DST, week boundaries, BigQuery-vs-Postgres semantics) and only correct for consumers that go through the formatter. 452 produces the calendar square directly.
- **User-visible impact is intentionally near-zero in the everyday grid** (the patch already makes it look right). The wins are: type integrity, raw-value consumers (SQL Runner, external BI, chart-as-code), and the DST/week/cross-warehouse edge cases the hand-rolled patch can't fully cover.

## Scope

**In scope**
- SELECT compile: cast day-or-coarser **TIMESTAMP-base** truncations to `DATE`.
- WHERE/filter compile: emit bare-date literals for those dimensions (reuse the existing DATE-base path).
- Formatting: remove the DATE-base-over-TIMESTAMP correction (collapse the calendar-value predicate).
- Wire value: `formatRawValue` emits `YYYY-MM-DD` for DATE columns so the API `raw` matches the type (see §4).
- Tests: per-adapter SQL snapshots, formatting unit tests, warehouse-execution smoke tests.

**Out of scope**
- Sub-day grains (HOUR / MINUTE / SECOND / MILLISECOND / RAW) — stay `TIMESTAMP`.
- DATE-base dimensions — already calendar values; unaffected.
- Pre-aggregate materialized column type (`buildPreAggregateExplore`) — **decision to confirm:** leave as-is in 452, track as follow-up.

## Design

### 1. SQL — the cast (core change)

**Where:** `packages/common/src/utils/timeFrames.ts` → `getSqlForTruncatedDate`.

Today the wrap-active branch does `toProjectTz(col) → DATE_TRUNC → toUTC` and returns a UTC instant:

```sql
-- Postgres, day grain, project tz = Asia/Tokyo (returns timestamptz):
DATE_TRUNC('day', "orders"."order_date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo'
```

452 **replaces the final `toUTC` step with a cast** for day-or-coarser grains:

```sql
-- after 452 (returns date):
CAST(DATE_TRUNC('day', "orders"."order_date" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tokyo') AS DATE)
```

> **The #1 trap:** cast the *project-wall-clock truncated value* (the input to `toUTC`), **not** the UTC instant. `CAST(<wall-clock> AS DATE)` and `CAST(<UTC instant> AS DATE)` are almost the same string but yield **different calendar dates**. So we drop `toUTC`, we don't wrap its output.

The wrap-inactive branch (UTC project / round-trip no-op) also casts the raw `DATE_TRUNC(...)` to DATE — output must be `DATE` per the AC regardless of zone.

**Gating:** thread a `castDayGrainToDate` boolean param (default `false`) into `getSqlForTruncatedDate`. Pass `true` from:
- `MetricQueryBuilder.getTimezoneAwareDimensionSql` — only reached when the flag is on; covers the SELECT and the WHERE LHS (filter parity).
- `QueryBuilder/utils.ts → getDimensionFromId` (date-zoom) — **decision to confirm:** include for consistency when the flag is on.

Default-`false` keeps the pre-aggregate and explore-compile callers unchanged.

**Grain check:** `truncatableTimeFrames.has(tf) && !isSubDayTimeFrame(tf)`.

**Per-adapter cast syntax** (`castAsDate` helper): default `CAST(x AS DATE)`; BigQuery `DATE(x)`. Verify and snapshot each: Postgres, Redshift, Snowflake, Databricks, Trino, Athena, DuckDB, ClickHouse.

### 2. Filters — bare date literals

The WHERE LHS reuses the SELECT expression, so after the cast it's a `DATE`. The literal must be a bare date to compare cleanly across dialects. The DATE-base path **already** emits bare-date literals (no `+00:00`, no `::timestamptz`); route day-or-coarser TIMESTAMP-base truncs through that same branch.

**Where:** `packages/common/src/compiler/filtersCompiler.ts`, `MetricQueryBuilder` filter rendering. **Verify:** equals, ranges, `IN_THE_PAST/NEXT/CURRENT`, `IN_PERIOD_TO_DATE`.

### 3. Formatting — delete the correction layer

**Where:** `packages/common/src/utils/formatting.ts`.

- `isCalendarValueDimension`: a DATE-base-TS dim is now a real calendar value → predicate collapses to `type === DATE`. *(This is the single update point GLITCH-450 was built to enable — see the Phase 1 milestone: "lands before the Phase 2 fixes so they have a single predicate to update.")*
- `shouldShiftItemTimezone`: drop the DATE-base-TS clause; only `TIMESTAMP` shifts.
- `formatItemValue` DATE branch then never shifts a `DATE` → `formatDate` receives a real date.
- **`MetricType.DATE` MIN/MAX** path does a `value instanceof Date` check; once `raw` is a `"2026-05-19"` string it falls through and skips date rendering — extend it to also accept date strings. *(Adjacent to the latent MIN/MAX-of-DATE bug noted in GLITCH-450.)*

**Flag-off safety (proven, not assumed):** the formatter only ever receives a timezone via `displayTimezone = enabled ? resolvedTimezone : null` (`AsyncQueryService.ts:2836`). Flag OFF → no timezone → the DATE branch never shifts regardless of the predicate. So this change is **bit-identical when the flag is off** and correct when it's on.

Downstream consumers of these predicates (CSV / Excel / Google Sheets exports, `normalizeCellRawForFilter` drill) stay correct: post-452 the raw value is a real date (flag-on), and flag-off supplies no timezone.

### 4. The `raw` wire value (`formatRawValue`)

**Where:** `packages/common/src/index.ts` → `formatRawValue` (the `raw` half of each `{ value: { raw, formatted } }` cell; `formatted` is unchanged).

Today the DATE branch runs `dayjs(value).utc(true).format()` and emits a full ISO timestamp, so the API returns `raw: "2026-05-19T00:00:00Z"` even though the column is `DATE`. After 452 the DATE branch must emit `YYYY-MM-DD` so `raw` is `"2026-05-19"` — **this is the actual mechanism** by which raw-value consumers (chart-as-code, Slack unfurls, scheduled deliveries, external BI) see the fix. Sub-day grains stay ISO.

> **Footgun:** warehouse adapters `parseCell()` a real DATE into a JS `Date`, and **Postgres returns it at *local* midnight, not UTC midnight**. Format the date's calendar components to `YYYY-MM-DD`; do **not** `.utc(true)` a local-midnight `Date` or you reintroduce the off-by-one this ticket removes.

### 5. Tests (three layers)

1. **SQL snapshots (per adapter)** — cast present, round-trip-back gone, sub-day unchanged, filter literals bare. `metricQueryBuilderSnapshots/`, `filtersCompiler.test.ts`. *Proves shape, all 7 dialects, no warehouse needed.*
2. **Formatting units** — predicate flips, DATE branch renders a real date without shifting, exports unchanged. `formatting.test.ts`. *Proves the patch is actually deleted.*
3. **Warehouse execution (one Lightdash project per warehouse)** — the only reliable way to test cross-warehouse TZ SQL. *Proves semantics, catches "right shape, wrong value."*
   - **Setup:** a local Lightdash project per warehouse — PG, BigQuery, Snowflake, Databricks, ClickHouse, Trino (creds in 1Password / `~/.dbt`) — pointed at the purpose-built **`timezone_test` model** (`raw_timezone_test.csv` seed; rows straddling midnight on ± offsets and DST). Query through the **v2 Query controller** (`POST /api/v2/projects/{uuid}/query/...`) and inspect both the compiled SQL and the returned cells.
   - **Timezone override:** pass **`metricQuery.timezone`** to override the project timezone per-query — no DB/settings change needed. Assert `fields[*].type === 'date'`, `raw` is `YYYY-MM-DD`, and the bucket lands on the expected calendar date.
   - **Test matrix:** `{ timezone } × { grain } × { rows near midnight }`. Pick offsets that flip the date: a `23:00Z` row buckets to the *next* day in `Asia/Tokyo` (+9) and the *previous* day in `Pacific/Pago_Pago` (−11); add a fractional offset (`Asia/Kolkata` +5:30). Derive each expected bucket date by hand from the raw value.
   - **Relative filters** (`IN_THE_PAST/NEXT/CURRENT`, period-to-date) on day-grain dims are in scope (AC) — test them too. ⚠️ The server resolves "now" in **its local clock**, and a non-UTC test zone can **cross a day boundary mid-session** (e.g. Tokyo already on tomorrow while you expected today), silently shifting expectations. Re-check the current time in the test zone when deriving expected ranges.

## Risks

- **Casting the instant instead of the wall-clock** → wrong date. Mitigated by dropping `toUTC` + the execution tests.
- **Per-adapter cast/DATE syntax** differences (BigQuery `DATE()`, Athena no `::`).
- **Filter-literal coercion** across warehouses (DATE vs literal).
- **Pre-aggregate** materialized column stays TIMESTAMP while the live query returns DATE — acceptable for 452, follow-up. DuckDB pre-agg caches read **both** `"...T00:00:00Z"` and `"2026-05-19"` into the same `DATE` (schema-typed read), so old caches don't break across the flag flip.
- **Postgres local-midnight `Date`** parsing footgun in `formatRawValue` (see §4).
- **Google Sheets export** is the one display path that could shift in unusual locales (it `String(value)`s the raw) — eyeball a delivery test before flipping the flag.
- **API consumers that match `raw` as an exact string** (logging, dedup keys, joins) **break**; consumers that `new Date(raw)` get a *bug fix*. This is the concrete "breaking" justification for the flag gate.
- **Corner:** `EnableTimezoneSupport` OFF + a chart-pinned non-UTC tz could still supply a display tz; pre-existing edge, document don't fix here.

## Verified low-impact (per issue codebase scan — GLITCH-452 comment, 2026-05-19)

Confirmed by a code walkthrough; both `raw` formats parse identically, so these need only a sanity check, not surgery:
- **Cell-click → filter rule** — reads `value.raw`, compiler runs `moment(value).format('YYYY-MM-DD')`; compiled SQL unchanged.
- **ECharts axes** — `DimensionType.DATE` stays a `'time'` axis (doesn't flip to categorical); both formats parse to the same instant.
- **CSV / Excel** — already branch on type; become correct by construction.

> The comment's file/line references predate ~40 commits of merged timezone work — treat them as leads and **re-verify against current `main`**. Its "wrap `DATE_TRUNC(...)` in `CAST(... AS DATE)`" is the naive framing; our refinement (cast the wall-clock, drop `toUTC` — §1) supersedes it.

## Customer-doc alignment

The published draft (`docs/timezones/draft-user-documentation.md` / docs.lightdash.com/timezones-draft) is **consistent but doesn't explicitly document this change**: it says day-or-coarser grouping "buckets data by calendar boundaries," that `DATE` values "never shift," and its custom-SQL example ends in `::date`. It does **not** state that built-in day-grain dimensions change warehouse output type — that explicit statement lives in the internal design doc (`timezones-v2-design.md`, principle 13, `gap-date-grain-output`). No customer-doc change needed for 452.

## Flag-gating invariant (hard requirement)

Every behavior here is **100% gated behind `EnableTimezoneSupport`**. Flag OFF ⇒ Lightdash behaves **exactly** as before this ticket — byte-identical SELECT / WHERE / `raw` / `formatted` / exports / ECharts. This is an explicit acceptance criterion, not a nicety: the cast, the `formatRawValue` change, and the predicate collapse must all be inert when the flag is off. (Formatting half is inert because flag-off supplies no `displayTimezone`; the SQL/`raw` halves are gated by `useTimezoneAwareDateTrunc` upstream — verify both with a flag-off snapshot.)

## Docs to update

`docs/timezones/timezone-handling.md` (engineer-facing current-state reference) describes the DATE_TRUNC round-trip as "returns a real UTC instant" and the `formatDate` DATE-base correction — both change here. Update those sections (*SELECT — DATE_TRUNC grouping*, *Result formatting*, the DATE-base callouts) as part of 452 so the doc stays the source of truth. Improve it where it's thin rather than leaving it stale.

## Rollout

Behind `EnableTimezoneSupport`, default OFF (v2 Phase 2). **Enable per single user first** (not whole org) until results are confirmed — keeps expectations realistic and makes turning it off quick/low-impact. Phase 3 (later) flips the default org-wide and removes the old path.
