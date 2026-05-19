# Timezone Questions — Specific Answers

Direct answers to the questions raised in the [timezone review](./timezone-review.md). Each answer is grounded in what the code actually does today, with `file:line` references. Where the answer is "we don't do this," that's stated explicitly.

Companion to [`timezone-handling.md`](./timezone-handling.md) (what we do) and [`timezone-review.md`](./timezone-review.md) (how it compares to industry).

---

## Source-type semantics

### When a column is declared `type: date` in YAML — do you trust it, or verify against `INFORMATION_SCHEMA`? What wins if they disagree?

**We trust the YAML.** `translator.ts:138` reads `meta.dimension?.type || column.data_type || DimensionType.STRING` — YAML `type:` wins, then the dbt-catalog `data_type`, then a string fallback. We never query `INFORMATION_SCHEMA` ourselves to verify.

**If YAML and warehouse disagree, YAML wins everywhere downstream**: SQL emission (`getSqlForTruncatedDate` branches on the declared type), formatting (`shouldShiftItemTimezone` reads the declared type), filter wrapping. The warehouse may return a TIMESTAMP at runtime even if YAML says DATE — that's a "timestamp leak" we discuss below.

**Stance**: same as Looker. Metabase trusts the warehouse. Our approach is correct for analyst-controlled semantic layers but produces silent wrong answers if `type:` is wrong.

### Are `TIMESTAMP_NTZ` / `TIMESTAMP_LTZ` / `TIMESTAMP_TZ` distinct first-class source types, or collapsed?

**Collapsed.** Lightdash has exactly two source types for time data: `DimensionType.DATE` and `DimensionType.TIMESTAMP` (`packages/common/src/types/field.ts`). All three Snowflake variants map to `TIMESTAMP`.

**Mitigation for Snowflake**: `translator.ts:152–154` wraps every Snowflake TIMESTAMP dimension with `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))`, which normalizes LTZ (session-local) and TZ (column-tagged) to UTC NTZ. NTZ values are assumed UTC unless `disableTimestampConversion: true`, at which point the wrap is skipped and `getColumnTimezone` falls back to `dataTimezone` (`projects.ts:321–331`).

**Snowflake pain points users will hit:**
- LTZ values from non-UTC sessions: normalized fine because the Snowflake wrap converts from session zone to UTC. Safe.
- NTZ stored in a local zone (e.g. `2024-01-15 09:00:00` meant to be Chicago time): the wrap reads it as UTC and silently shifts wrong. Workaround is `disableTimestampConversion: true` plus `dataTimezone: 'America/Chicago'`, which is a per-warehouse, not per-column, knob.
- TZ values with offsets across multiple zones in one column: the wrap converts everything to UTC, losing the original offset. Users who wanted to display in the original zone are out of luck.

### If a user writes `type: timestamp` but the column is actually `timestamptz`, do you double-convert? Loud or silent?

**Silent on most warehouses.** The wrap layer assumes the source is UTC (`sourceTimezone = 'UTC'` default in `timeFrames.ts:105, 171`). For a `timestamptz` column declared as `type: timestamp`:

- **Snowflake**: `CONVERT_TIMEZONE('UTC', target, col)` on a `TIMESTAMP_TZ` does what the user means — the function reads the column's stored offset. Behaves correctly *by accident*.
- **Postgres**: `(col)::timestamptz AT TIME ZONE 'target'` on a `timestamptz` source idempotently re-casts. No corruption, but the explicit `::timestamptz` cast is redundant.
- **BigQuery**: `TIMESTAMP_TRUNC(TIMESTAMP(col), part, 'tz')` on a `TIMESTAMP` source is fine. On a `DATETIME` source it coerces. No double-conversion.
- **Databricks/Trino/Athena**: rely on session-TZ semantics; declared type drives whether `from_utc_timestamp` is called. Mismatch can cause double-conversion silently.

**Failure mode is silent** in all cases — no warning, no error, just wrong numbers. Wrongness only shows up if the user notices "yesterday" is off by an hour.

### Can a user declare "this column is wall-clock in TZ X"?

**Not at the column level.** `dataTimezone` is per-warehouse (set on the connection — `projects.ts`), not per-column. Every NTZ column on that connection is assumed to be in `dataTimezone`. If you have one column in PT and another in ET on the same warehouse, you cannot express that today.

