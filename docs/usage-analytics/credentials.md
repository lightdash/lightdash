# Analytics storage credentials

See [architecture](architecture.md) for the full pipeline and
[local testing](local-testing.md) for project provisioning.

The analytics reader uses dedicated storage credentials (PROD-11103), separate
from event ingestion and compaction. The credential provider itself
does not expose an HTTP endpoint or public connector. Its caller must authorize
the project's org and check the shared flag before constructing the resolver;
the source org always comes from that project, never an environment override.

## Dedicated reader configuration

Configure all five settings through the deployment's secret mechanism:

- `ANALYTICS_S3_ENDPOINT`
- `ANALYTICS_S3_BUCKET`
- `ANALYTICS_S3_REGION`
- `ANALYTICS_S3_ACCESS_KEY`
- `ANALYTICS_S3_SECRET_KEY`

Missing or blank values disable analytics reads without preventing application
startup. There is no fallback to `USAGE_EVENTS_S3_*`, base `S3_*`, ambient AWS
credentials, or CLI authentication. The writer and compactor retain their existing
configuration. Invalid credentials fail at storage access; they are never retried
with writer credentials. Remote endpoints require HTTPS.

`createAnalyticsClient` passes this server-owned configuration and the persisted
project org to `createS3AnalyticsSourceResolver`. Cloud infrastructure provisions
a separate reader service account and HMAC key per opted-in deployment with a
bucket-level `roles/storage.objectViewer` grant. The application cannot infer
effective IAM permissions from a key: operators must supply the reader key, not
copy the writer key into these settings.

The resolver lists only `events/compacted/org_id=<org>/` and selects the existing
`query_events` and `ai_usage` Parquet files across all retained dates. Date filters
belong to Explore queries; there is no fixed source date window. It signs exact GET
URLs with 15-minute lifetimes. The file manifest and signatures are refreshed for
each DuckDB session. Listing is bounded and fails closed on malformed pagination,
cross-org objects, missing data, or credential failures.

DuckDB receives the signed URLs, not the access key/secret or bucket-wide secret.
Signed URLs are capabilities: never expose them through API responses, model SQL,
logs, or project configuration. The connector restricts access to the exact signed
file list, blocks catalog queries that disclose view SQL, sanitizes native errors,
disables profiling and spill, and uses a separate
in-memory instance for each query. HTTP is allowed only for loopback test storage;
remote endpoints require HTTPS.

The native HTTP reader can retry a rejected HEAD request with a ranged GET; both
the live GCS test and local MinIO test exercise this with GET-signed URLs. Expired
URLs fail closed; retry the query to obtain a fresh manifest and signatures.

On shared instances the reader can read every org prefix in its deployment's
bucket. Backend authorization and exact-object signatures enforce org isolation;
read-only is not storage-enforced per-org isolation. The backend still hosts the
writer, so full backend compromise remains outside this boundary.

## Rollout, rollback and rotation

1. Deploy the reviewed Cloud infrastructure change first, keeping
   `analytics-project` disabled. No Terraform commands are required locally.
2. Deploy this reader consumer and restart via normal secret/deployment handling.
   Verify all five reader settings are present without printing their values.
3. Explicitly enable `analytics-project` on the intended deployment only. The
   backend requires `LIGHTDASH_ENABLE_FEATURE_FLAGS` and respects
   `LIGHTDASH_DISABLE_FEATURE_FLAGS` precedence. It no longer requires development
   mode or the legacy `LIGHTDASH_LOCAL_ANALYTICS_*` org bindings.
4. Verify creation, compilation, both explores, dashboards, sync, flag-off denial,
   cross-org denial, and unchanged ingestion/compaction. Existing local projects
   whose org differed from the source-org override now query their own org; no
   source-org remapping is supported.
5. Verify effective reader IAM denies writes/deletes using disposable fixtures
   only. Live reader credentials and end-to-end validation remain pending until
   the infrastructure deployment; earlier writer-backed tests do not prove this
   cutover works.

On failure disable the feature, preserve projects/content, and investigate. Do
not restore a writer fallback. Rotate the reader by provisioning another key on
the reader identity, updating only `ANALYTICS_S3_*`, and verifying restarted pods
before retiring the old reader key. Existing signed URLs live for up to 15 minutes;
disabling the feature does not revoke previously issued URLs. Never revoke the
writer key during reader rotation.

## Validation

Unit coverage tests prefix filtering, pagination, exact GET signing, invalid scope,
credential-free manifests, native-error redaction, and blocked catalog/file reads.

The opt-in local test creates a uniquely named bucket on loopback MinIO, uploads
synthetic Parquet, runs actual DuckDB queries, verifies tampered cross-org URLs,
PUT attempts, and expired URLs fail, and deletes only its own fixtures/bucket.
Supply local MinIO credentials as `S3_ACCESS_KEY` / `S3_SECRET_KEY` and run:

```sh
ANALYTICS_S3_SMOKE_ENDPOINT=http://localhost:9000 pnpm -F backend test src/services/ProjectService/analyticsProject/S3AnalyticsSource.smoke.test.ts
```

The opt-in cloud test is read-only. Set `ANALYTICS_S3_LIVE_ENV_FILE` to a secure
environment file containing all five `ANALYTICS_S3_*` settings listed above.
Only those settings are read; no database or
other instance configuration is loaded. Set `ANALYTICS_S3_LIVE_ORG_UUID`. The test
queries all retained partitions for that org using the same configuration parser
as the application. Old writer-only files are rejected.

```sh
pnpm -F backend test src/services/ProjectService/analyticsProject/S3AnalyticsSource.live.test.ts
```

Both external suites are skipped unless explicitly configured. Never commit an
environment file, signed URL, credential, or customer-specific test fixture.
Read-only production credential rollout is tracked in PROD-11103;
ingestion credentials and cloud infrastructure are unchanged here.
