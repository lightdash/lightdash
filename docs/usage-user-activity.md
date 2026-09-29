# Usage analytics by user

The analytics project includes a **Users** Explore alongside Query Events, AI
Usage, Data App Events, Export Events and Agent Steps. Select **User name** from
the joined Users table and **User UUID** from the activity table, then metrics
such as **Total CSV Downloads** or **Total Queries**. Keep UUIDs in rankings so
equal or missing names do not combine different people. Activity Date and Project
UUID support daily and project-level breakdowns.

The Users model covers every currently captured stream. Export metrics count
`download_results.completed`; CSV downloads additionally require `format=csv`.
Starts and errors are excluded from download counts. Query counts include failed
and automated queries. AI token totals come from AI Usage, avoiding duplication
of tokens also reported by Agent Steps. Event totals and user totals use the
same captured-row semantics: this feature does not deduplicate source events.
For the same dates and filters, summing all user groups (including unknown or
anonymous groups) gives the event-model total. Per-event timing, query metadata,
and other detailed properties remain available in the event Explores.

Names come from the current users snapshot, joined by organization and user UUID.
Missing/deleted names display **Unknown user**; their captured UUIDs remain
available. Anonymous activity retains a null UUID and does not count as a unique
user. These are activity models, not a full membership roster: zero-activity
users, historical eligibility, past names, human-only activity and adoption rates
are not inferred.

## Refresh and deployment

The existing daily usage-events compactor now refreshes user activity after
compaction and dimension snapshots. This stage also runs when there are no new
raw files. It discovers retained closed UTC dates, backfills missing summaries,
and rebuilds partitions whose source file keys, ETags or sizes have changed.
Unchanged partitions are skipped. Late arrivals are incorporated after their
next successful compaction. The current UTC day is excluded.

At most 500 changed or failed stream/day partitions are processed per run; a
warning identifies remaining work, which subsequent runs retry. Initial backfill
can therefore span several runs. A missing day represents unknown coverage,
not proof of zero activity. Existing analytics projects receive the Users and
Agent Steps Explores when their backend-owned models are synced (through the
existing analytics setup/sample-content sync flow).

No database migration or new credentials are required. Existing analytics
feature flags and authorization apply. Signed reads remain scoped to the same
organization prefix and allow only recognized model paths.

For a targeted backfill, use the deployment's existing usage-events S3 config:

```sh
pnpm -F backend exec tsx --tsconfig tsconfig.scripts.json \
  src/scripts/build-usage-user-activity.ts \
  --org-id <organization-uuid> --from 2026-01-01 --to 2026-01-07

# Built production image:
node packages/backend/dist/scripts/build-usage-user-activity.js \
  --org-id <organization-uuid> --from 2026-01-01 --to 2026-01-07
```

Dates are inclusive; manual runs require an explicit organization and 1–31
closed days. They process all five streams and stop at the first error or pending
raw partition. Serialize manual runs with compaction and other writers for the
same partitions. There is no cross-process lock or cross-partition transaction.

Output is one zstd Parquet file per organization/stream/day:

```text
events/compacted/org_id=<org>/model=user_activity/stream=<stream>/dt=<date>/activity.parquet
```

Its grain is organization/project/user/day/stream/event name, plus export format.
Columns include those keys, `activity_date TIMESTAMP`, `event_count BIGINT`,
`query_count BIGINT`, and AI token sums. Source rows must physically match the
organization and UTC day; Hive path inference is disabled. Older source files
missing newer fields are supplemented with typed null columns.

## Failure and resource behavior

Partitions run sequentially with a 256 MB DuckDB managed-memory limit and one
thread. DuckDB may spill to local temporary disk. The memory setting does not
limit total process RSS. JavaScript retains at most 10,000 source file entries
per partition; event rows stay in DuckDB. Uploads stream from a private temporary
directory with one 8 MB part in flight.

Pending raw files defer that partition. Missing compacted input retains any
previous summary. Valid input with no qualifying rows produces a typed empty
file. Transformation/upload failures preserve the previous complete object;
nightly processing continues to other partitions and reports a failed job if
any partition failed. Earlier successful replacements remain published. Source
events and user dimensions are not modified by this derivation stage. Handled
failures clean temporary files and incomplete uploads; process crashes still
require normal temporary-file and multipart-upload lifecycle cleanup.

## Local verification

The opt-in integration test uses local MinIO development credentials and creates
and deletes only its own UUID-named bucket:

```sh
USAGE_USER_ACTIVITY_SMOKE_ENDPOINT=http://127.0.0.1:9000 \
USAGE_USER_ACTIVITY_SMOKE_ROWS=2000000 \
  pnpm -F backend test \
  src/analytics/eventStream/UsageUserActivityBuilder.smoke.test.ts \
  --disableConsoleIntercept
```

The row setting applies to **each** of the five streams. It generates Parquet in
DuckDB, runs the real compactor/refresh and CLI, resolves signed sources and
executes compiled Explore queries. Assertions cover event/user metric parity,
names/UUIDs, unknown and anonymous users, tenant isolation, unchanged reruns,
late arrivals, recovery of missing summaries, pending raw files and preservation
of previous output on corrupt input.

On 2026-09-29, 10,000,005 synthetic events across 10,000 regular user UUIDs plus
edge cases passed. The first compactor/refresh run took 1.49 seconds, with sampled
test-process peak RSS of 448 MiB; the full integration scenario took 10.59
seconds. Fixture generation precedes the measurement and can contribute retained
memory. These local measurements are not production throughput or memory
guarantees. Production cloud credentials were not exercised.
