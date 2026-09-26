# Current content, user and agent dimensions

The existing `compactUsageEvents` Graphile job refreshes dimension snapshots
after processing event partitions, daily at 00:30 UTC. It also refreshes on days
with no new events. The `usage-events-compaction` queue serializes scheduled
runs. The existing usage-events enablement and storage configuration apply.

Each organization has one current Parquet object per dimension:

| Object under `events/compacted/org_id=<uuid>/` | Columns                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `dim=charts/charts.parquet`                    | org_id, chart_id, name, slug, chart_kind, space_name, is_deleted |
| `dim=dashboards/dashboards.parquet`            | org_id, dashboard_id, name, slug, space_name, is_deleted         |
| `dim=agents/agents.parquet`                    | org_id, agent_id, name                                           |
| `dim=users/users.parquet`                      | org_id, user_id, name                                            |

Charts include saved metric and SQL charts, including charts owned by a
dashboard. Soft-deleted content remains identifiable through `is_deleted`;
hard-deleted or unknown content resolves to NULL. Users are active, non-internal
members of the source organization. Removed, inactive, internal, unnamed and
unknown users display `Unknown user`, with the original event User ID available
for disambiguation. No email addresses or historical identities are exported.

Names reflect current source values after the next successful refresh, including
when querying older event partitions. Event files are not rewritten. This is
current metadata, not an audit of names at event time.

## Export and failure behavior

The exporter reads at most 1,000 rows per Postgres page, ordered by an indexed
key, with no OFFSET. Each page releases its connection before file IO. Postgres
projects an explicit JSON field allowlist. Backpressure streams these rows to
a private temporary file; it does not collect an organization or ID set in
Node memory. Organizations and dimensions are processed sequentially.
Pagination cursors restart on every run; they do not select only new or changed
records.
The source queries live in
[`UsageDimensionsModel`](../../packages/backend/src/models/UsageDimensionsModel.ts);
[`UsageDimensionsRefresher`](../../packages/backend/src/analytics/eventStream/UsageDimensionsRefresher.ts)
owns staging, conversion and upload. Column definitions and object keys live in
[`usageDimensions`](../../packages/backend/src/analytics/eventStream/usageDimensions.ts).

Every refresh overwrites each dimension's current snapshot, including when the
source rows are unchanged. Exports reuse the compactor's typed DuckDB
`read_json` / `COPY` conversion with a 256 MB engine limit, one thread,
Zstandard compression and 16,384-row groups.
The engine limit does not include Node memory or other processes. This limits
concurrency, not CPU percentage: conversion can keep one core busy. A 1,000-row
page limits returned rows, not the rows Postgres may scan; verify indexes and
query plans against a realistic distribution of organizations before rollout.
The completed file is streamed through the AWS SDK multipart uploader with one
8 MB part in flight, plus stream/SDK buffers. Local
scratch space holds one dimension's JSONL and Parquet and is removed in `finally`.
Provision enough temporary disk for the largest organization dimension.

Publication replaces the deterministic key only after conversion completes.
An interrupted read, conversion or upload leaves the previous object available.
Other dimensions continue; failures fail the job so Graphile can retry. Retries
restart the job, including snapshots already published successfully; there is
no persisted resume cursor. Scheduled runs allow up to three attempts.
Publication is atomic per object, not across dimensions. Concurrent
source edits during paging converge on the following refresh.
Cleanup in `finally` covers handled failures. An abrupt process termination can
leave temporary files or incomplete multipart uploads; account for these in
worker scratch-space cleanup and storage lifecycle configuration.

## Read path and rollout

Query Events exposes Charts, Dashboards and Users as optional many-to-one LEFT
JOINs on organization plus entity ID. AI Usage joins Users and Agents; Data App
Events and Export Events join Users. Export Events also joins Charts and Dashboards
through its Query Events metadata, so exports can be grouped by content names.
Every lookup declares a composite primary key on organization and entity ID.
The query builder adds joins only for selected or filtered lookup fields.
Existing event IDs and metrics retain their names and behavior.

The server signs only the exact dimension keys above. Historical copies,
arbitrary paths and other organizations remain outside the manifest. DuckDB
receives signed GET URLs, not database or bucket credentials. Missing snapshots
use typed empty views so event queries still work before the first refresh.
Dimension-only storage does not bypass the existing no-event-data state. The
shared bucket contains separate files per organization; the connection never
receives other organizations' files and does not rely on a SQL org filter.

After deployment, click **Sync content** as an organization admin to compile the
new fields in an existing project before updating managed sample dashboards.
Re-running `POST /api/v1/org/analytics-project` also refreshes the models while
preserving the project and saved content. New projects include them immediately.
Existing authorization and feature-flag checks apply. No database migration or
new configuration is required.

The first dimension refresh does not have to finish before creating or updating
an analytics project, provided supported event files already exist:

| Storage state | Create or recompile project | Query using User name |
| --- | --- | --- |
| Event files exist; users snapshot is missing | Succeeds | Preserves events and displays `Unknown user` |
| Event files and users snapshot exist | Succeeds | Resolves current names for matching users |
| No supported event files, even if dimension snapshots exist | Returns the existing no-analytics-data error | Wait for daily event processing before provisioning |

Restoring or publishing a missing users snapshot makes names available to new
queries without recreating the project. Cached results may still show the old
values. **Sync content** compiles models and updates managed content definitions;
it does not refresh snapshots or verify that event data is available.

To use the join in Explore, select **Query Events → Total queries** and
**Users → User name**. Add **User ID** to distinguish people with identical
display names. Chart and dashboard names are available from their joined tables.
In AI Usage, select **Agents → Agent name** alongside **Total AI calls**.
Agent IDs are `ai_agent.ai_agent_uuid`, matching the event stream. Current names
include system agents. Missing snapshots and deleted, unknown or null agent IDs
display `Unknown agent` without dropping events or changing totals. Only
`org_id`, `agent_id` and `name` are exported; instructions and configuration are
excluded.

Project, space and group lookup tables are not part of this implementation;
charts and dashboards include a `space_name` attribute.

## Local verification

Start an isolated instance and configure its local MinIO usage-events settings
as described in [local testing](local-testing.md). Load its assigned environment
before running the test. The test uses a disposable schema in that instance's
Postgres and a dedicated MinIO bucket; it cleans up both.

```bash
export INSTANCE_ID=<your-instance>
eval "$(./scripts/dev-ports.sh env)"
USAGE_DIMENSIONS_SMOKE_PGPORT="$LD_PG_PORT" \
USAGE_DIMENSIONS_SMOKE_ROWS=1000000 \
pnpm exec dotenv -e .env.development.local -e .env.development -- \
  pnpm -F backend test src/analytics/eventStream/UsageDimensions.smoke.test.ts \
  --disableConsoleIntercept
```

This exercises real Postgres → JSONL → Parquet → MinIO → signed-URL DuckDB →
Lightdash-generated JOIN SQL, including two organizations, duplicate names,
unknown/removed users, agent names and pagination, cross-org/null/deleted agents,
SQL/dashboard-owned charts, renames, soft deletion,
overwrites with unchanged source rows, missing snapshots and interrupted exports.
The default fixture has 2,500 extra charts; the environment override enables the
larger load check. This verifies the functional path and paging; it does not
establish production CPU, database load or throughput guarantees. Measure process
RSS, event-loop responsiveness, database load and temporary disk usage separately.
