# Retained query history

Organization administrators can open **Settings → Lightdash analytics** and use
**Backfill available history** when retained queries are missing from Analytics.
The availability check shows the missing date range/count and already captured
queries. The action disappears when there are no missing eligible records. It
reappears if another check finds more history; there is no permanent “used” flag.

## Requirements and coverage

Cloud and licensed self-hosted deployments use the same Settings action. They
need an Analytics project, the `analytics-project` flag, configured/enabled
`USAGE_EVENTS_S3_*` storage and a running scheduler worker. The storage identity
must be able to list/read usage objects and publish the org's current dimensions
and history object. See [storage setup](local-testing.md#configure-and-provision).
No RudderStack history or events from another installation are imported.

Only retained application `query_history` rows can be recovered. Retention is
configurable; the default is 32 days. Removing rows before importing them removes
that recovery source. Imported history survives subsequent database retention.
Queries whose projects have been deleted cannot be attributed and are excluded.
Preview queries, today's UTC queries, in-progress/expired/cancelled queries and
errors without warehouse execution evidence are excluded.

Imported timestamps are **query submission times**, not reconstructed completion
times. Actor/project/content IDs, status, warehouse execution duration and row
count are filled when retained. Missing actors remain unknown. Response latency,
cache flags, execution phases and other unavailable event metadata remain null.
No SQL, error message, external user identity or query-result data is exported.
Current project/content/people metadata is refreshed through the existing
snapshot path; it does not reconstruct historical names or membership.

This fills **Query Events** and models reading those events. It does not rebuild
historical `user_activity` summaries, legacy chart/dashboard views, historical
membership or AI/token/export events. Imported query runs never count as views.

## Execution and retries

The POST queues work in the existing serial usage-compaction queue, with one
thread and a 256 MB DuckDB memory limit. Database reads are paged; temporary files
are removed after execution. Availability checks share one engine per API process
and concurrent requests for the same org share a check. Storage listings are
bounded and fail closed rather than returning partial coverage.

Coverage uses `(org_id, project_id, query_id)` across all retained compacted query
files and the canonical history file, rather than guessing from the first event
or treating a partially populated date as complete. Raw events still within the
nightly processing window are reported as pending and skipped. Older raw files
are outside nightly processing; their retained database query can be recovered
as a fallback without replaying the raw object.

Imported rows carry `event_name=query.history_backfilled`. The canonical object
`events/compacted/org_id=<org>/history=query_events/history.parquet` is atomically
replaced after current metadata refresh succeeds. Retries retain previous rows
and add only missing identities. A captured row arriving later, including on a
different date, takes precedence over its historical fallback at read time.
Existing captured-row counting semantics are unchanged.

You can leave the page while work runs. The Settings check polls until execution
finishes, then verifies actual coverage. A failed run remains manually retryable;
it does not create an automatic retry loop or a separate recurring schedule.
A failed upload leaves the previous published object intact. Direct or concurrent
reruns are safe; the shared queue prevents simultaneous writers. Neither the
button state nor a prior success bypasses server authorization or overlap checks.
