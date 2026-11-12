# Scheduler query recovery

`SCHEDULER_ENABLED` enables the scheduler. `SCHEDULER_INCLUDE_TASKS` and
`SCHEDULER_EXCLUDE_TASKS` select its tasks. The `sweepStuckQueries` task runs
every minute. It fails rows that remain queued or executing after worker
activity stops.

`LIGHTDASH_QUERY_STUCK_TIMEOUT_SECONDS` sets the inactivity timeout. It defaults
to 86400 seconds (24 hours). Startup rejects values outside 900–2147483647
seconds, fractional values and non-integers. Restart the API and scheduler
processes after a change.

The default gives long warehouse runs a full day of silence before recovery.
It is far above the five delivery attempts with a 30-second retry delay.
A live worker can run longer than this timeout: its acknowledgement progress
path also writes `executing_heartbeat_at` at most once per minute per query.
The database also rejects heartbeat writes less than 60 seconds apart.
If no heartbeat exists, the task uses `processing_started_at`, then `created_at`.
Choose a timeout above the longest legitimate period without worker progress
on your deployment. A blocked event loop cannot send either progress signal.

Each statement locks at most 500 stale rows and skips rows locked by another
transaction. Each run executes at most 50 batches. Later runs process any
remaining backlog. Both status and inactivity are checked in the update.
Finished queries keep their results. Each failed row gets `errored_at` and:

> This query was not picked up by a worker. Try again.

Each failed row produces one info log with its query UUID, prior status,
inactivity age in seconds and configured timeout. The log contains no SQL,
results or credentials. No worker or NATS connection is needed to run recovery.
