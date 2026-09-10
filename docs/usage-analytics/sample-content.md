# Analytics sample content

The backend-owned bundle in `packages/backend/src/analytics/systemExplores/sampleContent.ts`
defines two managed dashboards using the existing system explores: the usage
overview (ten charts) and Query activity (nine charts). It is compiled with the backend: no CLI upload, migration,
installation table, or version tracking is required.

The sample includes compact headline totals, daily AI/query line charts, top models
by token volume, a cache-hit share donut, average/P90 warehouse execution trends,
and top query contexts. Token volume is not cost; warehouse execution time is not
end-to-end latency. Missing cache flags are not treated as misses.

Query activity focuses on query totals, distinct users, average/P90 warehouse
execution time, daily query and active-user trends, cache-hit share and query
sources. The existing overview and its IDs remain unchanged. Charts with the same
definition on different dashboards have distinct, dashboard-owned IDs.

Project creation and **Sync content** in organization analytics settings both install
the current definitions. After creation, settings stays open and shows dashboard
shortcuts and the **Explore** button; it does not redirect automatically. Sync calls
`POST /api/v1/org/analytics-project/sample-content`. Both paths require the existing
analytics feature flag, development environment, and org-admin guard. The server
resolves the organization and its marked analytics project; no target IDs or
content definitions are accepted from the caller.

The dashboard list loads when the page opens and reloads after a successful sync.
There is no separate list refresh button. **Sync content** is a secondary
action beside **Explore**, with a tooltip explaining its overwrite behavior. Sync
never deletes or recreates the project. Custom dashboards and copies with other
slugs are preserved; built-in slugs are reserved for managed content.
Every sync iterates the built-in dashboard list, creating missing dashboards and
updating existing ones in the same transaction. Add future dashboards with a new
stable key to this list. Removing a definition does not automatically delete its
previously installed dashboard.

## Identity and overwrite behavior

The stable bundle key is the dashboard slug; each chart uses
`<bundle-key>-<chart-key>`. Sync looks up these exact slugs **within the authorized
analytics project**, then updates the existing rows by their stored UUIDs. New
content uses normal model creation and database-generated UUIDs: no UUID overrides,
`forceSlug`, or changes to the shared dashboard/chart creation models are needed.

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

Installation runs in one transaction under a project row lock and the existing
project-scoped slug locks. If normal creation returns a suffixed slug (for example
because a chart's historical alias reserves the canonical one), Sync rolls back
instead of making a new suffixed copy on every attempt. Failed syncs
roll back, preserving the previous content. A soft-deleted managed dashboard or
sample chart can be restored by Sync. Sync fails if its space is deleted
(restore the space first) or a managed chart has moved outside that dashboard.
Every existing target is checked for project/dashboard ownership before updating.

Earlier local prototypes used deterministic UUIDs. Existing rows at canonical
slugs are updated without changing those UUIDs; noncanonical/suffixed prototype
dashboards are not adopted or deleted automatically.

## Future work

There is no out-of-date detection or installed version in this PR. Every Sync
applies the definitions shipped with the current backend. Version detection and
broader content synchronization are tracked in PROD-11152. Creation timestamps
alone would not indicate the version after an in-place sync.

Keep bundle/chart keys stable when changing metrics or dimensions. A future
user-name lookup and joined user table should be introduced through the system
explores first, then referenced by the sample charts. Preserve existing field IDs
where possible to avoid breaking user-created charts. Future model-and-content
sync must compile the explores before applying chart definitions.
