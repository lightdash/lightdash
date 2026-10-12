# Python engine

Proposed boundary between a composer Python stage and the sandbox that runs
its code. Interface only: nothing implements it, and nothing calls it.

## The stage

Composer passes one materialized result between nodes. A Python stage is
another node: it reads the results it references, runs code over them, and
writes a result. It returns rows rather than images, so the existing chart
components render it. A summary statistic or an A/B test result is a small
table.

## The boundary

Composer results are Parquet files in object storage. A stage needs the URIs
to read, one URI to write, and credentials scoped to both. It needs nothing
else: not the warehouse, not the application database, not the user.

A request therefore carries no Lightdash identity, and one interface covers a
WASM interpreter in a child process and a remote sandbox over HTTP. Keep it
that way. Once a request needs an account or a database handle, only
in-process executors remain.

These stay above the boundary and behave the same whichever executor runs:

- the composer node that declares references and returns a query UUID
- resolving referenced query UUIDs to result file URIs
- minting scoped, short-lived credentials
- writing result columns and row counts to query history

## Outcomes

The caller acts differently on each, so the executor reports which occurred:

- `userError`: the code raised. Show the traceback.
- `limitExceeded`: memory, wall clock or output rows. Retry over fewer rows.
- `canceled`: the caller aborted.
- `executorError`: the sandbox failed. Not a code error.

Every outcome carries timings. Start-up cost is the main difference between
candidate sandboxes.

## Placement

Composer DuckDB nodes publish to `pre_aggregate.duckdb.jobs` and run on the
pre-aggregate worker, which is sized for DuckDB. A Python stage fits that
worker.

Give it its own stream. DuckDB split off the warehouse stream so a join
waiting on its legs would not hold a warehouse slot, and a multi-second
interpreter start holds a DuckDB slot the same way. A separate stream also
makes a separate deployment a flag rather than a refactor, which matters
because a WASM interpreter wants V8 heap headroom where DuckDB wants native
memory.

## Open questions

- Does a fixed set of statistical stages cover most of the demand? Those need
  no sandbox and have a known output schema.
- Cartesian charts have no error bars or confidence bands, so a chart cannot
  show an interval a stage computes.
- How a deployment declares package sets, and whether an administrator extends
  them.
- Whether a stage result is cacheable, given that Python does not promise the
  same output for the same input.
