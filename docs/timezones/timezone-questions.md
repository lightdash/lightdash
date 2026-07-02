# Timezone Questions — Specific Answers

Direct answers to the questions raised in the [timezone review](./timezone-review.md). Each answer is grounded in what the code actually does today, with `file:line` references. Where the answer is "we don't do this," that's stated explicitly.

Companion to [`timezone-handling.md`](./timezone-handling.md) (what we do) and [`timezone-review.md`](./timezone-review.md) (how it compares to industry).

---

## Source-type semantics

### When a column is declared `type: date` in YAML — do you trust it, or verify against `INFORMATION_SCHEMA`? What wins if they disagree?

**We trust the YAML.** `translator.ts:138` reads `meta.dimension?.type || column.data_type || DimensionType.STRING` — YAML `type:` wins, then the dbt-catalog `data_type`, then a string fallback. We never query `INFORMATION_SCHEMA` ourselves to verify.

**If YAML and warehouse disagree, YAML wins everywhere downstream**: SQL emission (`getSqlForTruncatedDate` branches on the declared type), formatting (`shouldShiftItemTimezone` reads the declared type), filter wrapping. The warehouse may return a TIMESTAMP at runtime even if YAML says DATE — that's a "timestamp leak" we discuss below.

**Stance**: trust the semantic layer over the warehouse. This is correct for analyst-controlled semantic layers but produces silent wrong answers if `type:` is wrong.

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

The closest workaround is `convert_timezone: false` per-dimension (translator.ts:219). It opts the column out of conversion entirely — display, grouping, *and* filtering all use the raw stored value — so a pre-converted, already-local column is never shifted. It is still not a wall-clock-tz *declaration*: you cannot say "interpret this column as zone X and convert from it," so a single NTZ column genuinely stored in a non-default zone that still needs conversion is not expressible.

