# PROD-12232 feature report

Goal: Make retained usage history available after creating a managed analytics project, without waiting for the nightly run.

Approach: Persist the project, enqueue one organization-scoped job on the existing serial compaction queue, and reuse raw compaction, dimension refresh and User activity generation. Allow authenticated empty storage during provisioning.

Live validation: Isolated local PostgreSQL, MinIO and the running Lightdash UI, on 19 October 2026. Signed in as the seeded demo admin and ran a seeded Jaffle Shop revenue chart (2,397). Created the analytics project through Settings with raw history and no compacted files. The initial worker job completed in approximately 759 ms; the creation response continued its existing dashboard installation and did not wait for processing. Query events Explore returned exactly 7. Native Parquet reconciliation found 7 query events and 7 User activity events, six dimension snapshots and a membership snapshot. Today's events, events older than seven days, and another enabled organization's raw data remained untouched; that organization received zero outputs. Two concurrent repeat-create requests returned the existing project and caused no additional processing job.

Tests: 869 tests across seven affected backend files; backend typecheck; targeted lint and formatting; diff checks and commit hooks. Covered scoped processing, flag recheck, empty storage, storage failure, enqueue failure after persistence, existing project reuse and unscoped nightly payloads.

Compatibility: No REST response or persisted schema changes. Existing cron schedule, closed-day bounds, limits, recovery, content-sync behavior and authorization remain.

Regression risk: Medium: a new payload scope is consumed by the existing worker; absence preserves the fleet-wide nightly run.

Open questions: None.
Confidence: 96%.
Status: Implemented and locally verified; PR review and CI remain.

Skill improvement: Use the repository's isolated-worktree runbook for runtime setup; its assigned ports and namespaced process rules supersede the skill's generic localhost and restart instructions.