The closest workaround is `convert_timezone: false` per-dimension (translator.ts:219), but that's a *display* opt-out, not a wall-clock-tz declaration. The filter SQL still converts as if the value were in `dataTimezone`.

**This is a real gap** — flagged in [`timezone-review.md` section E](./timezone-review.md#e-the-datatimezone-is-an-unvalidated-user-assertion). Omni also lacks this. Per the research synthesis (research_on_timezones.md:256–262), this is the single highest-leverage feature to differentiate the design.

---

## The truncation type contract

### When a TIMESTAMP is truncated to day, the field type is `DATE`. Is that preserved across surfaces?

**Mostly yes, with one leak.** `timeFrameConfigs.DAY.getDimensionType` returns `DimensionType.DATE` (`timeFrames.ts:844`), and the compiled `Dimension.type` reflects that. Every surface that branches on `Dimension.type` sees DATE:

- **CSV / Excel / Google Sheets exports**: `formatItemValue` and `formatTemporalCellForSpreadsheet` switch on dimension type. DATE renders as `YYYY-MM-DD` (`formatting.ts`).
- **API responses**: `formatRows` runs before serialization with the resolved timezone. The API sees the formatted DATE string.
- **Frontend tables, tooltips, axis labels**: `formatItemValue` again. DATE branch.
- **SQL Runner**: this is the leak. The SQL Runner shows the raw warehouse output without going through `formatRows`. On Snowflake `DATE_TRUNC('day', col)` returns `TIMESTAMP_NTZ`, on Postgres it returns `timestamp without time zone`. So a user looking at SQL Runner output for a `..._day` dimension sees `2024-01-15 00:00:00` while the same query in Explore shows `2024-01-15`.

### For MONTH/WEEK/QUARTER, do you emit `CAST(DATE_TRUNC(...) AS DATE)` or just `DATE_TRUNC(...)`?

**Just `DATE_TRUNC(...)`.** No `::DATE` / `CAST AS DATE` is applied (`timeFrames.ts:315, 365` for Snowflake/Postgres respectively). The warehouse-returned column type is `TIMESTAMP_NTZ` (Snowflake), `timestamp without time zone` (Postgres), `TIMESTAMP` (BigQuery for TIMESTAMP source), or `DATE` (BigQuery for DATE source — the one warehouse that gets it right natively).

**Consequences:**
- **Downstream joins** on a `..._month` column in a sub-query will produce `TIMESTAMP = DATE` comparisons that implicit-cast on most warehouses but fail on stricter ones (Athena/Presto can be touchy).
- **CSV format consistency**: Lightdash *formats* the value before writing the CSV, so it lands as `2024-03-01`. But if a user uses SQL Runner to manually export, they get the warehouse's TIMESTAMP rendering.
- **`unionAll` / cross-query reuse**: type drift between two queries is a real risk.

**Why we don't cast**: the existing round-trip already produces a real UTC instant aligned to project-TZ midnight, and casting to DATE on Postgres/Snowflake without an explicit timezone clause would render that instant in the *session* zone, re-introducing the drift the round-trip exists to prevent. Casting is correct only when the value is genuinely a calendar date with no zone implication — which BigQuery's `DATE_TRUNC` already returns.

### Is the parent dimension's source type carried on every child time-interval dimension?

**Yes.** `translator.ts:158–159, 167–168` sets `timeIntervalBaseDimensionName` and `timeIntervalBaseDimensionType` on the child dim at compile time. These are read by:

- `getTimezoneAwareDimensionSql` (MetricQueryBuilder.ts) to decide whether to wrap (DATE base → skip).
- `shouldShiftItemTimezone` (formatting.ts) to decide whether to shift on display.
- `normalizeCellRawForFilter` to decide whether to shift cell clicks.
- `filtersCompiler.ts` to pick literal format for filter boundaries on DATE-base intervals.

So we *carry* the metadata. But we *re-derive* on top of it in five places (the duplicated-bypass concern in the review). Looker carries one type and routes all decisions off it; we route off the same data but via independent code paths.

---

## TZ precedence

### What are the layers and the precedence order?

`packages/common/src/utils/resolveQueryTimezone.ts`:

```
metricQuery.timezone   (per-chart pin)
  → user.timezone     (profile preference, if any)
    → project.queryTimezone
      → 'UTC'
```

This is the same order documented in [`timezone-handling.md:23`](./timezone-handling.md). Anonymous viewers (embeds, JWT, service accounts) skip the user layer (`getAccountUserTimezone(account)` returns null for them).

### Per-content choice like Looker's "Each Tile's TZ" vs "Viewer Time Zone"?

**Partially.** The per-chart pin in Explorer (chart-level `metricQuery.timezone`) corresponds to Looker's **"Each Tile's TZ"** — once set, every viewer sees that zone. An unpinned chart with `EnableUserTimezones=on` corresponds to Looker's **"Viewer Time Zone"** — each viewer's profile drives the resolution.

**What we don't have**: Looker's *author-saved-at-save-time* mode (the default "Each Tile's TZ"). In Looker, if an author in Pacific creates a chart, the chart silently inherits Pacific. We require the author to explicitly pin if they want viewer-stable behavior. This is more honest, slightly less ergonomic.

### Is there a user-TZ concept at all? What's the roadmap?

**Yes, today.** `users.timezone` (IANA string) is settable in Profile Settings → Default timezone, gated behind the `EnableUserTimezones` feature flag (`featureFlags.ts:12`). Stored in the database, validated server-side in `UserService.ts`, threaded through every authenticated query.

**Admin opt-in**: yes — `EnableUserTimezones` defaults off and can be toggled per-org via `feature_flag_overrides`. Like Looker's "User Specific Time Zones" admin setting and Omni's "Allow User-Specific Timezones" connection toggle.

**Sharp footgun**: turning the flag off does NOT clear stored `users.timezone` values, and `resolveQueryTimezone` honors them regardless of the flag (only the picker UI is gated). Flagged in [`timezone-review.md` Concern 1](./timezone-review.md#concern-1--feature-flag-entanglement-is-wide-and-underspecified). Fix it before any customer hits "I disabled the feature but it still applies."

### Scheduled deliveries & embeds — which TZ wins?

**Three independent timezones interact here.**

1. **`scheduler.timezone`** — when to send. A separate field on the scheduler row (`SchedulerClient.ts:872`). Used purely for cron parsing. Has nothing to do with query semantics.
2. **Query TZ for the scheduled report** — resolved via the normal chain, but the *user* is the schedule owner (or an impersonated account), so their profile TZ applies.
3. **Embed TZ** — embed viewers are anonymous; their `getAccountUserTimezone` returns null, so they fall through to the project default. Embed JWTs do not currently surface a user-TZ override.

**Why this matters**: an admin in NY sets up a daily 9am Pacific delivery (`scheduler.timezone = America/Los_Angeles`). The report queries fire at 9am PT but compute "last 7 days" in NY because that's the schedule owner's TZ. The recipient in Singapore reads numbers bracketed by NY midnight. This is the kind of cross-tz confusion the Metabase troubleshooting flowchart documents at length. **We don't have a doc for this.**

**Recommendation**: explicitly document the three timezones in a follow-up section to `timezone-handling.md`. Looker separates Application Time Zone (when) from Query Time Zone (what). We have the structure; we don't have the editorial.

---

## "Now" and relative filters

### Where is "now" resolved?

**Lightdash server, in Node.** `filtersCompiler.ts` uses `moment()` with `.tz(timezone)` for relative operators (`IN_THE_CURRENT`, `IN_THE_PAST`, etc. — see [`timezone-handling.md:188`](./timezone-handling.md)). Warehouse `CURRENT_TIMESTAMP` / `GETDATE()` is never used for relative-date computation. This matches Looker's behavior (research_on_timezones.md:33).

**Surface consistency**:
- **Interactive queries**: Node `moment()` in the resolved query TZ.
- **Scheduled queries**: same path, but the resolution chain runs with the schedule owner's user.
- **Embed queries**: same path, but `getAccountUserTimezone` returns null so it falls through to project TZ.
- **SQL Runner / user-written SQL**: `CURRENT_TIMESTAMP` runs on the warehouse against whatever session TZ we set. **Inconsistent with the rest** — a user who writes `WHERE created_at > NOW()` in SQL Runner does NOT get the same boundary as `IN_THE_CURRENT` in Explore.

This is the same gap Hex addresses with `hex_timezone` (research_on_timezones.md:190) — exposing the resolved TZ to user SQL. Flagged in [`timezone-review.md` section H](./timezone-review.md#h-no-sql-side-surface-for-the-resolved-tz).

### "Yesterday" filter on a DATE column — what's the literal?

**A bare date literal**, formatted server-side with `moment().utc().tz(timezone).format('YYYY-MM-DD')` ([`timezone-handling.md:213, 215`](./timezone-handling.md)). For an `order_date_month` (DATE base) dimension, you get:

```sql
WHERE order_date_month >= '2026-05-16' AND order_date_month < '2026-05-17'
```

No `timestamp` cast, no `+00:00` offset. The same boundary on a TIMESTAMP-base dimension would be:

```sql
WHERE created_at_day >= '2026-05-16 00:00:00+00:00' AND created_at_day < '2026-05-17 00:00:00+00:00'
```

The DATE-base bypass at `filtersCompiler.ts` is the same logic as the SELECT-side bypass — a DATE filter literal would anchor at midnight UTC and cross day boundaries in positive-offset zones, which is exactly the Metabase bug pattern at research_on_timezones.md:139.

### Alice in Tokyo, Bob in LA, same chart — same SQL?

**Depends on the chart and the flag.**

| Configuration | Alice's SQL == Bob's SQL? |
|---|---|
| `EnableUserTimezones=off`, no chart pin | ✅ Yes — both get project TZ |
| `EnableUserTimezones=off`, chart pinned to Pacific | ✅ Yes — pin wins |
| `EnableUserTimezones=on`, no chart pin, neither has profile TZ | ✅ Yes — both fall through to project |
| `EnableUserTimezones=on`, no chart pin, both have profile TZs | ❌ No — Alice's WHERE uses Tokyo bounds, Bob's uses LA bounds |
| `EnableUserTimezones=on`, chart pinned to Pacific | ✅ Yes — pin wins over profile |
| Dashboard date filter (absolute range) | ✅ Yes — absolute filters are UTC instants regardless of viewer |
| Dashboard date filter (relative — "last 7 days") | depends on the chart settings as above |

The dashboard-relative-filter case is the most surprising one to demonstrate to a customer: an absolute "Jan 1 → Jan 7" range produces identical SQL, but switching to "last 7 days" diverges if the flag is on. Worth a doc paragraph.

---

## The DATE column ambiguity

### For a stored DATE column with no TZ info, what's the semantic contract?

**(a) Wall-clock, untouched.** Lightdash assumes a DATE column is a calendar value with no TZ implication. The DATE-base bypass logic at `timeFrames.ts`, `filtersCompiler.ts`, `formatting.ts`, and `normalizeCellRawForFilter.ts` all rest on this assumption. There is no shift, no convert, no anchor — the value the warehouse stores is the value the user sees.

This matches Hex's "Represent dates as Date type" (research_on_timezones.md:192) and Looker's `datatype: date` (research_on_timezones.md:21). It diverges from Metabase, which historically treats DATE as `timestamp with time zone '...+TZ'` and produces the bugs at research_on_timezones.md:139.

### "Yesterday" on a DATE column — filter literal computed in project TZ or warehouse `CURRENT_DATE`?

**Project TZ, server-side.** `filtersCompiler.ts` computes `moment().utc().tz(projectTz).format('YYYY-MM-DD')` and emits a literal. We do not use `CURRENT_DATE`. So:

- Project TZ = America/New_York, server time = 2026-05-17 02:00 UTC → "yesterday" = `2026-05-16` (because it's still 2026-05-16 in NY).
- Project TZ = Asia/Tokyo, server time = 2026-05-17 02:00 UTC → "yesterday" = `2026-05-16` (we're at 11:00 JST on 2026-05-17).

If we used `CURRENT_DATE` on the warehouse instead, the answer would depend on the warehouse session TZ. We avoid that whole class of bug.

### Plans for a `wall_clock_timezone` annotation?

**Not on the roadmap that I can find.** Worth doing — flagged as a "real gap" in the review (section E). The implementation surface is small: a new column-level meta key like `meta.dimension.wall_clock_timezone: 'America/Los_Angeles'` that overrides `dataTimezone` per-dimension. Wires into `getColumnTimezone(credentials, dimension)` and threads through the existing `sourceTimezone` parameter chain in `timeFrames.ts`. Two engineering days at most.

---

## Filter target consistency

### Do filters always target the base column with truncation applied?

**Yes — confirmed.** `filtersCompiler.ts` and `MetricQueryBuilder.ts` apply the truncation/extract expression to the WHERE LHS, never to the truncated alias. The doc calls this "filter parity" at [`timezone-handling.md:139, 149`](./timezone-handling.md). This is the Sigma bug class (research_on_timezones.md:51) and we have explicitly avoided it.

### Dashboard date filters fanning out to charts at different granularities — one bracket or per-chart?

**Per-chart.** Each chart compiles its own WHERE clause, with its own wrap around its own dimension. A dashboard date filter passes the same `value` (e.g. an instant or a relative spec) to every chart, and each chart's `MetricQueryBuilder` produces its own SQL.

This is correct but has a perf cost — every chart computes its own bracket boundaries even though they're identical. For dashboards with 20 tiles, that's 20 redundant `moment.tz` calls server-side. Not a hot path, not worth optimizing yet.

### Cross-filter on a clicked bar — base column or truncated alias?

**Base column with truncation re-applied.** When a user clicks "March 2024" on a monthly chart, `MetricQueryDataProvider.tsx` calls `normalizeCellRawForFilter` which produces a filter rule against the *interval dimension* (e.g. `created_at_month`). The downstream `MetricQueryBuilder` then applies the project-TZ-aware truncation to the LHS when emitting WHERE.

So the filter is logically "where the truncated value equals 2024-03-01" but the SQL is "where DATE_TRUNC(col, month) = '2024-03-01'" — consistent with the SELECT, no alias trap.

For the click-to-filter shift specifically, `normalizeCellRawForFilter` only fires for time-interval DATE-on-TIMESTAMP-base dimensions ([`timezone-handling.md:226`](./timezone-handling.md)) — DATE-base intervals and `convert_timezone: false` columns pass through raw.

---

## SQL generation per warehouse

### Snowflake — `CONVERT_TIMEZONE` or `AT TIME ZONE`? `TO_DATE` wrap for date-grain frames?

- **TZ shift**: `CONVERT_TIMEZONE('source', 'target', col)` (`timeFrames.ts:106`). Snowflake doesn't support `AT TIME ZONE` — only Postgres-family does.
- **DATE_TRUNC return type**: Snowflake's `DATE_TRUNC('month', col)` returns `TIMESTAMP_NTZ`, not `DATE`. **We do not wrap with `TO_DATE()`** (`timeFrames.ts:314`). The "timestamp leak" applies — SQL Runner shows `2024-03-01 00:00:00.000`. `formatRows` corrects this for the API surface, but raw SQL output is a timestamp.
- **Snowflake-specific extra wrap**: `translator.ts:152–154` adds `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))` on every TIMESTAMP dimension at compile time. This normalizes LTZ/TZ to UTC NTZ before any per-query TZ logic runs.

### BigQuery — `TIMESTAMP_TRUNC` / `DATETIME_TRUNC` / `DATE_TRUNC` choice?

**Branched on declared type** (`timeFrames.ts:239–247`):
- `DimensionType.TIMESTAMP` with timezone → `TIMESTAMP_TRUNC(TIMESTAMP(col), part, 'tz')`
- `DimensionType.TIMESTAMP` without timezone → `TIMESTAMP_TRUNC(col, part)`
- `DimensionType.DATE` → `DATE_TRUNC(col, part)` (preserves DATE-from-DATE)

**We do not use `DATETIME_TRUNC`.** Comment at `timeFrames.ts:225–227` explicitly says "We intentionally do NOT wrap with DATETIME(..., tz) — that would strip the zone back to a naive wall-clock and mis-label it as UTC downstream." This is correct.

**The DATE-from-DATE preservation is one of the few places we're actually better than other warehouses** — BigQuery is the only warehouse where a DATE base column survives DATE_TRUNC as a DATE.

### Postgres / Redshift — `::date` cast after truncation?

**No.** `DATE_TRUNC('month', col)` on Postgres returns `timestamp without time zone`. No cast applied. The timestamp leak is present (`timeFrames.ts:365`).

The mitigation works for Lightdash's own surfaces because we know the field type and format accordingly. It bites users on SQL Runner export and on downstream tools that read the raw query results.

### DuckDB

**Matches Postgres.** `timeFrames.ts:117–120` uses identical `::timestamptz AT TIME ZONE` syntax. `DATE_TRUNC` returns timestamp. No `::date` cast. Pre-aggs built on DuckDB will have the same timestamp-leak behavior as Postgres-served queries.

---

## Pre-aggregates / caching

### User-TZ + pre-aggs — build per-TZ or skip on mismatch?

**Neither, and neither, and we should be clearer about it.** Per [`timezone-handling.md:68`](./timezone-handling.md), pre-aggregate materialization explicitly forces `userTimezone = null` regardless of the triggering account. The materialization SQL compiles against `chart.timezone ?? project.queryTimezone`, never the user's profile preference.

**Consequence**: every viewer sees a pre-agg computed in project TZ (or chart-pinned TZ). A user with `users.timezone = 'Asia/Tokyo'` sees bars bucketed by NY midnights if the project is NY, even though their other (non-materialized) charts respect Tokyo.

This is **simpler than Cube** (which materializes per `scheduled_refresh_time_zones`, research_on_timezones.md:120) but has a documented gap — there's no visible indicator on the chart that "your TZ was ignored because this is materialized."

### Bucket boundary on a pre-agg — project TZ's month or UTC's month?

**Project TZ's month.** Because the materialization compiles against the chart-or-project resolution and the underlying `DATE_TRUNC` is wrapped in the project-TZ round-trip, buckets land on project-TZ midnights. A viewer in a different TZ querying the materialization will see project-TZ bars rendered through whatever frontend formatting applies.

**Edge case nobody has tested**: what happens if a project TZ is changed *after* a materialization is built? The pre-agg has frozen-old-TZ buckets but new queries against it would expect new-TZ buckets. Probably nothing checks this. Worth a test.

---

## Week start, fiscal calendars

### Week start configurable?

**Yes, at the model level via dbt config** (`startOfWeek` passed into `timeFrameConfigs[...].getSql` — `timeFrames.ts:66, 360, 424, 491, 560`). Implemented per-warehouse via `bigqueryStartOfWeekMap` / interval-shift math / Snowflake's `WEEK_START` session variable.

**Scope**: model-wide, configurable via dbt YAML at the explore level. **Not per-user, not per-project, not per-dimension.** Matches Looker's `week_start_day` (research_on_timezones.md:25).

### Fiscal year start months / custom granularities (4-4-5 retail calendar)?

**Not supported.** Lightdash's `TimeFrames` enum is fixed at `MILLISECOND` through `YEAR` plus extract variants. No `fiscal_quarter`, no custom granularity definition like Cube 0.36+ (research_on_timezones.md:111). A modeler who needs fiscal-quarter buckets has to write a derived dimension manually.

This is a feature gap, not a TZ gap, but it's the kind of thing that interacts with TZ (a fiscal year starting "April 1 in NY" needs both a calendar boundary and a TZ boundary). Worth tracking as a separate request.

### Do extracts (`day_of_week_index`, `month_name`) honor project TZ?

**Yes — confirmed via the EXTRACT shift logic** at `timeFrames.ts:155–202`. Each `dateExtractsTimezoneConversions[warehouse].toExtractInputTz` shifts the input into the project zone *before* EXTRACT runs. So `EXTRACT(DOW FROM (col AT TIME ZONE 'America/New_York'))` rather than `EXTRACT(DOW FROM col)`.

The companion filter parity is also implemented ([`timezone-handling.md:149`](./timezone-handling.md)). A filter on `day_of_week_index = 1` matches the same project-TZ DOW the SELECT groups on.

**This is genuinely well done** — the easy mistake (running EXTRACT on the unconverted base column) is the one Looker users hit at the documented gotcha in research_on_timezones.md:37.

---

## Edge cases worth stress-testing

### DST boundaries — 23 or 25 hours in one bucket?

**Two different stories.**

1. **Server-side warehouse SQL**: handled correctly by the warehouse's native DST-aware functions. `CONVERT_TIMEZONE` / `AT TIME ZONE` / `TIMESTAMP_TRUNC(..., 'tz')` all produce real 23- or 25-hour days at DST boundaries. A "spring forward" Sunday in `America/New_York` correctly returns 23 hourly buckets, with the 2am hour missing.

2. **Frontend ECharts shift** (`packages/frontend/src/hooks/echarts/timezoneShift.ts`): **broken at DST boundaries.** The shift offset is computed *per row* (`getTimezoneOffsetMs(rawMs, timezone)`) but applied as a constant adjustment when ECharts renders. For an hour-grain chart spanning a DST transition, the bars before and after the transition use different offsets — visually correct in position but the gap between them looks like a 1-hour jump.

The internal doc does not mention DST. Flagged in [`timezone-review.md` section B](./timezone-review.md#b-the-echarts-shifted-column-workaround). Add a unit test that exercises 2024-03-10 (spring forward) and 2024-11-03 (fall back) for `America/New_York` to either prove or fix this.

### Half-hour / 45-minute timezones (India, Nepal, Australia)?

**Should work, but untested.** Our code path is dayjs/moment-tz on the Node side and warehouse-native on the SQL side. Both libraries handle half-hour zones natively (`Asia/Kolkata` is +05:30, `Asia/Kathmandu` is +05:45, `Australia/Eucla` is +08:45).

**Risk surfaces:**
- The ECharts shift math (`getTimezoneOffsetMs(rawMs, timezone)` → millisecond addition) — should be fine because dayjs returns minute-level offsets in milliseconds. Worth a smoke test.
- Excel serialization (`toExcelWallClockDate`) — works on the wall-clock components, so half-hour offsets land correctly.
- Filter literal formatting — `+05:30` suffix is valid in standard SQL TIMESTAMP literals on Postgres, Snowflake, Redshift, Databricks. **BigQuery's bare-literal path (no offset, `timezone-handling.md:208`) drops the offset entirely** — for a project in `Asia/Kolkata` with a BigQuery DATETIME filter, the boundary literal will be the local wall-clock time interpreted as session-TZ, which may or may not be IST depending on warehouse configuration.

**Recommendation**: add `Asia/Kolkata` to whatever timezone test matrix exists, if any.

### Historical TZ changes (Samoa 2011, Russia bunch)?

**Depends on the `moment-timezone` / `dayjs-tz` data bundled in the build.** Both libraries source from the IANA tz database; whatever version is pinned at install time is what we ship. This is **not pinned to a known-good version in `package.json`** that I can see — we pull whatever the latest minor allows.

**Impact**: low blast radius. A user querying for "Samoa, December 29, 2011" with the wrong tz data would see a 24-hour error for one date. Not worth pinning preemptively, but worth knowing: if a customer reports a "wrong day for historical Samoa data" bug, the fix is `pnpm update moment-timezone`.

### Pre-1970 or post-2038 dates?

**JS `Date` is 64-bit milliseconds, so the 2038 problem doesn't apply** at the JavaScript layer. Snowflake/BigQuery/Postgres all handle dates back to ~year 1 and forward past 9999. The exposure is:

- **Excel exports**: Excel's date epoch is 1900-01-01 with no negative support — pre-1900 dates render as the underlying serial number or `#NUM!`.
- **Database storage**: Lightdash uses Postgres for its own app DB (not warehouse), and Knex's Date handling is fine for normal ranges.
- **MySQL warehouses** (if we still support them): TIMESTAMP has a 1970–2038 limit. Use DATETIME instead.

Nothing in our codebase imposes a 32-bit unix timestamp limit that I found. The risk is downstream tools, not us.

### NULL timestamps — does "yesterday" exclude or slip through?

**Excluded — NULL doesn't satisfy `>=` or `<` comparisons in SQL.** Standard SQL three-valued logic: `NULL >= '2026-05-16'` is unknown, not true, so the row is excluded. Same on every warehouse we support.

The only place this could go wrong is if we ever emitted `IS NULL OR (col >= bound)` for some operator — we don't, but worth a test if anyone adds new filter operators.

---

## UX / observability

### Is the resolved TZ visible to chart viewers?

**Yes — a badge on the chart card** ([`timezone-handling.md:291`](./timezone-handling.md)). The chart header shows the resolved timezone so users can see "this chart is in America/New_York" without diving into settings. Roughly equivalent to Metabase's results-TZ chart banner (research_on_timezones.md:132).

### Different-TZ-viewer warning when user-TZ mode is off?

**No explicit warning.** A viewer in `Asia/Tokyo` looking at a project-NY chart sees the badge "America/New_York" — they have to mentally translate. We don't pop a banner saying "this chart is in someone else's TZ." Probably the right call (banner fatigue), but worth confirming the badge is prominent enough.

### Author per-content override (Looker "each tile" vs "viewer TZ")?

**Partial — only "pin to TZ X" exists.** A chart author can pin via the Explorer TZ picker, which behaves like Looker's "Each Tile's TZ" — every viewer sees the pinned zone. The complement (explicit "Viewer TZ" mode that's stronger than the user's profile) doesn't exist as a separate concept; an unpinned chart implicitly falls through to user-or-project, which is the same effect.

### SQL Runner / "view underlying SQL" showing TZ conversion?

**Yes — by construction.** Lightdash always shows the actual compiled SQL in the "View underlying SQL" affordance. The TZ conversion expressions (`CONVERT_TIMEZONE`, `AT TIME ZONE`, `TIMESTAMP_TRUNC` with explicit zone) appear in the SQL exactly as run. This is the single best debugging affordance for TZ issues and we have it for free.

The one gap: the resolved `queryTimezone` value itself isn't shown next to the SQL — you can infer it from the literals, but a "resolved TZ: America/New_York" label above the SQL panel would close the loop.

---

## The meta question

### What's the declared design intent — "consistent shape" or "viewer-local"?

**Both, depending on configuration.** Off the rack with `EnableUserTimezones=off`:
- Every viewer of a non-pinned chart sees project-TZ buckets → **consistent chart shape** (Sigma / Metabase model).

With `EnableUserTimezones=on`:
- Non-pinned charts shift per viewer → **viewer-local boundaries** (Looker viewer-TZ / Omni user-TZ model).
- Pinned charts override per viewer → **per-content choice** (Looker "Each Tile's TZ" model).

So the architectural intent is "support both, default to consistent." **This is not documented anywhere a customer can find.** Customers discover it via:
- The Profile Settings picker appearing or not appearing (depending on flag).
- The badge on the chart card showing "America/New_York" when their profile is Tokyo.
- "Why does my dashboard look different in Singapore than in NY?" support tickets.

**The single highest-leverage docs investment**: add a public-facing "How Lightdash handles timezones" doc that explains the three-mode behavior in two paragraphs. Looker has one. Sigma has one. Metabase has the troubleshooting flowchart. We have an internal `timezone-handling.md` for engineers, and nothing for customers.

---

## Quick reference: open follow-ups from these answers

| Issue | Severity | Effort | Location |
|---|---|---|---|
| ECharts DST shift bug | Correctness | 1d test + 2d fix | `packages/frontend/src/hooks/echarts/timezoneShift.ts` |
| `EnableUserTimezones=off` doesn't gate stored profile TZs | Correctness | 1d | `resolveQueryTimezone.ts` |
| Scheduled deliveries TZ interaction undocumented | Docs | 0.5d | `timezone-handling.md` |
| Per-column wall-clock TZ annotation | Feature | 2d | `translator.ts` + `getColumnTimezone` |
| BigQuery half-hour offset bare-literal hole | Correctness | 1d | `filtersCompiler.ts` |
| Pre-agg TZ-frozen-after-project-TZ-change behavior | Correctness | 1d test | materialization path |
| `${ldQueryTimezone}` SQL templating | Feature | 1w | `MetricQueryBuilder.ts` |
| Customer-facing "how Lightdash handles TZ" doc | Docs | 2d | new file in docs site |
| Timestamp leak in SQL Runner output | Polish | indef | warehouse `getSqlForTruncatedDate` |
| Half-hour TZ test coverage | Testing | 0.5d | test matrix |
| moment-timezone version pinning policy | Hygiene | 0.5d | `package.json` |
