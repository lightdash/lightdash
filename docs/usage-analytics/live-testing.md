# Feature-flagged live analytics testing

The internal analytics project can run with `NODE_ENV=production`. It continues
to use the existing server-owned `USAGE_EVENTS_S3_*` configuration and signed GET
URLs; no dedicated reader identity, `ANALYTICS_S3_*` configuration or Terraform
change is required. Read-only credential hardening is deferred in PROD-11103.

## Enable on the intended deployment

1. Verify the existing usage-events endpoint, bucket and credentials are correct
   for the deployment and that its org has compacted Parquet data. Confirm effective
   IAM does not grant the identity access to other deployments' buckets.
2. Enable `analytics-project` for the intended organization in Console, or add it
   to `LIGHTDASH_ENABLE_FEATURE_FLAGS` for deployment-wide enablement. Backend
   checks use the standard flag resolver with the target organization, including
   on file reads. Console organization overrides are read without an analytics
   flag cache; no restart is needed. ENV changes require a deployment/restart.
   Standard precedence applies: ENV enable wins, then ENV disable, then database
   organization override/default (preview overrides follow preview rules).
   Do not change `NODE_ENV` or enable unrelated deployments.
3. After deploying this code, sign in as an organization admin.
   In Organization settings → Lightdash analytics, create the project, open its
   dashboards and Explore, and exercise Sync content.
4. Verify both AI usage and query events, non-admin and cross-org denial, then
   flag-off denial for creation, status, sync, deletion and query/result access.
   Do not delete a project with valuable custom content just to test the flow.

The create endpoint accepts no org/bucket/credential configuration. Creation uses
the session org; query connections use the persisted project's org after access
checks. Both legacy `LIGHTDASH_LOCAL_ANALYTICS_ORG_UUID` and
`LIGHTDASH_LOCAL_ANALYTICS_SOURCE_ORG_UUID` overrides are ignored, including in
development. Local demos with mismatched source and project orgs must use matching
fixtures; they can no longer read another org through an override.

No flags are enabled or infrastructure applied by this code change. Live production
verification remains pending deployment. Roll back by disabling the organization
flag in Console when no ENV enable forces it on, or remove the ENV enable and
explicitly disable it. Leave projects/content intact. Issued signed URLs remain valid until
expiry (up to 15 minutes); flag-off does not revoke data already returned.

## Accepted boundary

Credentials stay in the backend; DuckDB receives only exact-object signed URLs.
The writer identity can read/write/delete across several buckets in its own
deployment, not only usage history. A key leak retains that impact.

On a shared instance, the identity may read every org in its usage bucket. Backend
org checks and signed URLs do not make a leaked raw key per-org restricted. This
controlled internal test is not verification or approval of shared-instance
customer isolation. Broad customer rollout requires separate review.
