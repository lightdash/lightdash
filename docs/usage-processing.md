# Usage capture and processing

Managed Analytics is available by default on deployments with a validated
commercial license and configured usage storage. The retired `analytics-project`
organization flag no longer controls availability or processing. Existing role
and project authorization and organization isolation remain in force.

Set `LIGHTDASH_DISABLE_ANALYTICS=true` and restart API, scheduler and NATS workers
to opt out of managed Analytics, new usage-event capture and processing. Unset or
`false` enables the feature. This does not delete stored data or change unrelated
telemetry and AI billing. See [access](usage-analytics/access.md).

`USAGE_EVENTS_ENABLED` remains removed and ignored. Usage storage continues to
inherit base S3 settings unless overridden by `USAGE_EVENTS_S3_*`.

## Capture

The existing shared event sink/writer handles every allowlisted event. `track()`
does not await compression or upload. The bounded buffer is drained asynchronously
with at most eight complete serialization/compression/upload operations at a time.
Capture does not look up organization feature flags or require project creation.
Existing buffer-drop and PUT-failure metrics still apply. This is best-effort
telemetry, not an audit ledger; process interruption or exhausted upload retries
can lose buffered events.

Collection starts when the configured deployment runs this code. There is no data
from before capture starts. Previously captured raw events remain subject to the seven-day processing
window below. Other analytics destinations and AI billing/usage tracking are unchanged.

## Nightly and manual processing

The existing serial `usage-events-compaction` scheduler queue runs at 00:30 UTC,
with no whole-job retries. Each run selects every organization with at least one
project, including a retained managed Analytics project. Organizations without
projects are skipped. There are no per-organization rollout queries. The worker
checks deployment availability before processing; query access separately checks
availability and permissions.

Only the previous seven closed UTC dates are processed. For a run on 8 October,
that is 1–7 October inclusive. Current-day events wait for the next run; raw events
older than that window are left unprocessed. Existing published history stays
queryable. Dimension snapshots reflect current inventory. Each run processes at
most 5,000 raw stream/day partitions and, independently, 5,000 changed or failed
user-summary partitions. Deferred work remains for a subsequent run within this
window. Processing remains serial, with one DuckDB thread and a 256 MB managed-memory
limit; SQL timeouts and query resource limits remain. Missing several nights can consume
the catch-up window; this is a deliberate limit, not unlimited historical repair.

The partition budget is not a runtime guarantee. Graphile Worker expires job and
queue locks after four hours; monitor processing times and backlog before increasing
rollout cohorts so that scheduled and initial processing jobs do not overlap.

The explicit `build-usage-user-activity` command also checks validated commercial
registration and the deployment opt-out, and rejects dates older than this window.
It remains a privileged maintenance script using the configured usage storage.
An organization can receive the existing no-data error until processing succeeds.
Project creation can enqueue the initial processing and retained-history import;
it does not control capture.

## Recovery and retention

Before publishing a Parquet part, compaction writes its exact input keys to
`events/compaction/org_id=…/stream=…/dt=…/pending.json`. It retains the checkpoint
until raw deletion completes. A rerun checks whether that deterministic output
already exists and resumes deletion without publishing survivors as a second
part. Late arrivals remain for a subsequent run. These checkpoint objects are
outside the queryable Parquet namespace and contain object keys, not event data.
The existing scheduler queue serializes runs: do not invoke competing standalone
compactors against the same bucket. A rollback to the old compactor must wait
until pending cleanup has completed.

This prevents new partial-cleanup duplication; it does not identify or repair
already duplicated parts from older releases. Raw objects whose dates leave the
window will no longer be processed. Raw data for organizations without projects
is not compacted or cleaned up by this pipeline and remains under the existing bucket retention policy. Retaining
months of raw data does not enable historical catch-up beyond seven days. This
change adds no expiry policy, archive, or historical backfill; successful
compaction still deletes its exact raw inputs after publishing Parquet.

Check failures, dropped events, backlog, memory and reconciliation. Local loopback
benchmarks are correctness evidence, not production GCS latency predictions.
