# Python engine

A proposal for the boundary between a composer Python stage and the sandbox
that runs its code. This directory currently holds the interface only. No
executor implements it yet, and nothing calls it.

## What a Python stage is

Composer queries build a pipeline of nodes, and one materialized result
passes between them. A Python stage is another node: it reads the results of
the nodes it references, runs code over them, and produces a result that
later nodes and the chart artifact consume like any other.

The stage returns rows, not pictures. A summary statistic or an A/B test
result is a small table, so Lightdash charts it with the components it
already has, and the output looks like the rest of the product.

## Why the boundary sits here

The composer already passes results as Parquet files in object storage,
addressed by query UUID. A Python stage therefore needs nothing from the
backend except a list of URIs to read, one URI to write, and credentials
scoped to both. It never reaches the warehouse, the application database, or
another tenant's results.

That narrow contract is what makes the sandbox a late decision. A WASM
interpreter in a child process and a microVM pool differ in start-up cost and
package breadth, not in what they need to know. Selecting between them stays
a configuration value for as long as the request carries no Lightdash
identity.

Use this test when the interface changes: could a request be an HTTP call to
a third party? Once the answer is no, every executor has to sit inside the
trust boundary, and the remote options are gone.

## What stays above the boundary

- The composer node that declares references and returns a query UUID.
- Resolution of referenced query UUIDs to result file URIs.
- Minting scoped, short-lived storage credentials.
- Writing result columns and row counts back to query history.

These are pipeline concerns. They behave the same whichever executor runs.

## What the result type has to distinguish

The caller acts differently on each outcome, so the executor reports which
one occurred rather than returning a single error string:

- `userError`: the code raised. Show the traceback to its author.
- `limitExceeded`: the run crossed a memory, time, or row bound. The code may
  be correct, so retry over less data.
- `canceled`: the caller aborted the run. Nobody is waiting for the result.
- `executorError`: the sandbox failed. Treat it as an incident.

Every outcome reports timings. Without them, comparing a WASM interpreter
against a microVM pool comes down to opinion.

## Where a stage runs

Composer DuckDB queries publish to `pre_aggregate.duckdb.jobs` and run on the
pre-aggregate worker, which is the deployment already sized for DuckDB. A
Python stage suits the same class of worker.

Give it a separate NATS stream. The DuckDB stream split off the warehouse
stream so that a join waiting on its legs does not hold a warehouse slot, and
the same argument applies again: a stage that spends seconds starting an
interpreter should not hold a slot a join needs. The stream boundary also
makes moving the stage to its own deployment a flag rather than a refactor,
which matters because a WASM interpreter wants V8 heap headroom where DuckDB
wants native memory.

## Open questions

- Does a curated set of statistical stages cover most demand? The tests
  people ask for are few and enumerable, they need no sandbox, and their
  output schema is known ahead of the run.
- Cartesian charts offer no error bars or confidence bands today, so a chart
  cannot yet show an interval that a stage computes.
- How a deployment declares package sets, and whether an administrator can
  add to them.
- Whether a stage result is cacheable, given that Python does not promise the
  same output for the same input.