**This is a real gap** — flagged in [`timezone-review.md` section E](./timezone-review.md#e-the-datatimezone-is-an-unvalidated-user-assertion). Per the research synthesis, this is the single highest-leverage feature to differentiate the design.

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

So we *carry* the metadata. But we *re-derive* on top of it in five places (the duplicated-bypass concern in the review). The metadata is the single source of truth; we route off the same data but via independent code paths, which is what the consolidation gap aims to fix.

---

## TZ precedence

### What are the layers and the precedence order?

`packages/common/src/utils/resolveQueryTimezone.ts`:

```
sessionTimezone        (embed ?timezone= URL param, embed sessions only)
  → metricQuery.timezone   (per-chart pin)
    → user.timezone     (profile preference, if any)
      → project.queryTimezone
        → 'UTC'
```

This is the same order documented in [`timezone-handling.md:23`](./timezone-handling.md). Anonymous viewers (embeds, JWT, service accounts) skip the user layer (`getAccountUserTimezone(account)` returns null for them); embedded sessions may set the top-priority `sessionTimezone` via the `?timezone=` URL param.

### Per-content choice between a pinned TZ and a viewer TZ?

**Partially.** The per-chart pin in Explorer (chart-level `metricQuery.timezone`) gives an **author-pinned** mode — once set, every viewer sees that zone. A chart pinned to `user_timezone` with `EnableTimezoneSupport=on` gives a **viewer-TZ** mode — each viewer's profile drives the resolution.

**What we don't have**: an *author-saved-at-save-time* default that silently inherits the author's zone. We require the author to explicitly pin if they want viewer-stable behavior. This is more honest, slightly less ergonomic.

### Is there a user-TZ concept at all? What's the roadmap?

**Yes, today.** `users.timezone` (IANA string) is settable in Profile Settings → Default timezone, gated behind the `EnableTimezoneSupport` feature flag. Stored in the database, validated server-side in `UserService.ts`, threaded through every authenticated query.

**Admin opt-in**: yes — `EnableTimezoneSupport` defaults off and can be toggled per-org via `feature_flag_overrides`.

**Flag-off behavior**: turning the flag off does NOT clear stored `users.timezone` values, but they are no longer applied — when `EnableTimezoneSupport` is off, the surrounding query pipeline (warehouse session setup, timezone-aware `DATE_TRUNC`, returning `displayTimezone`) is short-circuited, so the resolved zone is not applied to the query. The stored preference is preserved (non-destructive) and re-applies when the flag is turned back on.

### Scheduled deliveries & embeds — which TZ wins?

**Three independent timezones interact here.**

1. **`scheduler.timezone`** — when to send. A separate field on the scheduler row (`SchedulerClient.ts:872`). Used purely for cron parsing. Has nothing to do with query semantics.
2. **Query TZ for the scheduled report** — resolved via the normal chain, but the *user* is the schedule owner (or an impersonated account), so their profile TZ applies.
3. **Embed TZ** — embed viewers are anonymous; their `getAccountUserTimezone` returns null. An embedded session can carry a per-session query TZ via the `?timezone=<IANA>` embed URL param, threaded in as the top-priority `sessionTimezone` argument (wins over the chart pin); absent that param it falls through to the project default. The signed JWT itself still has no timezone field.

**Why this matters**: an admin in NY sets up a daily 9am Pacific delivery (`scheduler.timezone = America/Los_Angeles`). The report queries fire at 9am PT but compute "last 7 days" in NY because that's the schedule owner's TZ. The recipient in Singapore reads numbers bracketed by NY midnight. This is the kind of cross-tz confusion that warrants explicit documentation. **We don't have a doc for this.**

**Recommendation**: explicitly document the three timezones in a follow-up section to `timezone-handling.md` — separating the application time zone (when a delivery fires) from the query time zone (what the numbers mean). We have the structure; we don't have the editorial.

---

## "Now" and relative filters

### Where is "now" resolved?

**Lightdash server, in Node.** `filtersCompiler.ts` uses `moment()` with `.tz(timezone)` for relative operators (`IN_THE_CURRENT`, `IN_THE_PAST`, etc. — see [`timezone-handling.md:188`](./timezone-handling.md)). Warehouse `CURRENT_TIMESTAMP` / `GETDATE()` is never used for relative-date computation.

**Surface consistency**:
- **Interactive queries**: Node `moment()` in the resolved query TZ.
- **Scheduled queries**: same path, but the resolution chain runs with the schedule owner's user.
- **Embed queries**: same path, but `getAccountUserTimezone` returns null, so it falls through to project TZ unless the `?timezone=` embed URL param sets a per-session timezone.
- **SQL Runner / user-written SQL**: `CURRENT_TIMESTAMP` runs on the warehouse against whatever session TZ we set. **Inconsistent with the rest** — a user who writes `WHERE created_at > NOW()` in SQL Runner does NOT get the same boundary as `IN_THE_CURRENT` in Explore.

The fix is to expose the resolved TZ to user SQL as a template variable. Flagged in [`timezone-review.md` section H](./timezone-review.md#h-no-sql-side-surface-for-the-resolved-tz).

### "Yesterday" filter on a DATE column — what's the literal?

**A bare date literal**, formatted server-side with `moment().utc().tz(timezone).format('YYYY-MM-DD')` ([`timezone-handling.md:213, 215`](./timezone-handling.md)). For an `order_date_month` (DATE base) dimension, you get:

```sql
WHERE order_date_month >= '2026-05-16' AND order_date_month < '2026-05-17'
```

No `timestamp` cast, no `+00:00` offset. The same boundary on a TIMESTAMP-base dimension would be:

```sql
WHERE created_at_day >= '2026-05-16 00:00:00+00:00' AND created_at_day < '2026-05-17 00:00:00+00:00'
```

The DATE-base bypass at `filtersCompiler.ts` is the same logic as the SELECT-side bypass — a DATE filter literal would otherwise anchor at midnight UTC and cross day boundaries in positive-offset zones, the classic off-by-one-day bug.

### Alice in Tokyo, Bob in LA, same chart — same SQL?

**Depends on the chart and the flag.**

| Configuration | Alice's SQL == Bob's SQL? |
|---|---|
| `EnableTimezoneSupport=off`, no chart pin | ✅ Yes — both get project TZ |
| `EnableTimezoneSupport=off`, chart pinned to `user_timezone` | ✅ Yes — flag off, both fall back to project TZ |
| `EnableTimezoneSupport=on`, no chart pin | ✅ Yes — both get project TZ |
| `EnableTimezoneSupport=on`, chart pinned to `user_timezone`, neither has profile TZ | ✅ Yes — both fall through to project |
| `EnableTimezoneSupport=on`, chart pinned to `user_timezone`, both have profile TZs | ❌ No — Alice's WHERE uses Tokyo bounds, Bob's uses LA bounds |
| `EnableTimezoneSupport=on`, chart pinned to Pacific | ✅ Yes — pin wins over profile |
| Dashboard date filter (absolute range) | ✅ Yes — absolute filters are UTC instants regardless of viewer |
| Dashboard date filter (relative — "last 7 days") | depends on the chart settings as above |

The dashboard-relative-filter case is the most surprising one to demonstrate to a customer: an absolute "Jan 1 → Jan 7" range produces identical SQL, but switching to "last 7 days" diverges if the flag is on. Worth a doc paragraph.

---

## The DATE column ambiguity

### For a stored DATE column with no TZ info, what's the semantic contract?

**(a) Wall-clock, untouched.** Lightdash assumes a DATE column is a calendar value with no TZ implication. The DATE-base bypass logic at `timeFrames.ts`, `filtersCompiler.ts`, `formatting.ts`, and `normalizeCellRawForFilter.ts` all rest on this assumption. There is no shift, no convert, no anchor — the value the warehouse stores is the value the user sees.

A DATE is a calendar value, not an instant — anchoring it to midnight in some zone and converting between zones is the classic way to make a date "slip" by a day around midnight. Lightdash refuses to do this.

### "Yesterday" on a DATE column — filter literal computed in project TZ or warehouse `CURRENT_DATE`?

**Project TZ, server-side.** `filtersCompiler.ts` computes `moment().utc().tz(projectTz).format('YYYY-MM-DD')` and emits a literal. We do not use `CURRENT_DATE`. So:

- Project TZ = America/New_York, server time = 2026-05-17 02:00 UTC → "yesterday" = `2026-05-16` (because it's still 2026-05-16 in NY).
- Project TZ = Asia/Tokyo, server time = 2026-05-17 02:00 UTC → "yesterday" = `2026-05-16` (we're at 11:00 JST on 2026-05-17).

If we used `CURRENT_DATE` on the warehouse instead, the answer would depend on the warehouse session TZ. We avoid that whole class of bug.

### Plans for a `wall_clock_timezone` annotation?

**Now tracked for v3 (GLITCH-463), not yet built.** Flagged as a "real gap" in the review (section E). The implementation surface is small: a new column-level meta key like `meta.dimension.wall_clock_timezone: 'America/Los_Angeles'` that overrides `dataTimezone` per-dimension. Wires into `getColumnTimezone(credentials, dimension)` and threads through the existing `sourceTimezone` parameter chain in `timeFrames.ts`. Two engineering days at most.

---

## Filter target consistency

### Do filters always target the base column with truncation applied?

**Yes — confirmed.** `filtersCompiler.ts` and `MetricQueryBuilder.ts` apply the truncation/extract expression to the WHERE LHS, never to the truncated alias. The doc calls this "filter parity" at [`timezone-handling.md:139, 149`](./timezone-handling.md). Filtering on the alias instead is a well-known bug class we have explicitly avoided.

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

This is **simpler than materializing per-TZ refreshes**, but has a documented gap — there's no visible indicator on the chart that "your TZ was ignored because this is materialized."

### Bucket boundary on a pre-agg — project TZ's month or UTC's month?

**Project TZ's month.** Because the materialization compiles against the chart-or-project resolution and the underlying `DATE_TRUNC` is wrapped in the project-TZ round-trip, buckets land on project-TZ midnights. A viewer in a different TZ querying the materialization will see project-TZ bars rendered through whatever frontend formatting applies.

**Edge case nobody has tested**: what happens if a project TZ is changed *after* a materialization is built? The pre-agg has frozen-old-TZ buckets but new queries against it would expect new-TZ buckets. Probably nothing checks this. Worth a test.

---

## Week start, fiscal calendars

### Week start configurable?

**Yes, at the model level via dbt config** (`startOfWeek` passed into `timeFrameConfigs[...].getSql` — `timeFrames.ts:66, 360, 424, 491, 560`). Implemented per-warehouse via `bigqueryStartOfWeekMap` / interval-shift math / Snowflake's `WEEK_START` session variable.

**Scope**: model-wide, configurable via dbt YAML at the explore level. **Not per-user, not per-project, not per-dimension.**

### Fiscal year start months / custom granularities (4-4-5 retail calendar)?

**Not supported.** Lightdash's `TimeFrames` enum is fixed at `MILLISECOND` through `YEAR` plus extract variants. No `fiscal_quarter` or user-defined custom granularities. A modeler who needs fiscal-quarter buckets has to write a derived dimension manually.

This is a feature gap, not a TZ gap, but it's the kind of thing that interacts with TZ (a fiscal year starting "April 1 in NY" needs both a calendar boundary and a TZ boundary). Worth tracking as a separate request.

### Do extracts (`day_of_week_index`, `month_name`) honor project TZ?

**Yes — confirmed via the EXTRACT shift logic** at `timeFrames.ts:155–202`. Each `dateExtractsTimezoneConversions[warehouse].toExtractInputTz` shifts the input into the project zone *before* EXTRACT runs. So `EXTRACT(DOW FROM (col AT TIME ZONE 'America/New_York'))` rather than `EXTRACT(DOW FROM col)`.

The companion filter parity is also implemented ([`timezone-handling.md:149`](./timezone-handling.md)). A filter on `day_of_week_index = 1` matches the same project-TZ DOW the SELECT groups on.

**This is genuinely well done** — the easy mistake (running EXTRACT on the unconverted base column) is a common gotcha and we get it right.

---

## Edge cases worth stress-testing

### DST boundaries — 23 or 25 hours in one bucket?

**Two different stories.**

1. **Server-side warehouse SQL**: spring-forward is handled correctly and uniformly. `CONVERT_TIMEZONE` / `AT TIME ZONE` / `TIMESTAMP_TRUNC(..., 'tz')` all return 23 hourly buckets for a "spring forward" Sunday in `America/New_York`, with the 2am hour missing, on every warehouse. **Fall-back (the 25-hour day) is NOT uniform** across warehouses, see "DST fall-back" below.

2. **Frontend ECharts shift** (`packages/frontend/src/hooks/echarts/timezoneShift.ts`): **broken at DST boundaries.** The shift offset is computed *per row* (`getTimezoneOffsetMs(rawMs, timezone)`) but applied as a constant adjustment when ECharts renders. For an hour-grain chart spanning a DST transition, the bars before and after the transition use different offsets — visually correct in position but the gap between them looks like a 1-hour jump.

The internal doc does not mention DST. Flagged in [`timezone-review.md` section B](./timezone-review.md#b-the-echarts-shifted-column-workaround). The frontend half is now fixed: sub-day and DAY+ grains both shift onto the project wall-clock timeline via the companion column (GLITCH-449 → GLITCH-509), so the two folded hours render correctly and ECharts places native adaptive ticks on real day boundaries. The fall-back bucketing question below is now resolved (merge, GLITCH-509) — see that section.

### DST fall-back — do the two 1 AM hours merge into one bucket or split into two?

> **Resolved — standardized on merge (GLITCH-504 decision + GLITCH-509 fix).** All warehouses now collapse the fold into one `count=2` bucket. The analysis below documents the pre-fix divergence and why merge was chosen; the "verified 2026-06-12" table is the *before* state. BigQuery and ClickHouse were moved off instant-domain truncation to merge like the rest.

At a fall-back the local clock hits 1 AM twice. The two hours are wall-clock-identical but are genuinely distinct instants an hour apart (New York 2024-11-03: `01:00 EDT` = `05:00Z` and `01:00 EST` = `06:00Z`). Whether an HOUR `DATE_TRUNC` produces one bucket or two **used to diverge by warehouse** (now unified on merge):

Verified 2026-06-12 (pre-GLITCH-509) by querying the fold pair at HOUR + count, project TZ `America/New_York` (via `POST /api/v2/projects/{uuid}/query/metric-query`):

| Warehouse | Result | Buckets |
| --- | --- | --- |
| BigQuery, ClickHouse | **SPLIT** | two `01:00` rows (`05:00Z` and `06:00Z`), count 1 each |
| Postgres, Snowflake, Databricks, Trino | **MERGE** | one `01:00` row, count 2 |
| Redshift, DuckDB, Spark | **MERGE** (by the same route, not re-tested) | one `01:00` row, count 2 |

So a 25-hour fall-back day renders as 25 distinct hourly buckets on BigQuery/ClickHouse but as 24 (with one double-counted hour) on the merge warehouses.

**This is our SQL, not a warehouse property.** It is decided entirely by whether our per-adapter conversion in `dateTruncTimezoneConversions` (`timeFrames.ts:94`) lands the value in the **naive wall-clock domain** or the **instant domain** before `DATE_TRUNC` runs:

- **Merge route**: `toProjectTz` strips the offset first. Postgres `(col)::timestamptz AT TIME ZONE 'tz'` yields a `timestamp WITHOUT time zone`; Snowflake wraps in `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', ...))`. Both 1 AMs become the bare `01:xx:00` and `GROUP BY` collapses them.
- **Split route**: BigQuery `TIMESTAMP_TRUNC(col, part, 'tz')` and ClickHouse `toTimeZone(...)` truncate in the instant domain, so the two instants stay distinct.

The same warehouse can do either. Postgres merges with our `AT TIME ZONE` route but **splits** with 3-arg `date_trunc(unit, ts, 'tz')` (available since PG12), confirmed locally. So the divergence is an artifact of our conversion map, not intrinsic warehouse behavior on identical SQL.

**Which is "correct"? — decided: merge.** Under Lightdash's wall-clock contract (group by the local wall-clock hour), **merge is the contract-consistent answer**: both folds are "1 AM" locally, so they belong in one bucket. By that reading the merge warehouses honored the contract and BigQuery/ClickHouse leaked instant-domain semantics. The opposite reading (a fall-back day really has 25 hours, so splitting is the truthful representation) is defensible for precise time-series, but Lightdash made the deliberate call to **merge everywhere** (GLITCH-504) and moved BigQuery/ClickHouse onto the naive-domain route (GLITCH-509).

**Fixability is asymmetric, but split is not blocked.** Unifying on **merge** is cheap and convergent: the naive route is always expressible, and only BigQuery/ClickHouse change. Unifying on **split** is costlier, not impossible: BigQuery/ClickHouse are native and Postgres 12+ has the 3-arg `date_trunc`, but Redshift and Spark/Databricks have no native zone-aware truncation (session-zone-naive timestamps), so a portable split needs hand-rolled offset arithmetic (verified working on Databricks). It also rewrites bucketing SQL on 8 adapters plus a display-label disambiguation, versus 2 adapters for merge. Either direction invalidates cache keys and historical results for every hour/day query.

Tracked as `gap-dst-fold-bucketing` in [`timezones-v2-design.md`](./timezones-v2-design.md) — **resolved (merge)**, shipped in GLITCH-509. The merge route was chosen precisely because it is convergent across all 8+ adapters; the costlier split route (blocked on Redshift/Spark native support) was rejected.

### Half-hour / 45-minute timezones (India, Nepal, Australia)?

**Verified working (GLITCH-453).** Our code path is dayjs/moment-tz on the Node side and warehouse-native on the SQL side. Both libraries handle half-hour zones natively (`Asia/Kolkata` is +05:30, `Asia/Kathmandu` is +05:45, `Australia/Eucla` is +08:45).

**Risk surfaces:**
- The ECharts shift math (`getTimezoneOffsetMs(rawMs, timezone)` → millisecond addition) — should be fine because dayjs returns minute-level offsets in milliseconds. Worth a smoke test.
- Excel serialization (`toExcelWallClockDate`) — works on the wall-clock components, so half-hour offsets land correctly.
- Filter literal formatting — `+05:30` suffix is valid in standard SQL TIMESTAMP literals on Postgres, Snowflake, Redshift, Databricks. On BigQuery/ClickHouse the literal is bare (no offset, `timezone-handling.md:208`), but `formatTimestampAsUTCNoOffset` has already converted it to the UTC instant, so the offset is baked in, not dropped — the fractional boundary is correct. (The separate DATETIME/NTZ no-session-TZ limitation applies to non-UTC *stored* data, not to filter boundaries.)

**Coverage**: `Asia/Kathmandu` (+05:45) and `Pacific/Marquesas` (-09:30) sub-day buckets are asserted in `packages/api-tests/tests/queryTimezone.test.ts` on both Postgres and BigQuery.

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

**Yes — a badge on the chart card** ([`timezone-handling.md:291`](./timezone-handling.md)). The chart header shows the resolved timezone so users can see "this chart is in America/New_York" without diving into settings.

### Different-TZ-viewer warning when user-TZ mode is off?

**No explicit warning.** A viewer in `Asia/Tokyo` looking at a project-NY chart sees the badge "America/New_York" — they have to mentally translate. We don't pop a banner saying "this chart is in someone else's TZ." Probably the right call (banner fatigue), but worth confirming the badge is prominent enough.

### Author per-content override (pinned-TZ vs explicit viewer-TZ)?

**Partial — only "pin to TZ X" exists.** A chart author can pin via the Explorer TZ picker — every viewer then sees the pinned zone. The complement (an explicit "Viewer TZ" mode that's stronger than the user's profile) doesn't exist as a separate concept; an unpinned chart implicitly falls through to user-or-project, which is the same effect.

### SQL Runner / "view underlying SQL" showing TZ conversion?

**Yes — by construction.** Lightdash always shows the actual compiled SQL in the "View underlying SQL" affordance. The TZ conversion expressions (`CONVERT_TIMEZONE`, `AT TIME ZONE`, `TIMESTAMP_TRUNC` with explicit zone) appear in the SQL exactly as run. This is the single best debugging affordance for TZ issues and we have it for free.

The one gap: the resolved `queryTimezone` value itself isn't shown next to the SQL — you can infer it from the literals, but a "resolved TZ: America/New_York" label above the SQL panel would close the loop.

**The output is raw by design — we don't auto-convert it.** SQL Runner results bypass `formatRows`, so timestamps render as raw UTC ISO 8601 (`2026-01-15T09:30:00.000Z`) regardless of project timezone. This is intentional: custom SQL can return any shape, so Lightdash will *not* apply the project timezone to SQL Runner / SQL-chart output. The supported path for users who want conversion is the `${ldQueryTimezone}` template variable ([GLITCH-462](https://linear.app/lightdash/issue/GLITCH-462), v3) — they write the conversion in their own SQL without hardcoding a zone; [GLITCH-466](https://linear.app/lightdash/issue/GLITCH-466) additionally labels the resolved TZ next to the compiled SQL.

The residual friction: SQL Runner serializes every timestamp via a JS `Date` → ISO 8601 `Z` string, regardless of the value's real zone, so it both ignores the data/session TZ and misrepresents the value. Verified on Postgres with the warehouse session at Pacific/Pago_Pago (UTC−11):

| Expression | SQL Runner shows | Warehouse `::text` / `to_char` |
| ---------- | ---------------- | ------------------------------ |
| `'2026-06-09 12:00:00+00'::timestamptz` | `2026-06-09T12:00:00.000Z` | `2026-06-09 01:00:00-11` |
| `... AT TIME ZONE 'America/New_York'` | `2026-06-09T08:00:00.000Z` | `2026-06-09 08:00:00` |

The first row shows a TZ-aware value collapsed to the UTC instant with the offset dropped; the second shows a naive (converted) wall-clock stamped with a false `Z`. Either way the rendering misrepresents the value, and casting to text is the only faithful workaround.

Verified on Snowflake too: `CONVERT_TIMEZONE('America/New_York', '2026-06-09 12:00:00 +00:00'::timestamp_tz)` returns a `TIMESTAMP_TZ` of `08:00:00 -04:00`, but SQL Runner displays `2026-06-09T12:00:00.000Z` — *identical* to the unconverted value, so the 2-arg conversion looks completely inert; `TO_CHAR(...)` confirms the real `2026-06-09 08:00:00 -04:00`. (Note Snowflake `TIMESTAMP_TZ` keeps the literal's own offset rather than the session zone, so on Snowflake the drop shows up as this converted-looks-inert case rather than as a session-offset divergence.) Making SQL Runner render timestamps faithfully is tracked as [GLITCH-489](https://linear.app/lightdash/issue/GLITCH-489) (v3), separate from GLITCH-462.

---

## The meta question

### What's the declared design intent — "consistent shape" or "viewer-local"?

**Both, depending on configuration.** Off the rack with `EnableTimezoneSupport=off`:
- Every viewer sees project-TZ buckets → **consistent chart shape**.

With `EnableTimezoneSupport=on`:
- Charts pinned to `user_timezone` shift per viewer → **viewer-local boundaries**.
- Charts pinned to a specific zone override per viewer → **per-content choice**.

So the architectural intent is "support both, default to consistent." **This is not documented anywhere a customer can find.** Customers discover it via:
- The Profile Settings picker appearing or not appearing (depending on flag).
- The badge on the chart card showing "America/New_York" when their profile is Tokyo.
- "Why does my dashboard look different in Singapore than in NY?" support tickets.

**The single highest-leverage docs investment**: add a public-facing "How Lightdash handles timezones" doc that explains the three-mode behavior in two paragraphs. We have an internal `timezone-handling.md` for engineers, and nothing for customers.

---

## Quick reference: open follow-ups from these answers

| Issue | Severity | Effort | Location |
|---|---|---|---|
| ~~ECharts DST shift bug~~ ✅ fixed (GLITCH-449 → 509: all grains shift via companion column) | Correctness | 1d test + 2d fix | `packages/frontend/src/hooks/echarts/timezoneShift.ts` |
| ~~`EnableTimezoneSupport=off` doesn't gate stored profile TZs~~ ✅ fixed | Correctness | 1d | `resolveQueryTimezone.ts` |
| Scheduled deliveries TZ interaction undocumented (GLITCH-465, v3; drafted in `draft-user-documentation.md`) | Docs | 0.5d | `timezone-handling.md` |
| Per-column wall-clock TZ annotation (GLITCH-463, v3) | Feature | 2d | `translator.ts` + `getColumnTimezone` |
| ~~BigQuery half-hour offset bare-literal hole~~ ✅ not a bug (literal is a pre-converted UTC instant) | Correctness | 1d | `filtersCompiler.ts` |
| Pre-agg TZ-frozen-after-project-TZ-change behavior (**untracked — no ticket**) | Correctness | 1d test | materialization path |
| `${ldQueryTimezone}` SQL templating (GLITCH-462, v3) | Feature | 1w | `MetricQueryBuilder.ts` |
| Customer-facing "how Lightdash handles TZ" doc (GLITCH-457, Phase 3; drafted in `draft-user-documentation.md`) | Docs | 2d | new file in docs site |
| SQL Runner output is raw UTC ISO by design; conversion is user-driven via `${ldQueryTimezone}`. In-SQL `CONVERT_TIMEZONE` only shows once cast to string | Feature | v3 | GLITCH-462 (`${ldQueryTimezone}` var) |
| ~~Half-hour TZ test coverage~~ ✅ added (Postgres + BigQuery) | Testing | 0.5d | `queryTimezone.test.ts` |
| moment-timezone version pinning policy (**untracked — no ticket**) | Hygiene | 0.5d | `package.json` |
