# Automatic analytics content updates

Nightly compaction starts at 00:30 UTC. After compaction, the scheduler queues
analytics content reconciliation as a separate background job. It uses the existing managed-organization iterator,
restricted to organizations with an analytics project, to enqueue one sync job per
organization, then calls the existing analytics status and sync methods.
Organization admins can trigger recovery with `POST /api/v1/org/analytics-project/sample-content`.

The existing scheduler includes `reconcileAnalyticsContent` and `syncAnalyticsContent`
by default; no extra worker deployment is required. Deployments with an explicit
`SCHEDULER_INCLUDE_TASKS` allowlist must include these tasks. They can be disabled
with `SCHEDULER_EXCLUDE_TASKS`, or assigned to a separate worker using the existing
include/exclude configuration.

Sync jobs use low priority, per-organization deduplication and a shared queue that
serializes installations. Compaction only enqueues reconciliation and releases its
own queue; it does not wait for content installation. These jobs share scheduler
capacity and occupy a worker slot while running.

The worker uses a current active organization administrator and the existing
permission checks; content versions are attributed to that administrator.
An organization without an eligible admin cannot sync automatically. Each job
retries independently, without rerunning compaction or blocking other organizations.

One hash in the existing content-as-code snapshots records successful installation
of models, charts and dashboards. Sync also publishes a default homepage when
one is absent and provisions an Analytics agent for eligible projects that lack one.
Unchanged intact content is skipped. Failed
installation leaves the previous marker so retries can use the existing installer.
There is no new table, migration, user type or credential. Managed dashboard edits
are replaced on shipped updates; custom copies and existing access are preserved.

Content sync updates definitions. Data freshness still depends on successful
compaction and metadata refresh; it is not a data backfill.
