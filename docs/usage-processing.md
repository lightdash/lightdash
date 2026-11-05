# Usage capture and processing

Managed Analytics is available by default on deployments with a validated
commercial license and configured usage storage. The retired `analytics-project`
organization flag no longer controls availability or processing. Existing role
and project authorization and organization isolation remain in force.

Capture is enabled for every organization when the deployment has a license key
and configured usage storage. There is no Analytics rollout flag or dedicated
ENV opt-out. Other telemetry destinations and AI billing are unchanged.

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
from before capture starts. Previously captured raw events are processed as described below. Other analytics destinations and AI billing/usage tracking are unchanged.

## Nightly and manual processing

The existing serial `usage-events-compaction` scheduler queue runs at 00:30 UTC,
with no whole-job retries. Nightly runs select only organizations with a managed
Analytics project (`projects.provisioning_source = 'analytics'). Regular, preview
and playground projects alone do not qualify. Explicit organization-scoped runs,
including initial processing on project creation, retain their existing scope.
The worker checks deployment availability before processing. There are no
per-organization rollout queries. Deleting the managed project excludes the
organization from future nightly selection; it does not cancel already selected
or organization-scoped jobs, stop event capture, or delete stored data. An
administrator can create the project again. Query access separately checks
availability and permissions.

Initial and nightly processing prioritizes the previous seven closed UTC dates.
Current-day events wait for the next run; existing published history stays
queryable. Dimension snapshots reflect current inventory. Recent processing has
a 5,000-partition budget; follow-up history jobs process retained older raw events
in batches of 100, with independent user-summary budgets. Deferred work remains
for subsequent batches. Processing remains serial, with one DuckDB thread and a
256 MB managed-memory limit; SQL timeouts and query resource limits remain.

The partition budget is not a runtime guarantee. Graphile Worker expires job and
queue locks after four hours; monitor processing times and backlog before increasing
rollout cohorts so that scheduled and initial processing jobs do not overlap.

The explicit `build-usage-user-activity` command also checks validated commercial
registration, and rejects dates older than the seven-day window.
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
already duplicated parts from older releases. Raw data for organizations without
Analytics projects is retained under the existing bucket retention policy.
Creating a project queues recent processing followed by retained-history batches;
only raw events still present in storage can be recovered. Successful compaction
deletes its exact raw inputs after publishing Parquet. Project deletion does not
remove previously published Parquet or raw objects.

Check failures, dropped events, backlog, memory and reconciliation. Local loopback
benchmarks are correctness evidence, not production GCS latency predictions.
