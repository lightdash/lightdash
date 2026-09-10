# Internal usage analytics architecture

This is an engineering reference for the dedicated analytics project: how events
become queryable Parquet, how the backend obtains access, and which security
boundaries are implemented. It describes the connector, credential provider and
project-provisioning stack, not a production-ready customer rollout.

The intended product is a backend-managed metadata project, separate from an
organization's business models. Users explore fixed dimensions and metrics using
Lightdash's normal Explore/query flow; this is not just a set of hardcoded report
queries. It does not require dbt or a MotherDuck account.

## Current implementation versus rollout intent

| Area                   | Implemented                                                                                     | Still required for production                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Project                | Internal `PREVIEW` project with `provisioning_source=analytics`; both Query Events and AI Usage | Final metadata-project lifecycle and role design                            |
| Entry point            | Session-authenticated, org-admin-only create-or-get endpoint                                    | Admin navigation/button; no connector setup UI                              |
| Enablement             | Explicit deployment `analytics-project` flag; explicit disable takes precedence                 | Controlled live rollout after reader verification                           |
| Source org             | Persisted, authorized project org; no local source-org override                                 | Live shared-instance isolation verification                                 |
| Storage authentication | Dedicated `ANALYTICS_S3_*` credentials in backend; exact signed GET URLs passed to DuckDB       | Deploy read-only identity and verify effective IAM (PROD-11103)             |
| Models                 | Backend-owned `query_events` and `ai_usage` explores                                            | Reevaluate other streams, metadata enrichment and additional event coverage |

Historical tickets and handover proposals may describe different designs. They
are not evidence that production provisioning, resource-name enrichment, exports
or final role restrictions are implemented.

## End-to-end data flow

```text
Backend event projections
  → buffered writer: gzip JSONL in events/raw/ (org / stream / date)
  → scheduled compactor: typed Parquet in events/compacted/ (same partitions)

Signed-in org admin
  → create-or-get endpoint → fixed system explores stored in the app database
  → Explore query → backend authorization and org-scoped file discovery
  → exact-file signed GET URLs → isolated in-memory DuckDB → query results
```

### Write path and partitions

The [event registry](../../packages/backend/src/analytics/eventStream/registry.ts)
allowlists projected events and defines each stream's compacted schema. The
[buffered writer](../../packages/backend/src/analytics/eventStream/BufferedEventStreamWriter.ts)
groups records by org, stream and UTC date, and writes independent gzip JSONL
objects. Writers do not append to a shared Parquet object.

```text
events/raw/org_id=<org-uuid>/stream=<stream>/dt=<YYYY-MM-DD>/<writer>-<uuid>.jsonl.gz
events/compacted/org_id=<org-uuid>/stream=<stream>/dt=<YYYY-MM-DD>/part-<hash>.parquet
```

Partitions are object-key prefixes grouping related data, not separate databases
or access-control policies. Org partitioning keeps each output part within one
org; stream/date partitions keep schemas and time ranges organized. The read
layer lists one org prefix, then selects supported streams across all retained
dates. Date filters belong to Explore queries, not a fixed source window. It does
not list the whole bucket and filter orgs later. Only compacted Parquet is read;
today's uncompacted raw events are not yet available through this reader.

The [compactor](../../packages/backend/src/analytics/eventStream/UsageEventsCompactor.ts)
processes closed date partitions (before today UTC), converts the exact listed
raw objects into typed, Zstandard-compressed Parquet, then deletes those raw
objects only after successful conversion. Unknown streams are skipped. Part
names are deterministic for the input-key set; late-arriving files can produce
additional parts. There is not necessarily one file per day or one file per org.

Compaction reduces the small-file overhead of independent writers and produces
a columnar format suitable for analytics. The reader only sees compacted output,
so capture is not immediately visible in Explore. This stack does not change the
writer or nightly process, or establish an exactly-once delivery guarantee.

### Project creation and models

[`ProjectService.ensureAnalyticsProject`](../../packages/backend/src/services/ProjectService/ProjectService.ts)
backs `POST /api/v1/org/analytics-project`:

1. Check the session's organization, org-management permission and feature flag.
   No org, bucket, path or credential is accepted in the request.
2. Verify signed-Parquet access before creating a project. Model compilation is
   in memory, but the endpoint includes this storage round trip.
