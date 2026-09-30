# Content reach

Content reach answers who reads saved dashboards, dbt charts and SQL charts,
how often they return, and whether they read verified content. It reads the
`content_views` stream through the existing organization-scoped signed manifest.
No new scheduled job or derived Parquet model is required. Existing nightly
compaction catches up closed partitions after missed runs and late arrivals.

A qualifying view is a successful backend dashboard/chart fetch attributed to a
user in a non-preview project. It is a fetch count, not a browser page-view count:
refetches and server/API callers can produce additional events; browser-cache-only
visits produce none. Edit mode and background callers cannot reliably be separated
with this signal. Known embedded reads and preview projects are excluded.

The existing `dashboard.view`, `saved_chart.view` and `sql_chart.view` emissions
are enriched once for the usage sink. No frontend hook or additional request is
needed. Existing authorization, legacy view counters and RudderStack payloads
remain unchanged. Names, creation dates, project and space metadata come from the
existing content queries; there is no extra database round trip. The added optional
response metadata fields are backward-compatible. Capture still requires
`USAGE_EVENTS_ENABLED` and configured usage storage. Projection/writer failures
are best-effort and do not prevent the content response.

Each captured backend event has a generated UUID; redelivery of that event can be
deduplicated within organization/project/content/user. Separate fetches receive
separate UUIDs. Legacy events without capture metadata remain unclassified and
are excluded from qualifying counts. User activity counts captured events with
its existing semantics; a fetch emits one enriched event, not a second page event.
User activity does not deduplicate transport redelivery.

Event time is backend tracking time. Verification is captured at that time;
SQL-chart verification is unknown. User names join the current Users snapshot.
Missing names remain Unknown user. These signals are not proof that someone
looked at the content and are not an audit log.

## Metric definitions and history limits

- **Qualifying views** counts qualifying backend fetches after deduplication.
- **Distinct viewers** counts registered user UUIDs in the selected period.
- **Returning viewers** counts users with a qualifying fetch on a later UTC
  calendar day than their first captured qualifying fetch to the same content.
  Same-day refetches count as views, not returns. First visit is calculated before
  Explore date filters; a future return never changes an earlier day's result.
- **Last viewed at** is the latest qualifying timestamp in the selected period.
- **First week returning viewers** counts people first observed in the first
  seven UTC calendar days since content creation who visit on or after day 8.
  Use Creation week and Weeks since creation to compare creation cohorts.
- **Verified audience share** is distinct viewers of verified content divided
  by distinct viewers of content with known verification state in the selected
  period. A person viewing both verified and unverified content counts once in
  each applicable set. Null means no known-state audience, not zero percent.

There is no authoritative launch date in the source. Creation cohorts are
explicitly labeled as creation, not launch. Arbitrary business launch cohorts
require a future launch-date source; this model does not invent one. Likewise,
pre-capture visits, verification history, membership and eligibility are not
reconstructed. Capture starts at deployment; legacy backfill is PROD-11509.
Content with zero captured events requires the separately planned inventory
model (PROD-11654). Never interpret missing history as proof of no readership.

## Runnable example

Open **Content reach** and select **Content name**, **Content type**, **Project
name**, **Space name** and **Event ts → Day**. Add **Qualifying views**,
**Distinct viewers**, **Returning viewers**, **Last viewed at** and **Verified
audience share**, then run. Add **Users → User name** and **User UUID** to inspect
individual readers; group by UUID to distinguish people with identical names.
For a newly created dashboard, filter its Content id and group by Weeks since
creation with First week returning viewers.

## Local verification

- `contentReach.test.ts` executes 56 compiled dimension/metric combinations
  against native DuckDB, plus deduplication, date-filter, verification and empty
  source assertions.
- Analytics compatibility tests verify one usage event per backend emission,
  unchanged RudderStack/event-metric payloads, and best-effort capture failure.
- Existing service tests cover authorized/denied dashboard and chart reads.
- Run the storage/load test against local MinIO with
  `USAGE_USER_ACTIVITY_SMOKE_ENDPOINT=http://localhost:9000 pnpm -F backend test src/analytics/eventStream/UsageUserActivityBuilder.smoke.test.ts --maxWorkers=1`.
  It uses a unique disposable bucket, 100,000 generated rows per stream, raw
  duplicate/return fixtures, real compaction, signed reads and repeat runs.
