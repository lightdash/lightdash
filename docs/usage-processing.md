# Usage capture and processing

Usage capture runs for every organization on deployments with a commercial
license and working usage S3 configuration. The organization `analytics-project`
feature flag controls processing and analytics availability, not raw collection.
Configure the flag through Console, or use the standard feature-flag ENV lists
for a deployment-wide self-hosted override. The shared resolver's normal
precedence applies; user overrides do not control organization jobs.
Authorization and organization isolation remain separate from capture.

`USAGE_EVENTS_ENABLED` is removed and ignored. Usage storage continues to inherit
base S3 settings unless overridden by `USAGE_EVENTS_S3_*`. Disabling the
`analytics-project` flag does not stop raw uploads. This behavior applies to all
configured deployments, including self-hosted commercial deployments, not just
shared Cloud instances.

## Capture

The existing shared event sink/writer handles every allowlisted event. `track()`
does not await compression or upload. The bounded buffer is drained asynchronously
with at most eight complete serialization/compression/upload operations at a time.
Capture does not look up organization feature flags or require project creation.
Existing buffer-drop and PUT-failure metrics still apply. This is best-effort
telemetry, not an audit ledger; process interruption or exhausted upload retries
can lose buffered events.

Collection starts when the configured deployment runs this code. There is no data
from before capture starts. Flag-disabled organizations retain raw events for
possible later processing, but the seven-day processing window below still
applies. Other analytics destinations and AI billing/usage tracking are unchanged.

## Nightly and manual processing

The existing serial `usage-events-compaction` scheduler queue runs at 00:30 UTC,
with no whole-job retries. At the start of every run, eligibility is resolved
through the standard flag model for each organization. Only eligible orgs enter
raw compaction, dimension export and user-summary generation. Eligibility is a
run snapshot; changing a flag does not cancel a running pipeline. Access checks
for subsequent user queries continue to evaluate their own flag and permissions.

Only the previous seven closed UTC dates are processed. For a run on 8 October,
that is 1–7 October inclusive. Current-day events wait for the next run; raw events
older than that window are left unprocessed. Existing published history stays
queryable. Dimension snapshots reflect current inventory. Each run processes at
most 5,000 raw stream/day partitions and, independently, 5,000 changed or failed
user-summary partitions. Deferred work remains for a subsequent run within this
window. Processing remains serial, with one DuckDB thread and a 256 MB managed-memory
limit; SQL timeouts and query resource limits remain. Missing several nights can consume
the catch-up window; this is a deliberate limit, not unlimited historical repair.

The partition budget is not a runtime guarantee. Graphile Worker 0.13 expires job
and queue locks after four hours without a heartbeat. Usage processing renews both
owned locks every minute, including a fresh ownership check before successful
completion. Renewal is conditional on the exact job, worker and queue identity;
a mismatch or database failure cancels processing. SQL renewal has a 10-second
statement timeout and a 5-second lock timeout; a 15-second watchdog also cancels
work if acquiring a connection or renewal stalls. No other task's lease changes.
Normal crashes still recover through Graphile's four-hour expiry, with no durable
orphan marker or manual unlock requirement.

Cancellation interrupts active native SQL and aborts storage requests. It is
awaited before returning the task; no timeout races an uncanceled pipeline.
Raw conversion stages one partition's Parquet file on local temporary disk, then
publishes it through the SDK. Only successful publication permits raw deletion.
This avoids relying on the validity of interrupted native remote COPY output
when checkpoint recovery checks whether publication completed. Final object names and
pending input manifests remain unchanged, and temporary files are removed after
native work settles. Allow temporary disk for one partition per processing worker.

Usage processing is exempt from the generic scheduler's one-hour stuck-job
failure rule; its dedicated lifecycle metrics and runtime/failure alerts remain
the monitoring source. Metric start times remain independent of renewed queue
lock timestamps. Recheck the renewal SQL and cancellation tests before upgrading
Graphile Worker: this helper intentionally depends on the installed 0.13 schema.
Deploy the guard to all workers before expanding processing; old workers do not
renew their leases.

The explicit `build-usage-user-activity` command also checks the organization flag
and rejects dates older than this window. It remains a privileged maintenance
script, using the configured production database/usage storage. A newly enabled
organization can receive the existing no-data error until a successful nightly
run. Project creation does not enable capture or run a backfill.

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
window will no longer be processed. Raw data for flag-disabled organizations is not compacted or cleaned up by this
pipeline and accumulates under the existing bucket retention policy. Retaining
months of raw data does not enable historical catch-up beyond seven days. This
change adds no expiry policy, archive, or historical backfill; successful
compaction still deletes its exact raw inputs after publishing Parquet.

Canary a deployment before broad rollout: uploads now include flag-disabled orgs.
Check failures, dropped events, backlog, memory and reconciliation. Local loopback
benchmarks are correctness evidence, not production GCS latency predictions.
