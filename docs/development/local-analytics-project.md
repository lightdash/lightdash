# Local usage analytics triage (PROD-11059)

Development-only prototype, not the production metadata-project rollout. It
creates a `PREVIEW` project with a backend-owned `analytics` provisioning marker
and an invisible DuckDB `analytics` connection.
No MotherDuck account, dbt project, or configurable connector UI is required.

## Configure and provision

Start an isolated development instance using the worktree runbook. Configure the
usage-events writer's S3-compatible storage settings: `USAGE_EVENTS_S3_ENDPOINT`,
`USAGE_EVENTS_S3_BUCKET`, `USAGE_EVENTS_S3_ACCESS_KEY`,
`USAGE_EVENTS_S3_SECRET_KEY`, and `USAGE_EVENTS_S3_REGION`. The reader reuses this
server-owned configuration to issue signed GET URLs; it requires no CLI login,
OAuth exchange, or new cloud infrastructure. The usage-events endpoint defaults
to `S3_ENDPOINT`; override it when analytics uses GCS and local storage uses MinIO.

Add these values to that worktree's `.env.development.local` (never commit them):

```dotenv
LIGHTDASH_ENABLE_FEATURE_FLAGS=analytics-project
LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID=<local-organization-uuid>
LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID=<source-organization-uuid>
LIGHTDASH_LOCAL_ANALYTICS_START_DATE=2026-09-07
LIGHTDASH_LOCAL_ANALYTICS_END_DATE=2026-09-07
```

Preserve other enabled flags if needed. Explicitly disabling `analytics-project`
takes precedence. The two org IDs are an intentional local-only binding;
production must use the authenticated org and reviewed credential isolation.

As a signed-in organization administrator, call the same-origin endpoint from
the browser console on your assigned local frontend:

```javascript
const response = await fetch('/api/v1/org/analytics-project', { method: 'POST' });
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
previews with no upstream. No admin navigation has been added.

## Read path and safeguards

The backend lists `events/compacted/org_id=<uuid>/stream=<name>/dt=<date>/*.parquet`
for `query_events` and `ai_usage` within the inclusive configured date range.
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

- Replace the backend signer's write-capable source identity with dedicated
  read-only credentials (PROD-11103). The interim signed-URL path keeps broad keys
  out of DuckDB but still trusts the signer. Replace local source-org overrides
  with the persisted project's org. Folder separation is not an IAM boundary.
- Review every permissions and cached/downloaded-results surface. Finish SQL
  Runner, scheduling, AI and model-editing exclusions. Local org-admin checks are
  not the final metadata-project role design.
- Production provisioning, admin navigation, and feature-flag-service integration.
- Latest resource names, additional domain metrics, schema evolution, empty
  streams, retention and query performance.
- Result-cache freshness and manifest/view caching at scale. The configured
  date range is a triage bound, not the final UX.
- Reevaluate direct Parquet writes and optional compaction separately. This
  slice only reads existing compacted data; the writer/nightly job is unchanged.

Actual GCS reads and isolated MinIO tests verify the signed-URL path; AWS S3 and
production multi-tenant rollout remain unverified.
The implementation rejects production execution even with its flag enabled.

## Incremental PR stack

1. Internal Parquet connector, source resolver, and shared `analytics-project` flag.
2. Signed-URL bucket access using the existing writer's backend credentials.
3. Admin create-or-get endpoint, preview provisioning, signed-URL provider, and both
   system models (Query Events and AI Usage). Replaces the provisioning script.
4. Dedicated read-only credential source, deferred to PROD-11103.

See [storage credential verification](analytics-storage-credentials.md) for the
opt-in read-only cloud and isolated local security tests.
