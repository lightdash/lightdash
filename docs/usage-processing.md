# Usage capture and processing

The organization `analytics-project` feature flag controls both capture and
processing. Configure it through Console, or use the standard feature-flag ENV
lists for a deployment-wide self-hosted override. The shared resolver's normal
precedence applies; user overrides do not control organization capture/jobs.
Authorization remains separate: access to managed analytics requires organization
administration permission and a matching project organization.

`USAGE_EVENTS_ENABLED` is removed and ignored. A commercial license and working
usage S3 configuration are still infrastructure prerequisites. Usage storage
continues to inherit base S3 settings unless overridden by `USAGE_EVENTS_S3_*`.
Do not rely on an old `USAGE_EVENTS_ENABLED=false` to prevent collection: use an
explicit organization off override or the standard disable list (with no
conflicting force-on). Existing enabled Analytics organizations start capturing
when this release starts, even if the old ENV gate was off.

## Capture

The existing shared event sink/writer handles every allowlisted event. `track()`
does not await a feature lookup, compression or upload. The writer's bounded
buffer is drained asynchronously; the flag is checked before group serialization
and compression. No individual event producer changes are required.

Each process keeps at most 1,000 organization flag results, including off/error
results, for 60 seconds. Concurrent requests for the same organization share a
promise. At most eight complete group operations (flag lookup, compression and
upload) run together. Flag errors fail closed. No timer polls inactive orgs.
A slow lookup can delay the flush and cause the existing bounded event buffer to
drop events; it cannot create unbounded per-event promises. Existing buffer-drop
and PUT-failure metrics still apply.

Changes take effect on the next flush after cache expiry, so allow up to 60
seconds plus flush/in-flight time. This is best-effort telemetry, not an audit
ledger. There is no data from before capture starts. Disabling capture does not
erase already captured data or retroactively cancel in-flight uploads. Other
analytics destinations and AI billing/usage tracking are unchanged.

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
queryable. Dimension snapshots reflect current inventory. Existing partition caps,
SQL timeouts and query resource limits remain. Missing several nights can consume
the catch-up window; this is a deliberate limit, not unlimited historical repair.

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
window will no longer be processed. Configure and review raw-object retention
separately, allowing margin beyond seven days; do not apply that expiry to
compacted history or pending recovery checkpoints. This change does not delete
historical files or change bucket lifecycle policy.

Canary a small organization through complete nightly cycles before broad rollout.
Check failures, dropped events, backlog, memory and reconciliation. Local loopback
benchmarks are correctness evidence, not production GCS latency predictions.
