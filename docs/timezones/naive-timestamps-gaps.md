# Naive Timestamps — Documented Gaps

The gaps in how Lightdash handles naive (timezone-less) timestamp columns, discovered while fixing the raw-time-frame display bug ([#25614](https://github.com/lightdash/lightdash/issues/25614), fixed by [#25649](https://github.com/lightdash/lightdash/pull/25649)). Each gap shows a concrete example with the actual result and, where it explains the failure, the compiled SQL — all reproduced against live warehouses, not derived from reading code. The closing section states the constraints any fix should respect.

Companion to [`timezone-handling.md`](./timezone-handling.md) (how timezones work today) and [`timezones-v2-design.md`](./timezones-v2-design.md) (design principles). Each gap has a slug (`gap-...`, same convention as the v2 design doc) for cross-referencing from tickets:

| Slug | Gap |
| --- | --- |
| `gap-naive-filter-domain` | Filters compare in the wrong domain; wrapped-LHS filters defeat partition pruning |
| `gap-naive-no-session-rebase` | Naive types not rebased at all on Databricks, Spark, Trino, Athena |
| `gap-snowflake-optout-aware` | Snowflake opt-out projects break aware columns |
| `gap-naive-minmax` | MIN/MAX over naive columns misread as UTC |

---

## Naive vs aware

A timestamp column is one of two things:

- **Aware** — the value identifies an instant. Either the zone/offset is stored with it, or the value is epoch-based. `2026-01-15 10:00:00+09:00` means one point in time, unambiguously.
- **Naive** — the value is a bare wall clock. `2026-01-15 10:00:00` means nothing by itself; some external convention has to say which zone it was written in. In Lightdash that convention is the connection's **data timezone** (`dataTimezone`, default UTC).

Lightdash collapses both into a single `DimensionType.TIMESTAMP` — the compiler cannot tell them apart. That collapse is the root of every gap in this document.

## Per-warehouse domain inventory

Which types are naive, which are aware, and which one a modeler is likely to have:

| Warehouse | Naive type | Aware type | Default / idiomatic |
| --- | --- | --- | --- |
| Postgres / Redshift / DuckDB | `timestamp` | `timestamptz` | Bare `timestamp` is the default spelling — **naive is common** |
| BigQuery | `DATETIME` | `TIMESTAMP` | Both idiomatic |
| Snowflake | `TIMESTAMP_NTZ` | `TIMESTAMP_LTZ`, `TIMESTAMP_TZ` | `TIMESTAMP` aliases to NTZ by default (`TIMESTAMP_TYPE_MAPPING`) — **naive is the default** |
| Databricks / Spark | `TIMESTAMP_NTZ` (opt-in) | `TIMESTAMP` (instant, session-rendered) | **Aware by default**; naive requires explicitly choosing NTZ |
| Trino / Athena | `timestamp` | `timestamp with time zone` | Bare `timestamp` is the common type — **naive is common** |
| ClickHouse | — none | `DateTime`, `DateTime64` (epoch instants) | **Aware only** — a naive timestamp type does not exist |

Two consequences worth internalizing:

> **ClickHouse has no naive columns — but it is not exempt from Gap 1(b).** `DateTime` stores an epoch instant; its zone is display metadata, and any "when in doubt, treat as naive" fallback rule would be actively wrong there. `dataTimezone` on ClickHouse cannot rebase stored values; what it does is parse Lightdash's *bare filter literals* in the data timezone via `session_timezone`, while displayed values stay pinned UTC instants (`toTimeZone(x, 'UTC')`). The two sides diverge, so setting a data timezone breaks raw-frame filters without changing anything visible — see Gap 1(b). Verified live 2026-07-20.

> **Databricks/Spark are aware by default.** Their bare `TIMESTAMP` is an instant — that is why its `castToInstant` is identity (a session rebase would double-shift it, see `timeFrames.ts:154`). Only opt-in `TIMESTAMP_NTZ` columns are naive there. Trino/Athena are the mirror image: their *common* type is the naive one.

---

## How naive columns are interpreted today

The current mechanism is the **session-identity trick**: never detect which columns are naive — instead, apply an operation that the warehouse session resolves correctly for naive values and that is identity-in-value for aware ones.

| Layer | Mechanism |
| --- | --- |
| Session | `dataTimezone` → session timezone (`SET timezone`, `ALTER SESSION`, BigQuery per-job `time_zone` connection property) |
| Compile (Snowflake only) | Every TIMESTAMP dim wrapped in `TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))` — the session interprets NTZ, aware columns normalize to the same UTC instant |
| Query (RAW frames) | `castToInstant` in the SELECT — `(x)::timestamptz` (Postgres-family), `TIMESTAMP(x)` (BigQuery), identity on Snowflake/Databricks/Spark/Trino/Athena (`timeFrames.ts:103`) |
| Query (truncated frames) | `castToInstant` is the inner term of each adapter's `toProjectTz` wrap |

The raw-frame fix (#25649) closed the display half of the naive problem on session-property warehouses: raw values now rebase via `castToInstant`, the no-op short-circuit was narrowed so it can't skip the rebase (`isTimezoneRoundTripNoOp`, `timeFrames.ts:761`), and `dataTimezone` joined the results cache key.

**What it deliberately did not close** — the trick only works where a session rebases naive values, and only on the SELECT side. Those limits are the gaps below.

---

## The root limitation

**The compiler cannot tell naive from aware.** All Snowflake variants, BigQuery `DATETIME` and `TIMESTAMP`, Postgres `timestamp` and `timestamptz` — all become `DimensionType.TIMESTAMP`. The information exists (every warehouse catalog distinguishes the types, and the dbt manifest `data_type` already flows through explore compilation as a type fallback in `translator.ts`), but the naive/aware bit is never captured on the compiled dimension.

Because of that, every conversion decision is made blind: wraps must be safe for both domains, opt-outs must be warehouse-wide, and short-circuits guess. Each gap below is one place the guess fails.

Running example for the gaps — a naive timestamp column `created_at` holding one row, with `dataTimezone: Asia/Tokyo`:

```
stored value:  2024-01-15 02:00:00        (naive, means Tokyo)
true instant:  2024-01-14 17:00:00 UTC
```

---

## Gap 1 — Filters on naive columns compare in the wrong domain

**Gap:** `gap-naive-filter-domain` · **Type:** bug

Filter boundaries are computed in Node as UTC instants. The SELECT side rebases the column (session/`castToInstant`), but the WHERE side has no equivalent: the literal is emitted in UTC shape and the column stays bare.

**(a) BigQuery sub-day filters break whenever a data timezone is set.** BigQuery literals are emitted offset-less (`formatTimestampAsUTCNoOffset` — its `DATETIME` rejects offsets). With `dataTimezone` set, the per-job `time_zone` is no longer UTC, and BigQuery parses the bare literal *in the job timezone*. An hour-grain filter targeting the row's bucket (`2024-01-14 17:00 UTC`) should match the row; it matches nothing:

```sql
-- compiled WHERE (BigQuery): the LHS is the correct UTC instant, the literal is not
(TIMESTAMP(DATETIME_TRUNC(DATETIME(TIMESTAMP(created_at), 'UTC'), HOUR), 'UTC'))
  = ('2024-01-14 17:00:00')
-- BigQuery reads the bare literal in the job timezone (Tokyo):
-- 17:00 Tokyo = 08:00 UTC → no match → 0 rows, expected 1
```

The same filter on Postgres matches correctly — its literal carries `+00:00` and the wrapped LHS compares instants — so this half is specific to the bare-literal warehouses.

**(b) Raw-frame filters compare wall clocks in different zones — on every warehouse with a naive column, and on ClickHouse without one.** Raw WHERE clauses keep the bare column (deliberate — wrapping it defeats partition pruning), and nothing on the literal path converts the value into the column's zone. Filtering the raw frame to a one-hour window around the row's true instant (`between 2024-01-14 16:30 and 17:30 UTC`) should match the row; it returns **0 rows on both Postgres and BigQuery**:

```sql
-- Postgres:  created_at >= '2024-01-14 16:30:00+00:00'
--   the unknown literal is coerced to the column's type (timestamp),
--   silently DROPPING the offset → stored Tokyo wall clock 2024-01-15 02:00
--   is compared against UTC wall clock 16:30 → no match
-- BigQuery:  created_at >= ('2024-01-14 16:30:00')
--   DATETIME vs bare string → the same wall-clock-vs-wall-clock mismatch
```

Note the session does **not** save this case: comparing a naive column against a string literal coerces the literal to the naive type, discarding the offset before the session could matter. The filter misses the rows the user picked, and matches rows offset by the data timezone instead.

**ClickHouse hits the same symptom from the opposite side** — no naive column required. Its values are instants and the SELECT pins them to UTC (`toTimeZone(x, 'UTC')`), but its bare filter literals are parsed by `session_timezone` (= `dataTimezone`). Verified live with `dataTimezone: Asia/Tokyo`, display UTC, on `timezone_test`: the displayed raw value is `2024-01-15T02:00Z`, filtering `inBetween [01:30Z, 02:30Z]` returns **0 rows**, and the window that matches is `[10:30Z, 11:30Z]` — the literal `'2024-01-15 10:30:00'` read as a Tokyo wall clock is `01:30Z`. Display never moves, filters silently shift: setting a data timezone on ClickHouse only breaks things. The literal-side fix (`gap-naive-filter-domain`'s typed-literal strategy, here `toDateTime64('...', 3, 'UTC')`) makes the setting fully inert on ClickHouse.

**(c) Even when bucketed filters are correct, they full-scan partitioned tables.** Filter parity is achieved by reusing the timezone-wrapped expression as the WHERE LHS — visible in (a)'s compiled SQL — so the partition column is hidden inside a function call and the warehouse cannot prune. Measured on a partitioned BigQuery table: a bare-column predicate processes 176 bytes; the same predicate with the wrapped column processes 32,080 bytes (the full table). This half affects aware and naive columns alike — it is a cost of the wrap-the-column strategy itself, and the same literal-side rewrite that fixes (a) and (b) removes it (half-open ranges on the bare column, see constraint 2).

**Files:** `packages/common/src/compiler/filtersCompiler.ts` (the TIMESTAMP branch does not thread timezone arguments today), `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts`

## Gap 2 — Naive types are not rebased at all on Databricks, Spark, Trino, Athena

**Gap:** `gap-naive-no-session-rebase` · **Type:** bug

These four adapters have identity `castToInstant` and keep the *wider* target-equals-source short-circuit (`equalZonesSkipAdapters`, `timeFrames.ts:746` — the code comment says "Naive-column handling for these is tracked separately"; this document is that tracking). Their sessions do not rebase naive columns the way Postgres/BigQuery do, so the raw-frame fix explicitly left them byte-identical to the pre-fix behavior. In practice this is two failure modes of the same blind machinery:

**Trino (naive `timestamp` — its common type): `dataTimezone` is fully inert.** With `dataTimezone: Asia/Tokyo` and a UTC display timezone, the example row comes back as:

```
raw:   2024-01-15T02:00Z   (should be 2024-01-14T17:00Z — wall clock read as UTC)
hour:  2024-01-15T02:00Z   day: 2024-01-15   (same misreading, consistently)
```

Display, grouping, and filters all treat the stored wall clock as UTC — the #25614 symptom, unfixed here.

**Databricks (instant `timestamp` — its default type): the session wrap corrupts the *aware* column instead.** Databricks' bare `timestamp` stores an instant (see the inventory), and at display ≠ data timezone the session-based truncation wrap double-shifts it. Storing the instant `2024-01-15 02:00 UTC` with `dataTimezone: Asia/Tokyo`, UTC display:

```
raw:   2024-01-15T02:00Z   (correct — the column genuinely stores this instant)
hour:  2024-01-14T17:00Z   (wrong — the wrap re-interpreted the instant via the Tokyo session)
→ the raw value falls outside its own hour bucket
```

At display == data timezone the equal-zones skip drops the wrap and the two agree again. A true Databricks `TIMESTAMP_NTZ` column stays unrebased like Trino's naive `timestamp` (identity `castToInstant` — by code inspection, not yet reproduced live).

**Files:** `packages/common/src/utils/timeFrames.ts:746` (`equalZonesSkipAdapters`), adapter entries in `dateTruncTimezoneConversions`

## Gap 3 — Snowflake opt-out projects break aware columns

**Gap:** `gap-snowflake-optout-aware` · **Type:** bug

Snowflake normally normalizes every TIMESTAMP dim at compile time (`TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))` in `translator.ts`). `disableTimestampConversion: true` skips that wrap — but the flag is **warehouse-wide**, so aware `TIMESTAMP_TZ`/`LTZ` columns lose their normalization along with the naive ones the modeler meant to opt out. Two failures result, both requiring `EnableTimezoneSupport` on:

**(a) Hard error on the timezone-aware wraps.** Snowflake's 3-arg `CONVERT_TIMEZONE` accepts only NTZ input. A raw `TIMESTAMP_TZ` column flowing into a truncation/extract wrap (resolved timezone ≠ source) fails the whole query:

```
Invalid argument types for function 'CONVERT_TIMEZONE': (VARCHAR, VARCHAR, TIMESTAMP_TZ)
```

**(b) Filter round-trip failure at the short-circuit.** When display timezone == `dataTimezone`, the wrap is skipped and `DATE_TRUNC` runs on the raw `TIMESTAMP_TZ`, which *preserves the per-row offset*. Reproduced with `+00:00` data, `dataTimezone` and display both `America/New_York`:

```
bucket value:  2024-01-01 00:00:00 +00:00  → serialized "2024-01-01T00:00:00Z"
UI renders:    "2023-12"                    (NY display shifts it back)
user filters:  '2023-12-01'                 (the label they can see)
Snowflake casts the bare literal via the session (NY): 2023-12-01 05:00 UTC
→ never equals the bucket instant → 0 rows for every visible bucket
```

The display path and the filter path each apply a conversion the other doesn't know about, so no label round-trips. Both failures are aware-column casualties of the same blindness: the opt-out can't be scoped to the naive columns it exists for.

**Files:** `packages/common/src/compiler/translator.ts` (wrap + opt-out), `packages/common/src/types/projects.ts:568` (`getColumnTimezone`), `packages/common/src/utils/timeFrames.ts` (Snowflake `dateTruncTimezoneConversions`)

## Gap 4 — MIN/MAX over naive columns is misread as UTC

**Gap:** `gap-naive-minmax` · **Type:** bug

`castToInstant` was applied to raw *dimensions*; metric SQL was not touched. A MIN/MAX over a naive column aggregates the bare column, so the result reaches the wire as a naive wall clock, gets stamped `Z`, and the formatter shifts it. A `max` metric over the example column, UTC display — identical on **Postgres and BigQuery**:

```
returned:  2024-01-15T02:00:00.000Z, renders "2024-01-15, 02:00 (+00:00)"
expected:  2024-01-14T17:00:00Z, rendering "2024-01-14, 17:00 (+00:00)"
```

That is the stored wall clock stamped as UTC — on the very warehouses where the *dimension* path is fixed, so the metric and its own column disagree inside one query. (This is closable without touching freeform metric SQL: MIN/MAX commute with a monotonic conversion, so the aggregate *output* can be wrapped.)

**Files:** `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` (metric SQL path)

---

## Constraints for closing the gaps

Any fix should stay inside the model the existing work has converged on. The principles, in decreasing order of leverage:

1. **Make the domain explicit.** Every TIMESTAMP dimension is either *aware* or *naive-in-Z*, where Z = per-column declaration ?? `dataTimezone` ?? UTC. The knowledge comes from the modeler first and the warehouse catalog second (the dbt manifest `data_type` already flows through compilation; the naive/aware bit just isn't captured). Once the domain is known, every gap above has a well-typed fix — and Gap 3 becomes inexpressible.
2. **Convert filter literals into the column's domain — never wrap the column in WHERE.** A naive comparison happens in the column's wall clock (literal converted from the UTC instant, monotonic, so predicates are preserved); an aware comparison uses an offset-bearing instant literal. This is the pruning-safe direction, already validated in miniature by #25649 keeping raw WHERE bare, and it removes the full-scan cost measured in Gap 1(c).
3. **Convert with explicit source zones; demote the session to a fallback.** The session-identity trick has hit its ceiling (Gap 2 is unreachable by it). Explicit source-zone conversion works on every adapter; the session timezone remains only for warehouse functions that genuinely need it (`CURRENT_TIMESTAMP` in user SQL), as an enumerated list.
4. **Unknown domain degrades to the warehouse's default domain** (see the inventory: naive-in-`dataTimezone` where naive is the default/common type, aware on ClickHouse and Databricks/Spark). Degradation must equal today's behavior — no new failure modes for columns we can't classify.
5. **Short-circuits are domain-scoped.** Skipping a conversion because "target equals source" is only valid when it is provably identity *for that column's domain* — the assumption that broke sub-day frames pre-#25649 and still breaks Gap 3(b).
6. **Accept the DST fold.** Naive storage loses one wall-clock hour per year: equality on a folded wall clock matches both instants. This is inherent to the type under any strategy — document it, don't fight it.

The adjacent per-column zone declaration (mixed-zone models, e.g. a PT column next to a UTC column) is already documented as `gap-wall-clock-tz-col` in [`timezones-v2-design.md`](./timezones-v2-design.md) (principle 24) — it supplies the "which zone" half of principle 1; the gaps here need the "whether a zone applies" half.

---

## File reference

| Component | File |
| --- | --- |
| `castToInstant` + conversion maps + `isTimezoneRoundTripNoOp` | `packages/common/src/utils/timeFrames.ts` |
| RAW-frame SELECT cast, metric SQL path | `packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts` |
| Snowflake wrap + `disableTimestampConversion` | `packages/common/src/compiler/translator.ts` |
| `getColumnTimezone` | `packages/common/src/types/projects.ts` |
| Filter literal rendering | `packages/common/src/compiler/filtersCompiler.ts` |
| BigQuery per-job `time_zone` | `packages/warehouses/src/warehouseClients/BigqueryWarehouseClient.ts` |
| ClickHouse `session_timezone` | `packages/warehouses/src/warehouseClients/ClickhouseWarehouseClient.ts` |
| Regression tests (raw vs truncated, data-timezone matrix) | `packages/api-tests/tests/dataTimezone.test.ts` |
