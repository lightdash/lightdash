# Automatic analytics content updates

Existing analytics projects receive shipped model and default-dashboard updates
after nightly usage processing. New fields become available without asking an
organization administrator to synchronize the project. Built-in dashboard edits
are replaced by shipped definitions; duplicate a dashboard to customize it.
Custom charts and dashboards with other slugs are preserved.

## Execution and isolation

The compaction worker enqueues `reconcileAnalyticsContent` after the processing
attempt finishes. It does not compile models or install dashboards itself.
Reconciliation pages existing marked analytics projects and enqueues one
`syncAnalyticsContent` job per project. Organizations without new events are
included. Both steps recheck organization feature enablement; a deleted or
replaced project is skipped. No project is provisioned by these jobs.

Run these tasks in a separate scheduler process or pod:

```sh
SCHEDULER_INCLUDE_TASKS=reconcileAnalyticsContent,syncAnalyticsContent \
SCHEDULER_CONCURRENCY=1 \
PGMAXCONNECTIONS=3 \
PORT=8082 \
pnpm -F backend scheduler
```

Use the same application release, database and commercial configuration as the
API. Give this process its own CPU/memory limits and health checks. The Helm
`analyticsContentWorker` deployment provides this topology when enabled.
Ordinary scheduler and API task defaults exclude these tasks, including when
`SCHEDULER_EXCLUDE_TASKS` is used. Explicit task inclusion is required. A dedicated
worker registers only cron entries belonging to its enabled tasks.

Deploy the application support before enabling the dedicated worker. If no
dedicated worker is running, jobs remain queued; they are never picked up by the
ordinary worker as a fallback. Manual **Sync content** remains available for
repair and installations that have not configured the worker.

## Idempotency, attribution and failures

The installed model/content hash and release reuse the existing
`content_as_code_snapshots` table, under an internal `analytics_bundle` type.
No schema migration or new storage service is needed. Unchanged definitions with intact managed inventory are
skipped. Missing managed models or content can be repaired. A successful new
release is not overwritten by an older worker during a rolling deployment.

Manual and automatic updates share the organization provisioning lock, collision
checks, model-before-chart ordering and existing space/access preservation.
Background updates reuse one inactive internal user named Analytics system
with authority scoped to the resolved analytics project. It has no email,
password, sign-in identity, API token, or organization membership. Its UUID is
derived from the project, so retries reuse the same row without a new registry.

Reconciliation and project updates have independent deduplicated jobs with bounded
retries. An enqueue or content failure never retries compaction. Other project
updates can proceed independently. The next daily processing attempt also
enqueues reconciliation, recovering a missed enqueue.

Installation remains retryable rather than one bundle-wide database transaction:
an interrupted update can leave some items updated. The installed hash advances
only after all models, charts and dashboards succeed. Errors retain the previous
successful marker. Inspect the dedicated worker's jobs and structured logs;
content-update success does not imply successful data processing.

## Data freshness

This updates definitions, not event files or metadata snapshots. Names and emails
reflect the latest successful dimension refresh. The nightly pipeline refreshes
those snapshots before the content reconciliation job is queued. A failed data
refresh does not prevent independently useful model or dashboard updates.
Historical events do not need rebuilding when a new metadata field is exposed.
