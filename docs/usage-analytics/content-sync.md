# Automatic analytics content updates

After compaction finishes, the ordinary worker queues analytics content reconciliation.
A separate worker uses the existing managed-organization iterator to enqueue one
sync job per organization, then calls the existing analytics status and sync methods.
The manual **Sync content** button remains available.

Run the dedicated worker with `SCHEDULER_INCLUDE_TASKS=reconcileAnalyticsContent,syncAnalyticsContent`,
`SCHEDULER_CONCURRENCY=1` and `PGMAXCONNECTIONS=3`. These tasks are excluded from
ordinary worker defaults. Deploy application support first, then enable the Helm
`analyticsContentWorker` with the same image. Without it, sync jobs stay queued.

The worker uses a current active organization administrator and the existing
permission checks; content versions are attributed to that administrator.
An organization without an eligible admin cannot sync automatically. Each job
retries independently, without rerunning compaction or blocking other organizations.

One hash in the existing content-as-code snapshots records successful installation
of models, charts and dashboards. Unchanged intact content is skipped. Failed
installation leaves the previous marker so retries can use the existing installer.
There is no new table, migration, user type or credential. Managed dashboard edits
are replaced on shipped updates; custom copies and existing access are preserved.

Content sync updates definitions. Data freshness still depends on successful
compaction and metadata refresh; it is not a data backfill.
