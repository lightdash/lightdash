# Local usage analytics triage (PROD-11059)

For the architecture and trust boundaries, see [architecture](architecture.md).

Feature-flagged internal preview, pending live reader rollout verification. It
creates a `PREVIEW` project with a backend-owned `analytics` provisioning marker
and an invisible DuckDB `analytics` connection.
No MotherDuck account, dbt project, or configurable connector UI is required.

## Configure and provision

Start an isolated development instance using the worktree runbook. Configure the
dedicated reader's S3-compatible storage settings: `ANALYTICS_S3_ENDPOINT`,
`ANALYTICS_S3_BUCKET`, `ANALYTICS_S3_ACCESS_KEY`,
`ANALYTICS_S3_SECRET_KEY`, and `ANALYTICS_S3_REGION`. The reader uses this
server-owned configuration to issue signed GET URLs; it requires no CLI login
or OAuth exchange. All five settings are required, independently of ordinary
local MinIO storage. See [credentials](credentials.md) for infrastructure rollout.

Add these values to that worktree's `.env.development.local` (never commit them):

```dotenv
LIGHTDASH_ENABLE_FEATURE_FLAGS=analytics-project
```

Preserve other enabled flags if needed. Explicitly disabling `analytics-project`
takes precedence. The source org must match the persisted project's org, even
locally. Legacy local org/source-org overrides are ignored; use matching local
fixture data instead of mapping a local org onto another org's production files.

As a signed-in organization administrator, open **Organization settings →
Lightdash analytics (Beta)** at `/generalSettings/lightdashAnalytics`. Click
**Create** to provision and list dashboards, or **Explore** if it already exists.
The page shows the project's creation time, not its model-sync version or data
freshness. Feature-flag and org-admin restrictions apply in all environments.

Alternatively, call the same-origin endpoint from the browser console on your
assigned local frontend:

```javascript
const response = await fetch('/api/v1/org/analytics-project', {
  method: 'POST',
});
const body = await response.json();
if (!response.ok) throw new Error(JSON.stringify(body));
window.location.assign(body.results.url);
```

The endpoint accepts no configuration: organization identity comes from the
authenticated session. After authorization, it verifies signed Parquet access
before creating any project, then compiles both backend-owned system explores in
memory and returns `{ projectUuid, url, created }`. Storage failures leave no new
project. The name produces `lightdash-analytics` unless that slug is taken;
normal collision handling chooses a unique suffix. An existing analytics project
is found by its marker, never by a name or slug.

Concurrent requests are serialized per organization using a database advisory
lock. Re-running refreshes both models and repairs a failed model-save attempt
without replacing the project or deleting saved charts. Analytics previews do
not expire automatically. They are visible only to enabled org admins in the
projects API (for slug resolution), and omitted from the normal switcher as
previews with no upstream.

### Status and reset

`GET /api/v1/org/analytics-project` returns `{ project: null }` when absent,
otherwise project UUID, name, slug, URL, and creation timestamp. This read does
not access object storage, compile models, or create anything.

The settings page's **Delete** action requires confirmation and calls
`DELETE /api/v1/org/analytics-project/{projectUuid}`. Only the current org's
analytics-marked project with that exact UUID can be deleted. Deletion uses the
same per-org lock as creation. A stale UUID cannot delete a replacement project.
This permanently removes the project and its saved content, but leaves the
collected usage events in object storage intact. Afterwards, **Create** provisions
a new project; it does not restore deleted charts or dashboards.

All three endpoints live in `AnalyticsProjectController`, backed by
`AnalyticsProjectService`, and require a session-authenticated org administrator
and the existing analytics feature flag. Live rollout verification and
versioned content sync remain separate follow-ups.

## Read path and safeguards

The backend lists `events/compacted/org_id=<uuid>/stream=<name>/dt=<date>/*.parquet`
for `query_events` and `ai_usage` across all retained dates. Filter dates in
Explore; legacy `LIGHTDASH_LOCAL_ANALYTICS_START_DATE` and
`LIGHTDASH_LOCAL_ANALYTICS_END_DATE` settings are no longer read.
Files and authentication are refreshed per session. DuckDB views bind exact
HTTPS URLs; Explore SQL uses table names. Reads use HTTP ranges, with no import
into a persistent database and no writes to the source bucket.

Each query gets an isolated in-memory instance, signed GET URLs, a 256 MB
memory limit and two threads. External access is restricted to the exact file
manifest; disk spilling and file/metadata caches are disabled. Existing
SELECT-only and file-function SQL validation remain enabled. Catalog queries that
could expose signed view SQL are blocked, and native errors are sanitized. Broad
writer keys never enter DuckDB; signed URLs are not persisted in project
credentials or returned through the API.

History, paginated results, streaming results and legacy result reads check the
analytics flag and organization-admin access. Export and scheduled-download
creation are unavailable for analytics previews, including for admins, so this
slice does not issue export URLs that outlive these checks.

## Before customer rollout

- Deploy and verify the dedicated read-only identity (PROD-11103). The signed-URL
  path keeps broad keys out of DuckDB but still trusts the signer. Folder
  separation is not an IAM boundary.
- Review every permissions and cached/downloaded-results surface. Finish SQL
  Runner, scheduling, AI and model-editing exclusions. Local org-admin checks are
  not the final metadata-project role design.
- Gradual production enablement and future per-org feature-flag-service integration.
- Latest resource names, additional domain metrics, schema evolution, empty
  streams, retention and query performance.
- Result-cache freshness, date-aware discovery and manifest/view caching at scale
  (PROD-11111). All retained dates are exposed, subject to fail-closed listing/file
  caps; large-history and concurrent query performance still need benchmarking.
- Reevaluate direct Parquet writes and optional compaction separately. This
  slice only reads existing compacted data; the writer/nightly job is unchanged.

Actual GCS reads and isolated MinIO tests verify the signed-URL path; AWS S3 and
production multi-tenant rollout remain unverified.
Production requires explicit deployment feature enablement and reader configuration.

## Incremental PR stack

1. Internal Parquet connector, source resolver, and shared `analytics-project` flag.
2. Signed-URL bucket access using the existing writer's backend credentials.
3. Admin create-or-get endpoint, preview provisioning, signed-URL provider, and both
   system models (Query Events and AI Usage). Replaces the provisioning script.
4. Internal architecture and operational documentation (no runtime changes).

Dedicated read-only credentials replace the temporary writer reuse in PROD-11103;
live verification waits for the infrastructure deployment.

See [storage credential verification](credentials.md) for the
opt-in read-only cloud and isolated local security tests.
