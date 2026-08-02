# Timestamp Domains — The Design

This doc describes how Lightdash fixes the naive-timestamp problems
documented in [naive-timestamps-gaps.md](./naive-timestamps-gaps.md). The short
version: instead of guessing which timestamp columns are timezone-less, we detect
it from the warehouse, and we write the correct conversion into the generated SQL
itself.

The design has three layers, each tracked in Linear:

| Layer | What it does | Ticket | Status |
| --- | --- | --- | --- |
| Detection | Classify every timestamp column as naive or aware at deploy time | GLITCH-615 | Shipped (#25818) |
| Conversion | Explicit, session-independent SQL rebase for known-naive columns, plus MIN/MAX | GLITCH-460 | Shipped (#25819) |
| Filters | Literals rendered in the same domain as the column | GLITCH-616 | Shipped (#25820) |

And which gaps from the gaps doc each layer closes:

| Gap | Status |
| --- | --- |
| Gap 1a and 1b: filters compare in the wrong domain | Closed by the filters layer (GLITCH-616) |
| Gap 1c: wrapped filters defeat partition pruning | Partially closed: bare-column filters no longer wrap. Sub-day bucketed filters still wrap the column; rewriting them as ranges is a follow-up |
| Gap 2: naive columns never rebased on Databricks, Spark, Trino, Athena | Closed by the conversion layer (GLITCH-460) |
| Gap 4: MIN/MAX over naive columns misread as UTC | Closed by the conversion layer (GLITCH-460), for both custom and YAML-defined metrics. The conversion wraps the aggregate operand, not the output — the two disagree across DST gaps (see below) |
| Gap 3: Snowflake opt-out breaks aware columns | Follow-up. This design finally makes a per-column fix possible |

## The problem, restated

A timestamp column stores either an instant ("this exact moment, timezone included")
or a naive wall clock ("02:00", and you're supposed to know it means Tokyo time).
Lightdash collapsed both into one type, so every timezone conversion was a guess.

The guessing mechanism was the session timezone: set the warehouse connection to
the data timezone so the warehouse reinterprets naive values on our behalf. That
is a single connection-wide setting. It cannot be applied per column, which is
exactly what the gaps doc shows going wrong: some warehouses ignore the setting,
one applies it to columns that didn't need it, and filter literals never benefit
from it at all.

The fix has three layers. Detect the domain. Convert explicitly. Fix the filters.

## Running example

Used throughout, same as the gaps doc. One row in a naive column called
created_at, and the project's data timezone is Asia/Tokyo:

```
stored value:  2024-01-15 02:00:00     (a bare wall clock, means Tokyo)
true instant:  2024-01-14 17:00:00 UTC
```

Every example below is the question: does Lightdash read this row as 17:00 UTC,
or 9 hours off?

## Layer 1 — Detect the domain

When a project deploys, we already fetch the warehouse catalog to get column types.
The catalog knows whether each column is naive or aware; we just never kept that
bit. Every warehouse client classifies it:

| Warehouse | Naive | Aware | Left unknown |
| --- | --- | --- | --- |
| Postgres, Redshift, DuckDB | timestamp | timestamptz | |
| BigQuery | DATETIME | TIMESTAMP | TIME |
| Snowflake | TIMESTAMP_NTZ | TIMESTAMP_TZ, TIMESTAMP_LTZ | bare TIMESTAMP (it aliases per account) |
| Databricks, Spark | TIMESTAMP_NTZ | TIMESTAMP | |
| Trino, Athena | timestamp | timestamp with time zone | |
| ClickHouse | none exist | DateTime, DateTime64 | |

The result is stored on the compiled dimension as a new field, timestampDomain,
with three states: naive, aware, or absent. Absent means unknown, and unknown
never means aware. Standard time-interval children (day, hour, raw, ...) inherit
the value from their base dimension. Custom-granularity outputs stay unknown
because their SQL may change the domain.

The catalog only ever describes the physical column, so its domain is stamped
only on dimensions whose SQL is the bare column: custom `sql:` expressions and
additional dimensions stay unknown (the expression may change the domain), and
an additional dimension's interval children inherit its own resolved domain,
never the parent column's annotation.

A modeler can always override the catalog in YAML:

```yaml
columns:
  - name: created_at
    meta:
      dimension:
        timestamp_domain: naive
```

Detection on its own changes nothing. No SQL consumes the label in this layer,
so generated queries are byte-identical.

One implementation note worth knowing: the catalog cache keeps its existing shape
(column name to type), and the domains travel in a small sidecar object next to
it. This makes rollbacks safe: a previous deploy reading that cache simply does
not see the sidecar. The alternative, changing the cached values themselves, was
evaluated and rejected because a rolled-back deploy reading the new value shape
fails every explore with a classified timestamp column, permanently.

A cached catalog written before domains existed is treated as stale and
refetched once on the next compile (backend-managed projects would otherwise
reuse it until schema drift and never classify anything); freshly fetched
catalogs are stamped with an empty sidecar so domain-less warehouses don't
refetch repeatedly.

## Layer 2 — Convert explicitly

For a column we know is naive, the generated SQL rebases the wall clock from
the data timezone, right there in the query:

| Adapter | Rebase for a naive column in zone Z |
| --- | --- |
| Postgres, Redshift, DuckDB | ((col) AT TIME ZONE 'Z') |
| BigQuery | TIMESTAMP(col, 'Z') |
| Databricks, Spark | CAST(to_utc_timestamp(col, 'Z') AS TIMESTAMP_NTZ) |
| Trino, Athena | CAST(with_timezone(col, 'Z') AT TIME ZONE 'UTC' AS timestamp) |

Snowflake is untouched (its compile-time wrap already handles naive columns, and
it is our fully-green canary). ClickHouse has no naive columns.

On the running example, here is the Trino hour bucket. Before, the data timezone
was completely inert on Trino, so the wall clock was read as UTC:

```
before:  DATE_TRUNC('HOUR', created_at)          -> 2024-01-15T02:00Z   wrong
after:   DATE_TRUNC('HOUR', <rebased created_at>) -> 2024-01-14T17:00Z  correct
```

Columns that are aware, or unknown, compile exactly the same SQL as before. The
rebase only swaps the innermost term of the conversion the query already had.

MIN and MAX get the same treatment: the aggregate operand is converted —
explicitly from the data timezone for a known-naive base, through the session
cast (identity in value for aware columns) for unknown domains.

The conversion sits inside the aggregate, not around it, because the
wall-clock-to-instant map is not monotone across DST gaps: a nonexistent wall
clock like 2024-03-10 02:30 in America/New_York maps with the pre-transition
offset (07:30Z) and lands past real post-gap instants (03:00 EDT is 07:00Z),
so MAX(convert(x)) and convert(MAX(x)) can disagree. The operand is swapped by
a boundary-safe replacement of the base column reference; metrics with their
own filters keep the output wrap, since compiled predicates may repeat the
reference:

```
before:  MAX(created_at)                               -> 2024-01-15T02:00Z  wrong
after:   MAX((created_at) AT TIME ZONE 'Asia/Tokyo')   -> 2024-01-14T17:00Z  correct
```

On Snowflake the aggregate reads the bare column even though dimension SQL is
compile-time wrapped, so its rebase uses the raw data timezone via the 3-arg
CONVERT_TIMEZONE, applied only to known-naive bases.

### Session-proof outputs, Databricks and Spark only

Databricks and Spark render TIMESTAMP results through the session timezone, so
a naive rebase alone would produce values that depend on connection state. The
explicit path instead freezes every exit to the wire as TIMESTAMP_NTZ, which
the driver returns verbatim under any session: the naive rebase and aggregate
forms cast their output (the table above), known-aware columns take an
explicit current_timezone() shift into a frozen UTC face — fixing the
"session shifts columns that were already correct" part of gap 2 for
classified columns — and sub-day truncated outputs get a final freeze.
Day-or-coarser grains already exit through a DATE cast, which is
session-proof. Trino's explicit forms were session-independent from the start
(its "instant" representation is a naive-UTC timestamp).

An earlier iteration pinned the session to UTC per query instead, gated on
every referenced dimension being classified. It was removed: the pin flipped
session semantics under user-written SQL the gate could not inspect (table
calculations, sql_filter, join SQL, custom metrics), fired vacuously on
queries with no timestamp columns at all, and needed the session override
threaded through the queue payload — a deploy-skew hazard. With every
explicit form session-independent there is no pin, no payload field, and no
cache-key term: classified and unclassified columns mix freely per column on
every adapter, and the session simply stays on the legacy data timezone as
the fallback for unclassified columns.

The rollout property still holds: a project running the new code whose
explores haven't been redeployed yet compiles byte-identical SQL and behaves
exactly as it does today.

## Layer 3 — Fix the filters

Filter boundaries are computed in Node as UTC instants. The old code emitted them
in UTC shape no matter what the column was, and the gaps doc shows the result:
filters that miss rows the user can see on screen.

For dimensions with timezone conversion enabled, the fix renders the literal in
the same domain the column compares in, and leaves the column bare so indexes and
partitions still prune. Filtering the running example to the hour around its true
instant (from 16:30 UTC), on Postgres:

| We know the column is... | Literal emitted | Why it matches |
| --- | --- | --- |
| naive | ('2024-01-15 01:30:00'::timestamp) | the boundary as a Tokyo wall clock, compared wall-to-wall |
| aware | ('2024-01-14 16:30:00+00:00') | a typed instant, timezone-proof |
| unknown | unchanged | see below |

Unknown columns keep today's literals byte for byte. Until a project redeploys
and picks up domains, the interim fix shipped alongside this design covers
them: a per-organization flag rebases the RAW filter column itself to an
instant on Postgres, Redshift, DuckDB and BigQuery, with the literal pinned to
match. The wrap costs partition pruning, which is exactly why it is the
fallback and not the destination: once a project's columns are classified,
this design keeps the column bare and the flag can retire.

Sub-day bucketed filters (hour, minute) are the one place the column itself is
wrapped, because the bucket already round-trips through the display timezone.
There the literal takes the identical round trip, so both sides of the
comparison are built by the same code and cannot drift apart. This also fixes the
BigQuery case from gap 1a, where the job timezone silently re-read our UTC
literal as Tokyo time and matched nothing.

Two refinements keep those wrapped comparisons off session coercion entirely:
on Databricks and Spark the wrapped literal is frozen as TIMESTAMP_NTZ to
match the frozen LHS (a naive-vs-TIMESTAMP comparison would lean on both
sides passing through the same session zone, which breaks for wall clocks
inside that zone's DST gap); and when the sub-day round-trip is a no-op
(display equals data timezone on the equal-zones adapters) the LHS is the
legacy unwrapped trunc, so the literal stays legacy and byte-matches it —
known-naive columns never reach that state, since their round trip is never
a no-op.

Deliberately unchanged: everything with the flag off, projects with a UTC data
timezone, RAW dimensions with `convert_timezone: false`, DATE dimensions,
EXTRACT-based filters, and Snowflake.

## Why this is the right approach

The two alternatives we evaluated both hit walls:

Extending the session-timezone approach cannot work. Filter literals are coerced
before the session has any effect (gap 1b). Trino's session rebases nothing,
while Databricks' session shifts columns that were already correct (gap 2).
Metric SQL never flowed through it at all (gap 4). These are not bugs in the
mechanism; they are its structural limits.

Normalizing every column at compile time (what Snowflake does today) wraps aware
columns that needed no help, which is precisely how gap 3 happens, and it keeps
the full-scan cost of wrapped filters from gap 1c.

What the chosen design provides:

1. Correctness lives in the SQL text. The same query gives the same result on
   any worker, regardless of connection state — no session override rides the
   execution arguments, the queue payload, or the cache key. That makes it
   safe for caching, safe across deploys, and safe to roll back.
2. Unknown means unchanged. Every safety claim reduces to this single invariant,
   and it is asserted with byte-identity tests in every slice. Projects get correct
   as they redeploy; projects that never redeploy never change.
3. No new feature flag. Everything rides the existing EnableTimezoneSupport
   pipeline, which stays per-org overridable as the revert lever, and all of it
   is inert when the flag is off or no data timezone is set.

One accepted limitation, inherent to naive storage under any strategy: during
the DST fall-back, one wall-clock hour happens twice, so equality on a folded
wall clock matches both instants. This is documented behavior rather than
something the design attempts to work around.

## What stays open

- Gap 3: retire Snowflake's warehouse-wide opt-out in favor of per-column domains.
- Gap 1c for sub-day buckets: rewrite wrapped equality as ranges on the bare column.
- dbt Cloud CLI deploys don't carry domains yet (those columns stay unknown, so
  they keep today's behavior).
- Surfacing unknown-domain columns in project validation, and probe-derived
  domains for SQL charts.
- Metric filters (YAML metric `filters:` and custom-metric filters) bake their
  literals at metric compile time, where no domain context exists, so a
  filtered metric over a known-naive column still compares in the legacy
  domain. Only relative-date predicates are re-rendered at query time today;
  generalizing that rewrite is GLITCH-627.

## File reference

| Component | File |
| --- | --- |
| Domain type on dimensions | packages/common/src/types/field.ts |
| Catalog sidecar and accessors | packages/common/src/types/warehouse.ts |
| Per-warehouse classifiers | packages/warehouses/src/warehouseClients/ |
| Catalog to compiled dimension | packages/common/src/compiler/translator.ts |
| Rebase functions and conversion maps | packages/common/src/utils/timeFrames.ts |
| RAW and metric operand rebase | packages/backend/src/utils/QueryBuilder/MetricQueryBuilder.ts |
| Pre-domain cache invalidation | packages/backend/src/projectAdapters/dbtBaseProjectAdapter.ts |
| Filter literal modes | packages/common/src/compiler/filtersCompiler.ts |
