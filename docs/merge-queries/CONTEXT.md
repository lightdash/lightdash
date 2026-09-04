# Merge queries

Joining the results of two explore queries into one result set, in the
Explorer, over the semantic layer. Both sides run as ordinary metric queries;
the join runs in DuckDB over their materialized results.

Read `architecture.md` in this directory before changing execution. A second,
older execution path still exists and is being removed; building against it is
the most common mistake in this area.

## Language

**Merge**:
Joining two explore queries on a shared key so their metrics appear side by
side in one result set. A property of a query, not a saved entity of its own.
_Avoid_: blend, union (a merge is a join, never a union), federated query

**Source**:
One side of a merge: an explore plus the metric query run against it. A merge
has exactly two today. Sources are identified by short ids (`a`, `b`) that are
internal and must never reach the user interface.
_Avoid_: query (ambiguous with the merged query itself), side, input

**Leg**:
The executed result of one source: a real query with its own `query_history`
row, result file and cache entry. "Source" is the definition, "leg" is the run.
_Avoid_: sub-query, branch, child query

**Join key**:
The field, or fields, whose values are matched across sources. Each part names
one field per source, which may be differently named on each side.
_Avoid_: merge key, join column, linking field

**Join type**:
Which rows survive the join: `full` keeps rows either source has, `left` keeps
the first source's rows, `inner` keeps only matched rows. Surfaced to users as
what to include, never as SQL keywords.
_Avoid_: join mode, include mode (in code), outer join

**Merged result**:
The output of a merge: join key columns, then each source's value columns, then
any merge-level table calculations. Column names are output field ids, not the
internal positional aliases the builder uses.
_Avoid_: combined result, joined table, output set

**Merge table calculation**:
A calculation evaluated on the merged row, so it can reference fields from both
sources. Distinct from a source's own table calculations, which are evaluated
before the join.
_Avoid_: post-join calculation, combined calculation

**Fan-out**:
The failure mode where a source carries a dimension that is neither joined on
nor pivoted, so its rows multiply across the join and its metrics are counted
more than once. Detected before execution and refused.
_Avoid_: row explosion, duplication, cartesian

**Refusal**:
A structured, pre-execution rejection of a merge that would produce wrong
numbers. Carries a kind, the source at fault and the field ids involved, so the
interface can name them in the user's own vocabulary. A refusal is not an
error: it is the feature working.
_Avoid_: validation error, failure

**Row cap**:
The maximum rows one source may contribute. A leg that reaches it is refused
before the join, naming the source, never silently trimmed, because a join over
a trimmed side returns numbers that look complete and are not. It is known only
once the leg has run, so unlike other refusals it arrives as the merged query's
error.
A result source is never re-run, so the row cap never bounded it: the only
bound that matters for it is the limit its own query ran with. A referenced
result that returned as many rows as that limit is refused at compile time,
naming the source, with re-running that query (higher limit or none) as the
remedy rather than a filter. Both checks refuse on evidence only: an
unrecorded limit or row count never refuses.
_Avoid_: limit (collides with the merged result's own limit), truncation

**Compose engine**:
The DuckDB instance that executes joins over materialized results. Shared with
the compose SQL runner and external sources. Not a warehouse, and not
per-project.
_Avoid_: merge engine (there is no engine specific to merges), DuckDB (as a
product noun in user-facing copy)

**Query source**:
A registered kind of node in a composed query: the semantic layer, raw SQL,
DuckDB over other results, or an external source. A merge is two semantic-layer
nodes and one DuckDB node. See `docs/multi-source-queries.md`.
_Avoid_: connector, provider, data source (collides with warehouse connections)

## Boundaries

- Merges join the **semantic layer**. Merging existing query results by uuid is
  reachable through the AI agent path only. Merging external sources rides the
  same engine but belongs to the external sources context.
- The Explorer is the surface. The composed-query API is a separate developer
  surface with its own flag; a merge must not require it.
- The `merge-queries` flag gates the feature. Composition itself is not
  flagged: it is the plumbing under merges and external sources both.

## Related

- `architecture.md` in this directory: execution paths and the current
  migration.
- `docs/multi-source-queries.md`: the composed-query DAG a merge executes as.
- `docs/external-sources/CONTEXT.md`: the other consumer of the compose engine.
- `docs/pre-aggregates/CONTEXT.md`: shares the DuckDB engine, different purpose.
