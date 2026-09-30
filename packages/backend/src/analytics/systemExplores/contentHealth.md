# Content health

Content health starts with the current inventory of saved dbt charts, SQL charts,
dashboards and data apps, including items with no captured events. The existing
nightly dimension refresher exports one additional organization-scoped Parquet
file. It uses the same bounded database pages and atomic publication as the
other snapshots. There is no new scheduler, event capture or compaction stage.
Existing event and User activity metrics are unchanged.

The Explore joins separately aggregated Content reach views, query outcomes and
data app loads to that inventory. This avoids multiplying counts by dependencies
or by unrelated events. Stable query identities are deduplicated within the
organization and project. Query counts and execution time can be attributed to
both a chart and its dashboard: totals across content types are attribution
counts, not unique global query counts. Execution time is a performance proxy,
not monetary cost. Missing timing remains null and has a separate coverage count.
Distinct observed viewers is an item-level dimension; do not sum it across items.

## Current snapshot, not historical state

Names, project, space, verification and ownership reflect the latest successful
snapshot. Only dashboards have an explicit owner in the current source; creators
and last editors are not substituted for missing owners. Owner status describes
account activity and organization membership, not employment. Soft-deleted items
remain visible while present in the application database; hard-deleted items are
not reconstructed. Snapshot at shows freshness; failed exports preserve the
previous complete file.

Dashboard references count distinct active dashboards whose latest version
references the item. Enabled schedules count current, non-deleted schedules.
These are known dependencies, not proof that a scheduled delivery succeeded.
Embed, external assistant and general app-to-content dependency coverage is
incomplete. Verification history, owner history and authoritative launch dates
are not supplied by this snapshot.

“No activity observed” means no matching retained events. The first observed
event is an organization-level timestamp, not proof of continuous capture.
The model deliberately does not claim “unused for 90 days” or “safe to delete”:
those require complete capture coverage and more dependency sources. Capture
coverage and Dependency coverage make these limitations visible in the Explore.

## Example

Open **Content health**, choose Content name, Content type, Owner name,
Owner status, Last observed activity at and Activity status. Add Total content,
Total observed views and Total observed queries. Filter Is deleted to false for
current items. Add Dashboard references and Enabled schedules before reviewing
an item for retirement. Group Created at by month to compare creation cohorts;
activity counts cover retained history, not a selected event-time window.

The existing usage feature gate and analytics-project access checks apply.
A deployment needs a successful nightly snapshot and refreshed Explore definitions
to expose inventory. Before the first snapshot, the model returns an empty result.
