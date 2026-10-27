# Backfill retained Analytics history

Organization administrators can use **Settings → Lightdash analytics → Backfill
available history** to recover the analytics facts still retained in this
installation's database. There is one action and one queued job covering all
sources below. Settings reads job status and checks one small, organization-scoped
completion object: `events/backfill/org_id=<org>/v1/complete.json`. It never exports
DB history, lists event files or runs DuckDB to decide whether to show the action.
The worker writes this marker only after all sources succeed, including empty or
already-covered sources. The action then disappears. An old event file alone is
not evidence that all retained history has been imported.

Completion means this version of the backfill succeeded, not continuous coverage
of future database records or changed snapshots. Direct API reruns remain safe
and supported; bump the marker version if the source set or import semantics
change. No date cutoff is used: partially captured dates can still contain gaps.

New Analytics projects queue the same combined import automatically after their
initial event-processing job, in the existing serial queue. Project creation
does not wait for processing. Existing projects use the manual action; refreshing
or reopening a project does not schedule another import automatically. Enqueue
and execution failures leave the manual action available for recovery.

## Requirements

Cloud and licensed self-hosted deployments use the same action. They need an
Analytics project, the `analytics-project` flag, enabled/configured
`USAGE_EVENTS_S3_*` storage and a running scheduler worker. The storage identity
must list/read usage objects and publish this organization's dimensions and
history objects. See [storage setup](local-testing.md#configure-and-provision).
The import uses this installation's PostgreSQL database and usage storage; it
does not fetch historical RudderStack events or another deployment's data.

All retained eligible records before the check/import's start time are
considered, including completed work from today. There is no lower date limit,
Analytics-enablement cutoff or assumption that an already populated date is
complete. Customers with months of captured events can recover older history and
gaps within those dates. Configured database retention is not an import cutoff:
older rows are included if they still exist and can be attributed safely.

## Native event coverage

Two sources have identities that can safely reconcile with captured events:

| PostgreSQL source | Analytics stream              | Reconciliation identity                         |
| ----------------- | ----------------------------- | ----------------------------------------------- |
| `query_history`   | `query_events` / Query Events | Organization, project and query UUID            |
| `ai_usage_ledger` | `ai_usage` / AI usage         | Organization and the original shared `event_id` |

Query history contributes successful queries and errors with recorded warehouse
execution evidence. Preview projects, unfinished/expired/cancelled work and
errors before warehouse execution are excluded. Timestamps are retained query
submission times, not inferred completion times. Recorded warehouse duration,
row count, context and actor/content IDs are imported; unavailable latency,
cache and event metadata remain null.

The AI ledger contributes recorded model-call outcomes, features, models,
providers, channels and token counts. Its `event_id` is the same identity used by
the captured AI event. Database timestamps and bigint token values preserve
PostgreSQL precision. Fields absent from the ledger remain null; external user
identities are excluded. Prompt token aggregates are not substituted for missing
model-call events.

Captured events take precedence over historical fallbacks, even if the captured
copy arrives later or has a different date. Existing live-event counting
semantics are preserved. Queries do not become content views.

## Historical Activity coverage

The remaining retained records have different identities or counting rules from
captured events. They appear in one **Historical Activity** Explore, separate
from native view, request, tool and token totals. Every record identifies its
physical `history_source`, stable `record_id` and explicit `activity_type`.
Known internal IDs, recorded timestamps, statuses and selected numeric fields
are included; unavailable fields remain null.

| Retained PostgreSQL sources                                                 | Recoverable facts                                                                                                                             |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics_chart_views`, `analytics_dashboard_views`, `analytics_app_views` | Legacy chart view-or-execution records, dashboard views and app views. Legacy chart records are not reclassified as standalone chart fetches. |
| `apps`, `app_versions`                                                      | Retained app creation/deletion timestamps and version creation/current status.                                                                |
| `ai_thread`, `ai_thread_share`, `ai_thread_compaction`                      | Recorded threads, share creation/revocation and compaction facts.                                                                             |
| `ai_prompt`, `ai_prompt_interrupt`, `ai_prompt_steer`                       | Prompt snapshots, actual stored response timestamps, the latest recorded retry, interruptions and steering creation/consumption.              |
| `ai_agent_tool_call`, `ai_agent_tool_result`, `ai_agent_tool_call_error`    | Recorded calls, result records and rejected call records; not inferred live completion events.                                                |
| `ai_agent_reasoning`, `ai_prompt_context`                                   | The existence/time of reasoning and context records, without their content.                                                                   |
| `ai_prompt_decision`, `ai_prompt_decision_shadow`                           | Recorded routing/edit decisions, outcomes and stored latency.                                                                                 |
| `ai_writeback_run`                                                          | Retained run snapshots and current status.                                                                                                    |
| `ai_deep_research_runs`, `ai_deep_research_events`                          | Run snapshots, actual stored start/completion timestamps and persisted event types.                                                           |
| `ai_slack_artifact_deliveries`                                              | Recorded delivery state and known finish time.                                                                                                |
| `mcp_tool_call`                                                             | Recorded inbound/outbound MCP calls, tool names, statuses and durations.                                                                      |
| `agent_action_log`                                                          | Recorded permission/action decisions, outcomes and policy stages.                                                                             |
| `download_audit`                                                            | Authorized download request records, query IDs and formats; the audit precedes file generation and does not prove completion.                 |
| `scheduler_log`                                                             | Export-job facts for `uploadGsheetFromQuery` and `downloadAsyncQueryResults`, with organization and project provenance.                       |
| `ai_router_decision`                                                        | Recorded and committed routing decisions.                                                                                                     |
| `ai_eval_run`, `ai_eval_run_result`, `ai_eval_run_result_assessment`        | Evaluation run/result state and recorded assessments.                                                                                         |
| `ai_artifacts`, `ai_artifact_versions`                                      | Retained artifact and version creation facts.                                                                                                 |
| `ai_thread_file`                                                            | Recorded file upload/claim facts, without file names or contents.                                                                             |

`current_status` and feedback scores describe the retained snapshot, not its
state at the row's original creation time. Snapshot aggregates are exported once
per record rather than repeated on its additional response/retry/start/finish
facts. Historical Activity contains several distinct fact types; filter/group by
`activity_type` when interpreting counts or aggregates.

Current project/content/people dimensions are refreshed through the existing
snapshot path. Manual backfill refreshes the Analytics model definitions to make
the new Explore available, without replacing customer charts or dashboards.
This does not reconstruct past names, membership or permission changes.

## Retention and limits of recovery

The import reads retained data; it cannot restore rows or events already removed:

- Query history and agent action logs use configured query-history cleanup,
  currently 32 days by default. Cleanup can be disabled or configured differently.
- AI usage ledger cleanup normally retains 90 days. Organizations whose AI credit
  contract resets every three months or longer are exempt from that ledger cleanup.
- MCP call cleanup retains 90 days.
- Thread retention uses the shorter configured non-null organization/agent
  window; with neither configured there is no automatic thread-age cutoff.
  Thread/prompt deletion can cascade to related tool, reasoning, context,
  artifact, file and run records. In-flight work is protected by the retention
  sweeper's existing rules.
- Unclaimed thread files expire after 24 hours. Claimed files follow their owning
  thread/prompt lifecycle. Deep Research report cleanup expires report contents
  after 30 days; retained run metadata can still be imported.
- Other listed histories have no additional age floor imposed by backfill.
  Their existing deletion/cascade rules still apply.

Not reconstructed:

- Unpersisted user/navigation events, historical `user_activity` summaries,
  export/download actions without a retained audit or export-job record,
  and event history that predates collection and has no database equivalent.
- Complete AI retry/feedback histories, individual model calls inferred from
  prompt aggregates, live loop-step timings/cache flags and tool completion
  times not stored in the database. A result row's creation time can precede
  approval or completion.
- Native MCP or agent lifecycle events from database facts with independent IDs.
  Cloned prompts and Slack context rows are retained facts, not proof of a new
  user request. Replaying them as native events would distort totals.
- SQL approval rows: their `tool_call_id` alone does not provide an unambiguous
  organization-owned prompt/thread identity, particularly after cloning.
- Operational outboxes, retrieval/reference relationships and configuration or
  credential tables. They are not additional customer activity records.

No SQL, prompt/response/reasoning text, error detail, tool arguments/results,
file contents, export destinations, arbitrary JSON payloads or external user
identities are exported.

## Execution and retries

The existing serial usage-compaction queue processes sources sequentially, using
one thread and a 256 MB DuckDB memory limit. PostgreSQL reads use 1,000-row keyset
pages in read-only transactions, with a 10-second statement timeout, a one-second
lock timeout and explicit UTC formatting. Connections are released between
pages; temporary files are removed after execution. These expensive reads happen
only in the background job. Storage listing limits fail closed rather than
claiming partial coverage. Settings performs at most one HEAD request (10-second
timeout); while a job is running it only reads job status. Only a missing object
is treated as incomplete; storage/permission errors are shown as retryable errors.

Each source is converted directly to queryable Parquet. Published history is
available when processing finishes; it needs no overnight compaction. Current
dimensions are refreshed before publishing new history. Canonical objects use
`events/compacted/org_id=<org>/history=<stream>/history.parquet`.

Native coverage compares actual identities across captured files and existing
history. Recent raw events still inside the nightly processing window are
reported as pending and skipped; older raw objects do not prevent recovery from
retained database rows. Query fallbacks carry
`event_name=query.history_backfilled`; AI fallbacks carry
`history_origin=database`.

Historical Activity compares the complete typed row for each stable source/record
identity. Reruns update changed database snapshots, preserve imported rows that
were subsequently pruned from PostgreSQL, and publish nothing when unchanged.
A partially populated date never hides missing identities.

Publication atomically replaces one source's history object at a time. A failed
upload preserves that source's previous object. Earlier sources may already be
published when a later source fails; retrying the same action reconciles them
without duplicate records. It is one combined job, not an all-source storage
transaction. The existing queue serializes writers.

You can leave Settings while work runs. The page polls job status and checks the
completion marker after execution. Partial failures or failed marker writes do
not produce a new success marker. Failures remain manually retryable; the job does not
introduce another recurring schedule or an unbounded retry loop. A previous
success or hidden button never bypasses organization authorization.
