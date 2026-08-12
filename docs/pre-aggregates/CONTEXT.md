# Pre-aggregates

User-defined, pre-computed summaries of explores that serve matching queries
from materialized files instead of the warehouse.

## Language

**Pre-aggregate**:
A named, user-defined summary of an explore, declared in model YAML under
`pre_aggregates`, specifying the dimensions, metrics, filters, and time
granularity it covers.
_Avoid_: rollup, view, materialized view, aggregate table, cube, pre-aggregation (noun), summary table

**Materialization**:
A single built instance of a pre-aggregate — the aggregation results stored as
a file in object storage. It is never a warehouse table or view. One
materialization is active per pre-aggregate at a time; statuses are in
progress, active, superseded, and failed.
Not a dbt materialization (`materialized: table/view`) — unrelated concept,
despite pre-aggregates being defined in dbt YAML.
_Avoid_: build (noun), snapshot, table, cache entry

**Materialize**:
To run a pre-aggregate's aggregation query against the warehouse and store the
result as a new materialization. The only step that touches the warehouse.
_Avoid_: build, rebuild, precompute

**Refresh**:
A user- or schedule-initiated request to materialize a pre-aggregate again.
The `refresh` YAML key configures the cron schedule for this.
Not dashboard auto-refresh or dbt `--full-refresh`.
_Avoid_: rebuild, re-run, sync

**Trigger**:
What initiated a materialization: compile (dbt project compiled), cron
(scheduled refresh), or manual (user-requested refresh). Not a scheduler
delivery trigger or DB trigger.

**Source explore**:
The explore a pre-aggregate is defined on and summarizes.

**Pre-aggregate explore**:
The hidden, generated explore that represents a pre-aggregate's shape and is
used to query its materialization.
_Avoid_: materialized explore, virtual explore

**Definition filters**:
Static filters in a pre-aggregate's YAML that scope which rows are
materialized. A query matches only if it includes an equivalent or narrower
filter.
_Avoid_: static filters, pre-filters

**Time dimension / Granularity**:
The optional time dimension a pre-aggregate is grouped by, and the grain
(hour–year) it is stored at. Queries at equal or coarser grain can be served;
finer grain misses.

**Materialization role**:
A fixed identity (email plus user attributes) that materialization runs under,
so access-controlled models materialize deterministically regardless of who
triggered the build.

**Match / Matching**:
The query-time check of whether a query's dimensions, metrics, filters, and
granularity are all covered by a pre-aggregate. When several match, the
smallest pre-aggregate wins.
_Avoid_: routing, resolution

**Hit**:
A query (or dashboard tile) served from a pre-aggregate's materialization
instead of the warehouse.

**Miss**:
A pre-aggregate-eligible query that no pre-aggregate matched, so it ran
against the warehouse. Every miss records a miss reason.
_Avoid_: fallback, cache miss

**Miss reason**:
The recorded explanation for a miss (e.g. dimension not in pre-aggregate,
granularity too fine, non-additive metric).

**Ineligible**:
A dashboard tile that cannot use pre-aggregates at all (markdown tile, SQL
chart, broken explore). Distinct from a miss: ineligible tiles never count
against coverage.

**Serve**:
To answer a matched query from the active materialization (via DuckDB) rather
than the warehouse.

**Additivity**:
A metric's capacity to be re-aggregated from pre-computed results: additive
(sum, count), decomposable (average — derivable from stored components), or
non-additive (count_distinct, median — cannot be pre-aggregated).

**Audit**:
A per-dashboard coverage report classifying each tile as hit, miss (with
reason), or ineligible. Available in the dashboard menu and via
`lightdash pre-aggregate-audit`. Outside this context, always "pre-aggregate
audit" — unqualified "audit" elsewhere means audit logging.
_Avoid_: coverage report, health check

**Analytics**:
The daily hit/miss statistics for a project, broken down by explore, query
context, and chart/dashboard. Shown in Project Settings > Pre-aggregates.
Outside this context, always "pre-aggregate analytics" — unqualified
"analytics" elsewhere in the repo means product usage tracking.
_Avoid_: stats, usage, metrics (in this context)
