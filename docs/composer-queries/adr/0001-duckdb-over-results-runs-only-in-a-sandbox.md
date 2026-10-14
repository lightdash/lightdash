# DuckDB over results runs only in a sandbox, never in a server process

Composer SQL transformations, the compose SQL runner, the query-sources API
and merges all run user-authored SQL in DuckDB over other query results. That
DuckDB used to run in a server process: the pre-aggregate NATS worker where
one was deployed, otherwise the API pod as a fallback. Either way the process
held storage credentials, loaded a native database engine and ran user SQL
next to request handling, and a deployment that wanted these features had to
size a worker pod for them or accept DuckDB competing with the API.

We decided every DuckDB-over-results query runs in a one-shot sandbox created
through the sandbox provider, the way a Python transformation already does.
The API process submits the row, waits for the referenced results, writes
their result files into the sandbox, runs the composed SQL there, reads the
result back, validates it and uploads it. Inside the sandbox the raw SQL is
executed by the pinned `duckdb` Python package (`python:3.12-slim` plus that
wheel, nothing else) through a small runner script the backend writes per
run; the runner reports fields and writes rows in the shape the server's
DuckDB client produced. The sandbox gets no credentials and no egress, and
its DuckDB session is locked to its input directory before any user SQL runs. The worker
path, its NATS job subjects and the in-process fallback are removed. Managed
pre-aggregates and external sources read their own parquet and keep their
DuckDB in a server process; this decision does not cover them.

## Considered options

- **Run the server's own DuckDB warehouse client in the sandbox** (a Node
  image with the workspace's `@lightdash/common` and `@lightdash/warehouses`
  installed) — rejected after measuring it on E2B: every node spent 7-10 s
  cold-loading 448 MB of `node_modules` before DuckDB did anything
  (`require('@lightdash/common')` alone took 4.7 s on a fresh microVM). One
  client implementation was the appeal; the price was paid on every
  transformation and merge. The Python runner mirrors the client's session
  hardening, field types and value serialisation instead, and backend tests
  pin that parity against the node client.
- **Keep the worker path behind a flag** — rejected; two execution paths for
  the same query double the surface to test and secure, and the flag would
  keep a credentialed process running user SQL for whoever left it on.
- **Run in-process on the API pod only** — rejected; user SQL shares memory
  and event-loop time with request handling, and the pod holds the storage
  credentials the SQL must never reach.
- **WASM DuckDB in the server process** — rejected; still runs user SQL in a
  server process, with weaker performance and memory control than native
  DuckDB and a second engine build to keep in step with the server's.
- **One sandbox per pipeline instead of per node** — rejected for now; nodes
  are ordinary async queries submitted independently, and sharing a sandbox
  across them needs a pipeline executor that does not exist. It remains an
  optimisation to evaluate from tracing.

## Consequences

- A sandbox provider (E2B in production, Docker locally) is a prerequisite for
  composer transformations and merges. Without one, submission fails with a
  missing-configuration error naming `E2B_API_KEY` or `SANDBOX_PROVIDER`. Only
  the providers the Python runner supports (`e2b`, `docker`) are supported.
- Every transformation and merge pays a sandbox cold start, including the
  pivots the composer viz panel runs. A sandbox created while references still
  run overlaps the start with the wait, and a cache hit on references already
  complete lands before any sandbox exists.
- The results cache key includes the sandbox version (provider, template and
  runner script), so results never cross between engines or image versions.
- The sandbox runs no Lightdash JavaScript. The image is only rebuilt when its
  Dockerfile or pinned `duckdb` version changes; the runner script ships with
  the backend and its hash is part of the sandbox version.
- DuckDB versions can drift between the server (`@duckdb/node-api`) and the
  image (`duckdb` wheel). Both are pinned to the same minor, a backend test
  fails when they disagree, and the sandbox version in the cache key keeps a
  result from one image away from another. Field types and value formats are
  pinned by a parity test that runs the same SQL through node-api and the
  runner.
- A pre-aggregate worker is no longer needed for composer or merge queries,
  and its capacity serves pre-aggregates only.
