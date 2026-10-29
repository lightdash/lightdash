# Live managed analytics testing

The internal analytics project can run with `NODE_ENV=production`. It continues
to use the existing server-owned `USAGE_EVENTS_S3_*` configuration and signed GET
URLs; no dedicated reader identity, `ANALYTICS_S3_*` configuration or Terraform
change is required. Read-only credential hardening is deferred in PROD-11103.

## Enable on the intended deployment

1. Verify the deployment has a validated commercial license. Verify the existing
   usage-events endpoint, bucket and credentials are correct
   for the deployment and that its org has compacted Parquet data. Confirm effective
   IAM does not grant the identity access to other deployments' buckets.
2. Leave `LIGHTDASH_DISABLE_ANALYTICS` unset or `false`. Validated commercial
   deployments with usage storage expose Analytics to every organization by
   default; old `analytics-project` flag overrides are ignored. The existing
   role and project permissions still decide which users can access it.
3. After deploying this code, sign in as an organization admin.
   In Organization settings → Lightdash analytics, create the project, open its
   dashboards and Explore, and exercise Sync content.
4. Verify both AI usage and query events, non-admin and cross-org denial, then
   deployment opt-out denial for creation, status, sync, deletion and query/result
   access in an isolated test deployment.
   Do not delete a project with valuable custom content just to test the flow.

The create endpoint accepts no org/bucket/credential configuration. Creation uses
the session org; query connections use the persisted project's org after access
checks. Both legacy `LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID` and
`LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID` overrides are ignored, including in
development. Local demos with mismatched source and project orgs must use matching
fixtures; they can no longer read another org through an override.

To disable the feature, set `LIGHTDASH_DISABLE_ANALYTICS=true` and restart every
API, scheduler and NATS worker in the deployment. This stops new capture and
processing and blocks managed Analytics access. Leave projects/content intact.
Existing signed URLs and already delivered data are not revoked by this change.
See [deployment opt-out](access.md#deployment-opt-out).

## Accepted boundary

Credentials stay in the backend; DuckDB receives only exact-object signed URLs.
The writer identity can read/write/delete across several buckets in its own
deployment, not only usage history. A key leak retains that impact.

On a shared instance, the identity may read every org in its usage bucket. Backend
org checks and signed URLs do not make a leaked raw key per-org restricted. This
controlled internal test is not verification or approval of shared-instance
customer isolation. Broad customer rollout requires separate review.
