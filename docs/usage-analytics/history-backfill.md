# Backfill retained Analytics history

Historical backfill imports selected facts that are still stored in Lightdash's
application database into the organization's Analytics project. It helps fill
gaps from before event capture was enabled, including for organizations that
already have weeks or months of captured events. It is not a replay of every
past event, a database backup restore, or an import of warehouse result rows.

The import has three destinations: **Query Events**, **AI Usage**, and
**Historical Activity**. The first two supplement existing event datasets. The
third exposes retained database facts whose meaning differs from live events.
This document describes the backfill implementation in
[PR #31585](https://github.com/lightdash/lightdash/pull/31585); availability in an
installation depends on the deployed version and Analytics configuration.

## Starting an import

New Analytics projects enqueue one background import automatically. Existing
projects offer **Settings → Lightdash analytics → Backfill available history**
to users with organization-management permission (organization administrators
by default). Permission to view the managed Analytics project alone does not
grant backfill access. Creating or using the project does not wait for
the import; enqueue failures leave the project available and the manual action
retryable. Updating built-in content does not start another import.

The action is available until a successful import is recorded, even when S3
already contains recent events. It is not gated by project age, an empty bucket,
or the absence of a particular day's file. While queued or running, the button
is disabled and the user can leave the page. A failed run can be retried. After
success, the Historical activity settings card disappears, including after a
page reload; the imported data remains available.

Settings reads job status and, when idle, makes one HEAD request for
`events/backfill/org_id=<org>/v1/complete.json`. No history scans run on page load.
Only 404 means incomplete; storage errors remain retryable errors. The worker
writes the marker after all three sources succeed, including empty/no-op runs.
The button then disappears. Direct API reruns remain authorized and idempotent.
The marker records a successful import, not continuous coverage of future rows.

## Included data and where to find it

There is no fixed 30-day, six-month or release-date lookback. Each source exports
eligible retained rows older than its own processing-start timestamp, including
today's eligible rows. The sources run serially, so this is not one transactional
snapshot of the whole database. Retention and deletion determine how far back
each source can go; the import does not guarantee any particular historical
window. A whole-day cutoff would miss gaps within partially captured days.

- **Query Events:** `READY` and `ERROR` queries from `query_history`, excluding
  preview projects and unfinished work. Failed queries include their retained
  error message, even when execution time is missing. Identity is
  `(org_id, project_id, query_id)`. Dates use submission time. Missing timing or
  event metadata stays null. Retained fields include the actor, context,
  Explore/chart/dashboard references, status, error message, warehouse execution
  time and row count. The importer does not recreate completion time, cache behavior or
  metric/dimension lineage that the source row cannot supply.
- **AI Usage:** model-call outcomes and token counts from `ai_usage_ledger`, using
  the same `(org_id, event_id)` as captured events. PostgreSQL timestamp and bigint
  precision is preserved. This includes recorded model/provider and input,
  output, cache-read, cache-write, reasoning and total token counts, where present.
  A period without retained ledger rows cannot be reconstructed from prompt
  totals: prompt aggregates are not invented model-call events.
- **Historical Activity:** the database facts below, identified by
  `(org_id, history_source, record_id)`. Their counting rules differ from native
  events, so they remain a separate Explore. Filter/group by `activity_type`
  rather than treating its total row count as a count of user actions.

| Retained sources                                                                                       | Facts                                                                                   |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `analytics_chart_views`, `analytics_dashboard_views`, `analytics_app_views`                            | Chart view-or-execution, dashboard and app view records                                 |
| `apps`, `app_versions`                                                                                 | Creation/deletion and version snapshots                                                 |
| `ai_thread`, `ai_thread_share`, `ai_thread_compaction`                                                 | Thread, sharing and compaction facts                                                    |
| `ai_prompt`, `ai_prompt_interrupt`, `ai_prompt_steer`                                                  | Prompt snapshots, stored response/latest retry times, interruption and steering records |
| `ai_agent_tool_call`, `ai_agent_tool_result`, `ai_agent_tool_call_error`                               | Tool records, without inferred completion times                                         |
| `ai_agent_reasoning`, `ai_prompt_context`                                                              | Existence and time only                                                                 |
| `ai_prompt_decision`, `ai_prompt_decision_shadow`, `ai_router_decision`                                | Routing/edit decisions and recorded outcomes                                            |
| `ai_writeback_run`, `ai_deep_research_runs`, `ai_deep_research_events`, `ai_slack_artifact_deliveries` | Run, research and delivery snapshots                                                    |
| `mcp_tool_call`, `agent_action_log`                                                                    | Recorded tool calls and permission decisions                                            |
| `download_audit`, export-specific `scheduler_log`                                                      | Download requests (not proof of success) and export jobs                                |
| `ai_eval_run`, `ai_eval_run_result`, `ai_eval_run_result_assessment`                                   | Evaluation snapshots                                                                    |
| `ai_artifacts`, `ai_artifact_versions`, `ai_thread_file`                                               | Artifact/version and file upload/claim facts                                            |

### Interpreting Historical Activity

- A legacy chart view record can represent a view or an execution. It is not
  interchangeable with a captured chart page-view event.
- A thread or prompt record proves that the retained object exists. It does not
  recreate every interaction, retry, status transition or tool completion.
  Recorded response and latest-retry timestamps can produce separate facts;
  the source does not retain a complete retry timeline.
- Statuses, feedback and prompt token aggregates describe the retained snapshot,
  not necessarily the state at its original creation time. Additional
  response/retry facts do not repeat the snapshot's aggregate fields.
- Use **AI Usage** for per-model-call token totals. Do not add prompt or research
  snapshot token totals from **Historical Activity** to those totals: the datasets
  can describe the same underlying usage at different granularities.
- A download audit row records a request, not proof of successful generation or
  delivery. Export-job records have their own stored outcomes.

Historical Activity is not added to native chart/dashboard/app view, agent
request, tool or export event totals. Existing event dashboards therefore do
not gain a historical equivalent of every event metric. Explore the historical
facts separately when their counting rules fit the question.

Names come from current dimension snapshots. Missing/deleted entities can have
unknown names; backfill does not reconstruct names or permissions as they were
at the time. It does not rebuild historical **People activity summaries**, so
an old query or view fact is not evidence that those daily summaries were filled.
Manual imports refresh model definitions without replacing customer charts or
dashboards.

## Not included

No SQL, conversation/reasoning text, tool arguments/results, file contents,
export destinations, arbitrary JSON or external identities are exported. Query
error messages are included; error text from other activity sources is not.
A file or artifact record can be included without its contents. Ownership joins
scope every source to the authorized organization.

The import also excludes:

- Deleted or expired database records and events that were never stored in a
  recoverable source. A retained deletion timestamp on an app can be imported;
  a fully removed row cannot be restored.
- Complete browser sessions, click streams, and historical lifecycle events
  inferred only from today's object state.
- Ambiguously owned SQL approvals, configuration/credential tables, operational
  outboxes and reference relationships.
- Historical People aggregates and prior versions of names, membership or
  permissions. Normal processing continues to own current metadata.

This is an allowlist of recoverable facts, not an export of every database table.

## Overlap with captured events

Query and AI imports skip identities already present in published Parquet.
For example, a query recorded in both `query_history` and captured events is
counted from the captured event, not once from each source. Identity matching
is organization-scoped and does not depend on the two records having the same
date: imported queries use submission time, while a captured event can arrive
later. If an event is still raw or arrives after backfill, the reader gives the
captured identity precedence once it becomes queryable.

This prevents the import from adding a second copy of the same query or AI
event. It does not clean up duplicate deliveries already present in the native
event data, or merge different Historical Activity facts into a single action.
Historical Activity reruns replace changed snapshots by stable identity instead
of appending another copy.

## Processing and retries

`usage-history-backfill` is a separate low-priority Graphile queue: one
backfill runs at a time among workers sharing that job database, without locking
`usage-events-compaction`. This is not a fleet-wide lock. It uses one
shared worker slot, one DuckDB thread and a 256 MB DuckDB limit. This is not a
dedicated worker or a total process memory limit; a deployment with only one
worker slot cannot run both jobs concurrently.

DB exports use 1,000-row keyset pages and read-only transactions with 10-second
statement/one-second lock timeouts. Connections are released between pages.
Sources run serially; temp files are cleaned up. Storage limits fail closed.
Jobs have one execution attempt; failures require a manual retry rather than
automatically repeating the import or waiting for the nightly schedule.

Each source atomically publishes queryable Parquet at
`events/compacted/org_id=<org>/history=<stream>/history.parquet`. No additional
compaction is needed; it does not trigger or wait for the nightly compactor.
Sources become available as they are published, so a partial run can expose
completed sources before the overall job finishes. Refresh charts to fetch the
new data rather than relying on cached results.
Backfill does not read/delete raw events or write dimension
snapshots. Normal initial/daily processing exclusively owns those files; new
projects may show unknown names until initial processing publishes metadata.

Reruns preserve previously imported rows after DB retention; changed Historical
Activity snapshots replace their existing identities. Unchanged sources are not
republished. Failed uploads preserve existing objects; failed sources or marker
writes leave the job retryable without duplicating completed sources.

Import resource limits are separate from interactive query limits. Successfully
writing historical files does not establish that every all-history chart will
fit its query budget. Combined history/backfill scale and deployment resource
validation are tracked in [PROD-12617](https://linear.app/lightdash/issue/PROD-12617).

## Implementation references

- [Source definitions and identities](../../packages/backend/src/analytics/eventStream/usageHistorySources.ts)
- [Query history export](../../packages/backend/src/models/UsageQueryHistoryModel.ts)
- [Legacy views and app records](../../packages/backend/src/models/UsageLegacyHistoryModel.ts)
- [AI ledger and additional historical facts](../../packages/backend/src/models/UsageAdditionalHistoryModel.ts)
- [Coordination and completion marker](../../packages/backend/src/analytics/eventStream/UsageHistoryBackfill.ts)
- [Source reconciliation and publication](../../packages/backend/src/analytics/eventStream/UsageQueryHistoryBackfill.ts)

## Retirement

Review removal on 26 January 2027: [PROD-12599](https://linear.app/lightdash/issue/PROD-12599/review-retiring-analytics-history-backfill).

Remove the Settings component/hooks and backfill API/status type, automatic
schedule call, scheduler task/client methods, `UsageHistoryBackfill`,
`UsageQueryHistoryBackfill`, the four `Usage*HistoryModel` classes and their DI
wiring/tests. Stop accepting new jobs and drain queued backfills before removing
the handler. There is no database migration, recurring schedule or compactor
branch to undo.

Keep published history objects and their read support: `usageHistorySources`,
`queryHistoryBackfill`, the Historical Activity Explore, S3 history discovery and
captured-over-fallback precedence. Removing the importer must not remove already
imported data or allow late captured events to double-count it.
