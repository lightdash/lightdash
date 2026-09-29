# Content reach

Content reach answers who reads saved dashboards, dbt charts and SQL charts,
how often they return, and whether they read verified content. It reads the
`content_views` stream through the existing organization-scoped signed manifest.
No new scheduled job or derived Parquet model is required. Existing nightly
compaction catches up closed partitions after missed runs and late arrivals.

A qualifying view is a successfully loaded saved-content page opened by an
authenticated session user in a non-preview project, outside edit mode. The
page-level hook runs on cached loads, once per navigation; tile queries,
rerenders and background refreshes do not produce extra qualifying views.
The server resolves content permissions and organization/project/space metadata.
Capture still requires `USAGE_EVENTS_ENABLED` and configured usage storage.
Tracking failure never prevents opening a page. Disabled deployments skip the
additional metadata lookup. This is best-effort telemetry, not an audit log.

The existing `dashboard.view`, `saved_chart.view` and `sql_chart.view` fetch
signals are also allowlisted. Their interaction context and actor kind are
unknown unless explicitly supplied by page capture; known embed fetches retain
`embed` context. These fetch signals are **not qualifying readership**. Existing
RudderStack emissions and legacy view counters are unchanged; the new page
interaction is sent only to the usage sink. User activity includes captured raw
events with its existing event-count semantics, including nonqualifying fetches
and redelivery. Use Content reach for deduplicated human readership.

Each page interaction has a UUID; replay with that UUID deduplicates within
organization/project/content/user. Separate reloads have separate UUIDs. Events
without an identity are retained, never heuristically deduplicated. `Event ts`
is server receipt time for the page interaction; `Ingested at` is projection
time. Offline viewing is not reconstructed. Names, creation timestamp and
verification are captured from server metadata at that time. User names join
the current Users snapshot; missing users remain Unknown user. SQL chart
verification is unknown because that content type has no verification signal.

## Metric definitions and history limits

- **Qualifying views** counts qualifying page interactions after deduplication.
- **Distinct viewers** counts registered user UUIDs in the selected period.
- **Returning viewers** counts users with a qualifying visit on a later UTC
  calendar day than their first captured qualifying visit to the same content.
  Same-day reloads count as views, not returns. First visit is calculated before
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
- `ContentService.test.ts` covers disabled capture, permission-aware lookup,
  wrong tenant/source, preview projects and verification changes.
- `useTrackContentView.test.tsx` covers cached page loads, tile-like rerenders,
  navigation identities, previews and nonblocking failures.
- Run the storage/load test against local MinIO with
  `USAGE_USER_ACTIVITY_SMOKE_ENDPOINT=http://localhost:9000 pnpm -F backend test src/analytics/eventStream/UsageUserActivityBuilder.smoke.test.ts --maxWorkers=1`.
  It uses a unique disposable bucket, 100,000 generated rows per stream, raw
  duplicate/return fixtures, real compaction, signed reads and repeat runs.
