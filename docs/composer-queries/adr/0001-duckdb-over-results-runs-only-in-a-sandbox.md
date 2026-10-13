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
their result files into the sandbox, runs the statement there with the same
DuckDB warehouse client the server uses, reads the result back, validates it
and uploads it. The sandbox gets no credentials and no egress, and its DuckDB
session is locked to its input directory before any input loads. The worker
path, its NATS job subjects and the in-process fallback are removed. Managed
pre-aggregates and external sources read their own parquet and keep their
DuckDB in a server process; this decision does not cover them.

## Considered options

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
- The sandbox image is published with every release and must be built from
  the same commit as the server, because it runs the server's DuckDB client.
- A pre-aggregate worker is no longer needed for composer or merge queries,
  and its capacity serves pre-aggregates only.
