# Nightly usage processing monitoring

The scheduler exports processing signals through its existing Prometheus endpoint
when Prometheus is enabled. JSON logs also emit `Usage processing stage started`
and `Usage processing stage finished`, with a per-run `runId`, stage, duration in
seconds and outcome. Run IDs appear only in logs, never metric labels. No event
payloads or error strings are added to these lifecycle logs.

Stages are `compaction` (raw files to Parquet), `dimensions` (all inventory
snapshots), `users` (user summaries), and `pipeline` (the complete sequence).
These are not per-model/per-organization timers. Existing scheduler job IDs and
pod/release metadata provide deployment context.

## Signals

All names below have the prefix `lightdash_usage_processing_`.

| Metric | Labels | Meaning |
| --- | --- | --- |
| `enabled` | None | 1 when this scheduler is configured with usage capture, storage and the compaction task; otherwise 0. Set at worker startup, even before the first run. |
| `running` | `stage` | 1 while a stage is executing, 0 after it returns or throws. |
| `last_started_timestamp_seconds` | `stage` | Most recent observed stage start in this process. |
| `last_finished_timestamp_seconds` | `stage`, `outcome` | Most recent finish **for each outcome** in this process. |
| `duration_seconds` | `stage`, `outcome` | Histogram including successful, partial and failed runs. Its `_count` counts terminal runs and `_sum` accumulates seconds. |
| `work` | `stage`, `state` | Last returned stage summary: `failed`, `remaining`, or `limit_reached`. Absent while the stage is running, or if it throws before returning a summary. |

Outcomes:

- `success`: no reported failures or known remaining work. An enabled instance
  with no events is healthy and can succeed. Unchanged user summaries count as
  complete.
- `partial`: no reported failures, but a work cap, deferred user partitions or
  unknown raw streams prevented full catch-up.
- `failed`: a stage threw, or reported failed partitions/snapshots. Raw partition
  failures still allow subsequent stages to run, as before, but the full pipeline
  is reported as failed even if its scheduler handler returns normally.

The pipeline success timestamp advances only when **all stages complete**. A
successful dimensions stage cannot mask a failed compaction stage. Later failures
and partial runs retain the previous success timestamp and have their own finish
timestamps. Stages not reached have no new samples.

Work counts have different units: raw org/stream/day partitions for compaction,
org/dimension snapshots for dimensions, and org/stream/day partitions for users.
Do not sum counts across stages. `remaining` includes failures. For raw compaction
it also includes skipped unknown streams. For users it counts observed failures
and deferrals; `limit_reached=1` means additional unvisited work exists, whose
size is unknown. Monitoring does not perform another inventory scan to count it.
Exactly reaching the user work limit with nothing left does not mark it partial.

The existing `lightdash_usage_events_compaction_run_duration_ms` keeps its
previous raw-compaction-only semantics. Use the new pipeline histogram for total
time, including dimensions and user summaries. Existing ingestion/drop/storage
metrics remain available separately.

## Restart and replica semantics

These are process-local metrics, not a new persistence layer. Never initialize
freshness to startup time. A replacement or idle replica emits no completion
timestamp until it observes a completion. Scrape history and lifecycle logs must
be retained across rollouts. Use deployment identity labels (including project,
cluster and namespace), not just pod name, when aggregating replicas. Filter to
scheduler workers; API processes can expose the registered metrics too.

For a deployment's last complete refresh, take the maximum of historical
`last_finished_timestamp_seconds{stage="pipeline",outcome="success"}` samples
across its workers, with a lookback exceeding the stale-data threshold (for
example 48 hours for a provisional 30-hour threshold). Do **not** use the time of
the scrape as the completion time. A missing success series means unknown/never
observed, not healthy or zero age. Handle that explicitly, gated by enabled
deployment inventory and an initial-enablement grace period. Once the lookback
expires, old success falls out and the missing-success condition must still alert.

Failures and partial results need separate alerts even when the last complete
refresh is recent. Compare their latest finish timestamps with the latest
complete refresh; do not average outcomes or discard a failed replica because
another replica is idle. Do not sum old and new pods' `work` gauges. Show counts
from the stage's latest run, selected by its start/finish timestamps, or use the
corresponding run's lifecycle log.

For live runtime, use `running=1` and elapsed time since that same pod/stage's
start. A killed process cannot emit a finish or clear its gauge: missing scrapes,
pod health, unmatched start/finish logs and stale completion must cover this case.
Fast runs or crashes before the next scrape may be visible only in logs. Metrics
collection failures log a warning and never change processing outcomes.

## Alert rollout and response

Alert policies, routing, dashboard queries and rule tests are tracked separately
in **PROD-11740**. This instrumentation does not activate notifications or create
incidents. Rules must cover explicit failure, partial output, excessive runtime,
missing runs, initial enablement, disabled capture, pod replacement and recovery.
Validate aggregation against actual cloud scrape labels before activation.

On an alert, inspect the matching scheduler job and lifecycle logs, stage counts,
retained snapshots, and database locks. A complete heartbeat reflects
the known work listed by that run, not proof against late-arriving events or a
check of every output row. Reconcile output data separately when needed.

Nightly jobs make one attempt and the next nightly run catches up. The cron
missed-schedule backfill window can still enqueue a run after a restart. Do not
automatically force retries or backfills as an alert response. See PROD-11701 for
the performance evaluation required before expanding rollout.
