# Analytics storage credentials

See [architecture](architecture.md) for the full pipeline and
[local testing](local-testing.md) for project provisioning.

The stack is connector + `analytics-project` flag → bucket access → project
provisioning with both system explores → internal documentation. Dedicated
read-only credentials are deferred to PROD-11103. The credential provider itself
does not expose an HTTP endpoint or public connector. Its caller must authorize
the project's org and check the shared flag before constructing the resolver;
the current development-only source-org mapping is described in the architecture.

## Reuse existing writer configuration

`createS3AnalyticsSourceResolver` accepts server-owned storage configuration from
the existing usage-events writer and a validated org. It reuses the
backend's S3 SDK authentication. There is no CLI authentication, OAuth exchange,
new service account, or Terraform requirement for this temporary read path.

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
disables profiling, disables file/metadata caches and spill, and uses a separate
in-memory instance for each query. HTTP is allowed only for loopback test storage;
remote endpoints require HTTPS.

The native HTTP reader can retry a rejected HEAD request with a ranged GET; both
the live GCS test and local MinIO test exercise this with GET-signed URLs. Expired
URLs fail closed; retry the query to obtain a fresh manifest and signatures.

The trusted backend still holds write-capable credentials. A compromised backend
or authorization bug in the signer remains a risk. Read-only identity migration
reduces writer privilege exposure; it does not replace org authorization. Until
that migration, credentials may also cover other storage used by the deployment.

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
environment file containing the existing `USAGE_EVENTS_S3_BUCKET`,
`USAGE_EVENTS_S3_ACCESS_KEY`, `USAGE_EVENTS_S3_SECRET_KEY`, and
`USAGE_EVENTS_S3_REGION` settings. Only those settings are read; no database or
other instance configuration is loaded. Set `ANALYTICS_S3_LIVE_ORG_UUID`. The test
queries all retained partitions for that org. The endpoint
defaults to GCS; override `ANALYTICS_S3_LIVE_ENDPOINT` for another S3 service.

```sh
pnpm -F backend test src/services/ProjectService/analyticsProject/S3AnalyticsSource.live.test.ts
```

Both external suites are skipped unless explicitly configured. Never commit an
environment file, signed URL, credential, or customer-specific test fixture.
Read-only production credential rollout is tracked separately in PROD-11103;
ingestion credentials and cloud infrastructure are unchanged here.
