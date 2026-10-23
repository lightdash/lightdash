# Analytics sample content

The backend-owned bundle in `packages/backend/src/analytics/systemExplores/sampleContent.ts`
defines managed dashboards using system explores, including AI usage, Query activity
and AI tokens and billing coverage. It is compiled with the backend: no CLI upload, migration,
installation table, or version tracking is required.

AI usage includes calls, total tokens, distinct users and output-token KPIs,
daily calls/token trends, and top models by tokens and calls. Query activity includes
a cache-hit share donut, average/P90 warehouse execution trends,
and top query contexts. Token volume is not cost; warehouse execution time is not
end-to-end latency. Missing cache flags are not treated as misses.

Query activity focuses on query totals, distinct users, average/P90 warehouse
execution time, daily query and active-user trends, cache-hit share and query
sources. AI usage replaces the former mixed overview while keeping its dashboard
slug (`lightdash-analytics-overview`) and existing AI chart slugs. Query activity
keeps its existing content and slugs. Space slugs are explicit and stable so a
dashboard title change does not create a new space. Sync removes the former
overview's query tiles without deleting their saved history or custom copies.

Project creation and **Sync content** in organization analytics settings both install
the current definitions: system explores first, then managed charts and dashboards.
This makes newly shipped explores, dimensions and metrics available in existing
analytics projects without recreating the project. After creation, settings stays open and shows dashboard
shortcuts and the **Explore** button; it does not redirect automatically. Sync calls
`POST /api/v1/org/analytics-project/sample-content`. Both paths require the existing
analytics feature flag and org-admin guard. The server
resolves the organization and its marked analytics project; no target IDs or
content definitions are accepted from the caller.

The dashboard list loads when the page opens and reloads after a successful sync.
There is no separate list refresh button. **Sync content** is a secondary
action beside **Explore**, with a tooltip explaining its overwrite behavior. Sync
never deletes or recreates the project. Custom dashboards and copies with other
slugs are preserved; built-in slugs are reserved for managed content.
Every sync iterates the built-in dashboard list, creating missing dashboards and
updating existing ones through the content-as-code service. Add future dashboards with a new
stable key to this list. Removing a definition does not automatically delete its
previously installed dashboard.

## Identity and overwrite behavior

The stable bundle key is the dashboard slug; each chart uses
`<bundle-key>-<chart-key>`. Sync looks up these exact slugs **within the authorized
analytics project**, then updates the existing rows by their stored UUIDs. New
content uses existing content-as-code creation with database-generated UUIDs. The
standard upsert path uses exact slugs internally; analytics adds no UUID overrides
or changes to shared dashboard/chart creation models.

This deliberately treats a matching dashboard slug as managed content. On initial
project creation the slugs are unused. If a user later creates a dashboard with a
future built-in slug, adding that bundle will overwrite it on Sync. Reserve the
built-in slug namespace for Lightdash content. This is a known trade-off, not an
ownership registry. Duplicated dashboards normally receive different slugs and
are left alone. Renaming a managed dashboard's slug opts it out of subsequent
updates; Sync will create the missing canonical dashboard. It will fail closed
if the canonical chart slugs still belong to the renamed dashboard, rather than
moving or overwriting those charts. Resolve that conflict before retrying.

Sync overwrites the managed dashboard's name, description, layout, filters,
and sample chart definitions using the existing versioned models. Existing UUIDs
and slugs remain unchanged. Customizations to the managed sample can be lost: duplicate it first
to keep them. Other dashboards and their charts are untouched. Removed chart
definitions are no longer included in the dashboard layout; their saved rows and
historical versions are retained rather than hard-deleted.

## Content-as-code implementation

`analyticsContentAsCode` produces typed `ChartAsCode` and `DashboardAsCode`
definitions from the bundle. `AnalyticsProjectService` calls the existing
`CoderService.upsertChart` and `upsertDashboard` methods directly: no CLI subprocess,
HTTP upload, or custom content SQL. Dashboard tiles reference charts by slug.
Spaces keep the original project-permission inheritance behavior.

The existing organization provisioning lock serializes create/sync/delete actions.
Before uploading anything, the service uses `SavedChartModel.get` (including
soft-deleted rows) to reject chart aliases or charts belonging to another dashboard.
It then compiles the current backend-owned system explores and saves them through
the same model-cache method used during project creation. If compilation or saving
the models fails, no charts or dashboards are uploaded. This does not fetch or
backfill event data; new events still follow the capture and compaction pipeline.
A missing or deleted dashboard is created/restored with an empty layout before
its charts are uploaded, then its final layout is applied. This ensures the first
chart is also updated when restoring a deleted dashboard. Restore and space
resolution otherwise follow the standard content-as-code behavior.

Uploads are **not one atomic bundle transaction**. On failure, earlier item
updates can remain, and a newly created dashboard can have an empty layout.
The endpoint reports the error; retrying Sync applies the same slug targets and
completes the installation without creating duplicate dashboards. The installer
does not opt into Git-backed snapshot/version tracking. Existing content-as-code
project settings still govern any snapshot behavior.

Earlier local prototypes used deterministic UUIDs. Existing rows at canonical
slugs are updated without changing those UUIDs; noncanonical/suffixed prototype
dashboards are not adopted or deleted automatically.

## AI tokens and billing coverage

The managed `lightdash-analytics-ai-tokens` dashboard is installed during Analytics
project creation and **Sync content**, in the existing AI usage space. Its 24
charts provide Feature, Channel, User, Project and Agent tabs plus an all-usage
coverage tab. The existing Agents & AI dashboard is preserved.

The five breakdown tabs use the same feature, completed-outcome and
Lightdash-managed-key criteria as credit accounting, but report **tokens**,
including unpriced models. They do not reproduce priced billable credits,
contract periods, allowances or holds. The default window is the current calendar
month through yesterday in UTC, rather than the organization's contract window.
All-usage charts additionally include self-managed and excluded/background usage.
Cache and reasoning metrics overlap input/output; they must not all be added to
the provider-reported token total. Record counts are not questions or an exact
provider-call count.

Colored daily stacks and token-share rows show the five largest groups plus
Other. Identities remain separate even when names match. Token-share rows have
reserved vertical space so labels and progress bars do not overlap. At the
5,000-grouped-row query limit, a breakdown shows a warning instead of incomplete
shares; add a dashboard filter to narrow the result. Detail tables show up to
1,000 grouped rows.

AI Usage exposes **Project name** from the current organization-scoped
`projects.parquet` dimension, including projects with no saved content. Names
refresh with the existing usage-dimension job; Sync updates the model and content
without refreshing the data snapshot. Missing/deleted projects retain their
events and render as unknown, with the project ID available for attribution.
No tenant IDs, project names, credentials or internal issue links are embedded in
the managed content.

## Future work

There is no out-of-date detection or installed version in this PR. Every Sync
applies the definitions shipped with the current backend. Version detection and
broader content synchronization are tracked in PROD-11152. Creation timestamps
alone would not indicate the version after an in-place sync.

Keep bundle/chart keys stable when changing metrics or dimensions. The system
explores now expose a joined Users table with **User name**; Query Events also
exposes Charts and Dashboards. See [current dimensions](dimensions.md). Existing
sample chart definitions are not automatically rewritten to use these joins.
Preserve existing field IDs where possible to avoid breaking user-created charts.
Sync compiles the explores before applying chart definitions; incompatible model
changes can still break custom charts that reference removed fields.
