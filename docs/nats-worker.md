# NATS worker

The NATS worker (`packages/backend/src/natsWorker.ts`) runs async queries off
the API process when `NATS_ENABLED=true`. The API publishes a job per query on
a JetStream subject; a worker pulls it and runs the query from its
`query_history` row. With `NATS_ENABLED` unset every query runs in the API
process, including pre-aggregate materializations.

## Streams

| Stream | Subjects | Registered |
|---|---|---|
| `WAREHOUSE_QUERY_JOBS` | `warehouse.query.jobs` | always |
| `DUCKDB_QUERY_JOBS` | `duckdb.query.jobs` (merges, compose SQL) | always |
| `PRE_AGGREGATE_QUERY_JOBS` | `pre_aggregate.query.jobs`, `pre_aggregate.materialization.jobs` | valid enterprise licence |

`pre_aggregate.duckdb.jobs` is still consumed but no longer published to; it
drains messages an older API pod published during a rolling upgrade.

## One worker, every stream

A worker takes no arguments and consumes every stream registered in its
process. There is no way to pin a worker to a subset of streams, so a fleet
can never leave a stream without a consumer. The retired `--stream` flag is
ignored with a warning; remove it from the worker command.

Why: the API enqueues pre-aggregate queries and materializations with no
in-process fallback. A worker pinned to `warehouse` never consumes them, so
the query sits `QUEUED` for good (the queue timeout only fires when a worker
claims the row). With no pre-aggregate worker ever started, the stream does
not exist and the enqueue fails outright. Both were reachable from the helm
chart by enabling one worker deployment and not the other.

## Sizing with per-stream concurrency

Pull loops are sized per stream inside one process:

| Variable | Default |
|---|---|
| `NATS_WORKER_CONCURRENCY` | `1`, the default for every stream |
| `NATS_WORKER_CONCURRENCY_WAREHOUSE` | `NATS_WORKER_CONCURRENCY` |
| `NATS_WORKER_CONCURRENCY_PRE_AGGREGATE` | `NATS_WORKER_CONCURRENCY` |
| `NATS_WORKER_CONCURRENCY_DUCKDB` | `NATS_WORKER_CONCURRENCY` |

Every value must be greater than 0. A materialization spools its full result
to `os.tmpdir()` as JSONL before converting it to Parquet, so a worker that
can run pre-aggregate jobs needs disk for
`NATS_WORKER_CONCURRENCY_PRE_AGGREGATE` results at once and memory for
DuckDB. Keep that concurrency low (Lightdash Cloud runs 8) and give `/tmp`
a volume; warehouse queries stream straight to S3 and can run at a far higher
concurrency on the same pod.

The warehouse client pool on a worker is sized to
`NATS_WORKER_CONCURRENCY_WAREHOUSE + NATS_WORKER_CONCURRENCY_PRE_AGGREGATE`,
since both warehouse queries and materializations hold a connection.

## Pre-aggregates on self-hosted

Licence key + pre-aggregate bucket = pre-aggregates on. A NATS worker is
recommended, never required: without one, queries and materializations run in
the API process; with one, it already consumes the pre-aggregate stream.