3. Acquire the per-org advisory lock and look for `provisioning_source=analytics`.
4. Reuse that project or create an internal DuckDB analytics connection, then
   save both compiled system explores. Repeated calls refresh models without
   deleting saved content and can repair a previous model-save failure.
5. Return `{ projectUuid, url, created }`. Redirect to the returned URL.

The lock serializes concurrent lookup/create requests across API pods. Identity
comes from the internal marker and org, not the display name or slug. The normal
[`generateUniqueProjectSlug`](../../packages/backend/src/utils/SlugUtils.ts)
allocator derives `lightdash-analytics` from `Lightdash analytics`, then tries
`lightdash-analytics-1`, `-2`, etc. within the org. Reused projects keep their slug
and UUID; a conflicting ordinary project is never repurposed.

[`createAnalyticsExplores`](../../packages/backend/src/services/ProjectService/analyticsProject/createAnalyticsExplores.ts)
derives dimensions from the compacted schemas and metrics from
[`systemStreamMetrics`](../../packages/backend/src/analytics/systemExplores/systemStreamMetrics.ts).
It explicitly includes only `query_events` and `ai_usage`; registering another
writer stream does not expose another explore automatically. Compiled models
refer to table names, not signed URLs. SQL and aggregations are generated from
the user's Explore selections over these fixed models.

## Credentials and trust boundaries

There are three distinct forms of access; none should be confused with the others:

| Layer                    | Credential or authority                                       | Scope                                                                     |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| User → Lightdash         | Authenticated session plus org authorization and feature gate | Access to that org's analytics project                                    |
| Backend → object storage | Dedicated server-owned analytics reader access key/secret     | Deployment bucket read/list when provisioned with reader IAM; not per-org |
| DuckDB → Parquet         | Short-lived signed GET URLs generated by the backend          | Exact selected objects, HTTP method and expiry                            |

The current tested cloud path uses GCS's S3-compatible interface and HMAC
credentials with the AWS S3 SDK. It does not run a cloud CLI, obtain a developer
OAuth token, provision an identity or require a MotherDuck token.

### Configuration and lifetime

[`parseAnalyticsS3Config`](../../packages/backend/src/config/parseConfig.ts)
reads `ANALYTICS_S3_ENDPOINT`, `ANALYTICS_S3_BUCKET`, `ANALYTICS_S3_REGION`,
`ANALYTICS_S3_ACCESS_KEY` and `ANALYTICS_S3_SECRET_KEY`. All five are required;
missing/blank values fail closed for reads, without breaking application startup.
There is no writer, base-storage or ambient credential fallback. These are server
configuration, not user-editable project credentials. Writer/compactor
`USAGE_EVENTS_S3_*` settings and ordinary storage remain unchanged.

[`S3AnalyticsSource`](../../packages/backend/src/services/ProjectService/analyticsProject/S3AnalyticsSource.ts)
lists `events/compacted/org_id=<validated-org>/`, validates returned keys and
selects only supported Parquet paths across all retained dates. It bounds pagination
(1,000 objects/page, at most 100 pages) and selected files (10,000), and rejects
incomplete/malformed listings or an empty manifest. It signs exact
`GetObject` requests for 900 seconds and destroys the per-resolution SDK client.
The backend still retains its configured credentials; destroying the client
does not erase that process's configuration or revoke credentials.

Each new DuckDB session resolves a fresh manifest and signatures. Expired URLs
fail; a new query/session obtains new signatures. Credential rotation must
refresh backend configuration through the deployment's normal secret/restart
mechanism; this is not an automatic rotation implementation.

### What reaches DuckDB

The signed manifest contains table names, an expected prefix and exact URLs.
It contains no bucket access key/secret and no bearer token. A signed URL is
itself a bearer capability: anyone possessing it may read that object while it
is valid. Never place one in logs, API responses, tickets or persisted models.

The internal Parquet path in
[`DuckdbWarehouseClient`](../../packages/warehouses/src/warehouseClients/DuckdbWarehouseClient.ts):

- Creates isolated in-memory query instances (256 MB DuckDB memory limit, 32
  threads to overlap remote footer and column reads). Explicit caller resource
  limits override these internal-reader defaults; other DuckDB defaults are unchanged.
- Requires HTTPS for remote storage; HTTP is restricted to loopback test endpoints.
- Validates canonical paths against the trusted scope; disallows arbitrary
  globbing/path substitution and mixing signed URLs with broad storage secrets.
