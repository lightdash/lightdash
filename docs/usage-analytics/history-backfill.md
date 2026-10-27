# Backfill retained Analytics history

New Analytics projects enqueue one background import automatically. Existing
projects offer **Settings → Lightdash analytics → Backfill available history**
to organization administrators. Creating or using the project does not wait for
the import; enqueue failures leave the project available and the manual action
retryable. Updating built-in content does not start another import.

Settings reads job status and, when idle, makes one HEAD request for
`events/backfill/org_id=<org>/v1/complete.json`. No history scans run on page load.
Only 404 means incomplete; storage errors remain retryable errors. The worker
writes the marker after all three sources succeed, including empty/no-op runs.
The button then disappears. Direct API reruns remain authorized and idempotent.
The marker records a successful import, not continuous coverage of future rows.

## Recovered data

All retained dates are eligible, including completed work before the job starts
today. A date cutoff would miss gaps within partially captured days.

- **Query Events:** successful warehouse queries and execution errors from
  `query_history`, excluding previews and unfinished work. Identity is
  `(org_id, project_id, query_id)`. Dates use submission time. Missing timing or
  event metadata stays null.
- **AI Usage:** model-call outcomes and token counts from `ai_usage_ledger`, using
  the same `(org_id, event_id)` as captured events. PostgreSQL timestamp and bigint
  precision is preserved. Prompt aggregates are not invented model-call events.
- **Historical Activity:** the database facts below, identified by
  `(org_id, history_source, record_id)`. Their counting rules differ from native
  events, so they remain a separate Explore. Filter/group by `activity_type`.

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

Statuses/feedback reflect current retained snapshots. Additional response/retry
facts do not repeat snapshot aggregates. Names come from current dimensions;
backfill does not reconstruct historical names, permissions or People activity.
Manual imports refresh model definitions without replacing customer content.

No SQL, conversation/reasoning text, errors, tool arguments/results, file
contents, export destinations, arbitrary JSON or external identities are
exported. Ownership joins scope every source to the authorized organization.
Deleted/expired database rows and events with no retained equivalent cannot be
recovered. Ambiguously owned SQL approvals, configuration/credential tables,
operational outboxes and reference relationships are excluded.

## Processing and retries

`usage-history-backfill` is a separate global low-priority Graphile queue: one
backfill runs at a time without locking `usage-events-compaction`. It uses one
shared worker slot, one DuckDB thread and a 256 MB DuckDB limit. This is not a
dedicated worker or a total process memory limit; a deployment with only one
worker slot cannot run both jobs concurrently.

DB exports use 1,000-row keyset pages and read-only transactions with 10-second
statement/one-second lock timeouts. Connections are released between pages.
Sources run serially; temp files are cleaned up. Storage limits fail closed.

Each source atomically publishes queryable Parquet at
`events/compacted/org_id=<org>/history=<stream>/history.parquet`. No additional
compaction is needed. Backfill does not read/delete raw events or write dimension
snapshots. Normal initial/daily processing exclusively owns those files; new
projects may show unknown names until initial processing publishes metadata.

Query/AI imports skip identities already in published data. If capture is still
raw or arrives later, the query reader prefers the captured identity over the
fallback across all dates. History is never added to native view/tool totals.
Reruns preserve previously imported rows after DB retention; changed Historical
Activity snapshots replace their existing identities. Unchanged sources are not
republished. Failed uploads preserve existing objects; failed sources or marker
writes leave the job retryable without duplicating completed sources.

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