- Sets exact `allowed_paths` and disables general external access and disk spilling.
- Enables HTTP metadata, Parquet metadata and external-file caching only inside
  the private query instance. The instance is closed on success or failure;
  neither cached bytes nor signed URLs are reused by another request or org.
- Builds temporary views over `read_parquet` for those exact objects only.
- Restricts user SQL and blocks catalog access that could disclose view SQL;
  disables profiling and sanitizes native query errors.

Schema binding retains `union_by_name=true` so older files can lack newer columns.
Caching prevents repeated remote metadata reads during binding, validation and
execution. This does not remove all-history discovery, skip old files or change
the 10,000-file cap. Large histories still require further scaling work (PROD-11111);
these settings do not guarantee a latency ceiling for arbitrary data volumes.
Each concurrent query has its own thread budget; deployment-wide and per-org
concurrency limits still need validation before customer rollout.

The query-local cache lifetime does not mean Lightdash has no persisted query results.
The normal result/history paths still exist and need authorization. Analytics
checks cover project access and result/history retrieval; exports and scheduled
downloads are blocked in this preview. Flag-off denial is not deletion or
cryptographic revocation of previously issued capabilities or returned data.

### Org isolation: implemented boundary and remaining risk

[`analyticsProjectClient`](../../packages/backend/src/services/ProjectService/analyticsProject/analyticsProjectClient.ts)
uses the persisted project's org, after service authorization verifies that the
caller belongs to that org and has organization management permission. The old
`LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID` and `LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID`
overrides are ignored in all environments. Explicitly enabling the deployment
feature flag permits production execution; explicitly disabling it takes precedence.

The prefix filter is a backend authorization boundary, not bucket IAM. Storage
signatures enforce the exact object/method capability passed to DuckDB, but the
trusted signer can still access or sign other objects using its broader keys.
A compromised signer/backend is outside the protection provided by those URLs.
Tests for path tampering do not prove arbitrary SQL or backend compromise is safe.

Read-only credentials reduce the signer's write/delete privilege exposure. They
do not, on their own, prevent reads across org prefixes. The identity
design is a separate deployment-level reader identity plus app-side org
binding, not a service account per app org. Creating another key on the writer's
identity does not narrow permissions. See PROD-11103 for infrastructure guidance;
the separate infrastructure deployment and live cutover verification remain pending.

## Operations, verification and rollout

- Follow [local testing](local-testing.md) for feature flags, persisted-org
  binding and the browser-console provisioning request. Keep capture
  disabled for a read-only local test; never copy another worktree's DB settings.
- Follow [credential verification](credentials.md) for real-bucket read-only
  smoke tests and disposable MinIO tests of signatures, expiry and denied writes.
- Missing data: check capture, compaction success, source org, Explore date
  filters, retention and stream schemas. No supported files fails closed; partially missing
  streams and schema evolution still need rollout design.
- Access errors: check endpoint, bucket and configured key permissions without
  printing keys, SDK request details or signed URLs. A new query can recover from
  URL expiry; it cannot fix revoked or incorrectly scoped source credentials.
- Provisioning latency includes storage access. Large org histories can hit the
  listing/file caps; freshness, caching, pagination scale and long-running query
  behavior require further work before production (PROD-11111). Caps fail rather
  than silently exposing only part of the history. Historical availability is
  limited by retained files, not their age; one-year workloads remain unbenchmarked.
- Before rollout: deploy reader credentials, verify IAM and production authorization,
  and review query and cached-result surfaces end to end. Hidden UI and folder
  separation are not substitutes for access control.

The earlier writer-backed read path was exercised against real GCS with native DuckDB and via the
local API for both explores; local UI provisioning was manually confirmed.
Focused tests cover reuse, access denial and credential boundaries. The dedicated
reader cutover has not yet been verified live. This is not
a production multi-tenant security audit or a claim that every warehouse provider
and failure mode has been validated.

## Related work

- [PROD-11059](https://linear.app/lightdash/issue/PROD-11059): implementation/triage.
- [PROD-8603](https://linear.app/lightdash/issue/PROD-8603): pipeline architecture.
- [PROD-11103](https://linear.app/lightdash/issue/PROD-11103): read-only credentials and live cutover.
- Stack: [connector + flag](https://github.com/lightdash/lightdash/pull/28909) →
  [credentials](https://github.com/lightdash/lightdash/pull/28916) →
  [project endpoint](https://github.com/lightdash/lightdash/pull/28849) → documentation.
