# Retrieve embedded usage by viewer and brand

Use the organization's **Lightdash analytics** project to retrieve recorded
embedded query activity through the existing Run Query API. The same Query
Events Explore supports detail rows, grouping, filters, CSV/XLSX downloads and
saved reporting. A separate raw usage API is unnecessary for this workflow.

## Configure the embed issuer

Add these claims to the JWT your backend signs. Keep your existing content,
expiry and other required embed claims.

```json
{
  "user": { "externalId": "viewer-42" },
  "userAttributes": { "brand_id": "brand-a" },
  "usageAnalytics": { "tenantAttribute": "brand_id" }
}
```

`usageAnalytics.tenantAttribute` selects one of the JWT's existing user
attributes for reporting. In this example, Brand A and Brand B can load the
same dashboard while their query rows carry different `embed_tenant_id` values.
Use a stable, opaque brand identifier appropriate for everyone with access to
the organization's analytics. This selection does not change row-level security.

The selected attribute must be an own JWT attribute containing a non-blank
string of at most 254 characters, directly or in a single-element array.
Multi-value attributes cannot identify one tenant. Explicit viewer IDs must also
be non-blank strings of at most 254 characters. Malformed Unicode and null bytes
make a reporting identifier unusable, so that field is omitted. See
[embedded attribution](embedded-attribution.md) for the field semantics.

| Query Events field ID                  | Meaning                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `query_events_external_user_id`        | Explicit `user.externalId` from the signed JWT                   |
| `query_events_embed_token_fingerprint` | Token fingerprint when no usable explicit viewer ID was supplied |
| `query_events_embed_tenant_attribute`  | Selected attribute name, such as `brand_id`                      |
| `query_events_embed_tenant_id`         | Selected attribute value, such as `brand-a`                      |
| `query_events_user_id`                 | Registered actor identifier, empty for JWT query activity        |

Include the source `project_id` when comparing external identities across
projects. If identifiers are unique only within a brand, include the tenant
attribute and tenant ID in your grouping too. Token fingerprints identify tokens,
so reissuing a token can change the value. They cannot establish a unique person.

## Authenticate the reporting job

Run these reporting requests from your backend with an API credential belonging
to an identity authorized to query the Analytics project. The examples use a
personal access token in `Authorization: ApiKey ...`. A suitably authorized
service account can also automate reporting. Keep the reporting credential on
your backend.

The JWT used to show a customer their embedded dashboard grants access to that
embed's content. Use a reporting identity with managed Analytics access for the
organization-wide usage query. Organization admins have that access by default.
Other identities need **View managed analytics for the entire organization**
(`view:SystemAnalytics`) plus the normal project and Explore query permissions.
See [managed analytics access](access.md).

Set `SITE_URL` to your instance URL and `LDPAT` to the reporting token. Retrieve
the projects visible to that identity.

```bash
curl --fail-with-body \
  -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v1/org/projects"
```

The response contains `status: "ok"` and a `results` array. Find the project
whose `provisioningSource` is `"analytics"`, then use its `projectUuid` as
`ANALYTICS_PROJECT_UUID` below. The display name alone does not identify a
managed project. If it is absent, ask your administrator to create the project
or grant the reporting identity access.

The project exposes usage across the organization. Filter
`query_events_project_id` to select the original embedded project's UUID.
That UUID differs from `ANALYTICS_PROJECT_UUID`, which identifies the project
executing the report.

## Retrieve individual query outcomes

Save the following body as `embedded-query-details.json`. Replace
`SOURCE_PROJECT_UUID` and the dates for your report. It selects Brand A's
recorded outcomes for seven complete UTC days, including their query, chart,
dashboard and data app identifiers when those were captured.

```json
{
  "query": {
    "exploreName": "query_events",
    "dimensions": [
      "query_events_event_ts_raw",
      "query_events_project_id",
      "query_events_query_id",
      "query_events_chart_id",
      "query_events_dashboard_id",
      "query_events_app_id",
      "query_events_external_user_id",
      "query_events_embed_token_fingerprint",
      "query_events_embed_tenant_attribute",
      "query_events_embed_tenant_id",
      "query_events_status",
      "query_events_context",
      "query_events_cache_hit"
    ],
    "metrics": [],
    "filters": {
      "dimensions": {
        "id": "embedded-usage-window",
        "and": [
          {
            "id": "source-project",
            "target": { "fieldId": "query_events_project_id" },
            "operator": "equals",
            "values": ["SOURCE_PROJECT_UUID"]
          },
          {
            "id": "tenant-attribute",
            "target": { "fieldId": "query_events_embed_tenant_attribute" },
            "operator": "equals",
            "values": ["brand_id"]
          },
          {
            "id": "tenant",
            "target": { "fieldId": "query_events_embed_tenant_id" },
            "operator": "equals",
            "values": ["brand-a"]
          },
          {
            "id": "from-inclusive",
            "target": { "fieldId": "query_events_event_ts_raw" },
            "operator": "greaterThanOrEqual",
            "values": ["2026-11-10T00:00:00Z"]
          },
          {
            "id": "until-exclusive",
            "target": { "fieldId": "query_events_event_ts_raw" },
            "operator": "lessThan",
            "values": ["2026-11-17T00:00:00Z"]
          }
        ]
      }
    },
    "sorts": [
      { "fieldId": "query_events_event_ts_raw", "descending": false },
      { "fieldId": "query_events_query_id", "descending": false }
    ],
    "limit": 5000,
    "tableCalculations": [],
    "timezone": "UTC"
  }
}
```

Choose dates that have already closed and compacted on your instance. This
example covers November 10 through November 16, 2026, inclusive.
The half-open interval includes the start and excludes the end, so adjoining
reports do not overlap at midnight. `event_ts` is the recorded outcome time.

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: ApiKey $LDPAT" \
  -H 'Content-Type: application/json' \
  --data-binary @embedded-query-details.json \
  "$SITE_URL/api/v2/projects/$ANALYTICS_PROJECT_UUID/query/metric-query"
```

The response's `results.queryUuid` identifies this reporting query. Set
`QUERY_UUID` to that value and poll the results endpoint with the same credential.

```bash
curl --fail-with-body \
  -H "Authorization: ApiKey $LDPAT" \
  "$SITE_URL/api/v2/projects/$ANALYTICS_PROJECT_UUID/query/$QUERY_UUID?page=1&pageSize=500"
```

An HTTP success response wraps the query state under `results.status`. Continue
polling with a short delay while it is `pending`, `queued` or `executing`.
Stop on `ready`, `error`, `expired` or `cancelled`. Error and expired responses
include `results.error` when available.

A ready response includes `results.rows`, `results.columns`, `totalResults`,
`totalPageCount` and pagination fields. Each cell is wrapped in
`{ "value": { "raw": ..., "formatted": ... } }`. For example, read the
tenant with `row.query_events_embed_tenant_id.value.raw` and use raw values for
processing. Follow `results.nextPage` until it is absent. Page size defaults to
500 and supports at most 5000 rows.

Pagination reads the result produced by the original query. The query's `limit`
still caps that result. If it reaches the limit, split the report into smaller
UTC time windows or use a grouped report. Store query IDs in your own extraction
job to handle repeated retrieval of overlapping windows.

## Group activity by brand and viewer

Reuse the previous request's date and source-project filters. Remove the filter
whose ID is `tenant` to compare all values of the selected `brand_id` attribute.
Replace the dimension, metric and sort arrays with these values.

```json
{
  "dimensions": [
    "query_events_project_id",
    "query_events_embed_tenant_attribute",
    "query_events_embed_tenant_id",
    "query_events_external_user_id"
  ],
  "metrics": ["query_events_total_queries"],
  "sorts": [{ "fieldId": "query_events_total_queries", "descending": true }]
}
```

Submit the resulting full request to the same endpoint and poll its query UUID.
Add `query_events_event_ts_day` to dimensions for a daily breakdown. Add
`query_events_dashboard_id` or `query_events_chart_id` to compare content.
The joined `lightdash_dashboards_name` and `lightdash_charts_name` dimensions
provide names when metadata is available. Keep IDs for durable joins, since
names can change or be missing.

`query_events_total_queries` counts recorded query outcomes, including cache
hits and errors. Filter `query_events_status` and `query_events_cache_hit`
explicitly when you want a narrower population. `query_events_unique_users`
counts distinct non-null registered actor IDs, including service accounts.
JWT viewers have a null registered actor ID, so that metric excludes them.
To count external viewers, retrieve/group explicit external IDs and deduplicate
within the intended project and tenant scope. Rows without an explicit ID have
unknown people counts.

## Download or schedule the report

In the Analytics project, open **Query Events**, select the same fields and
filters, run the query, and download CSV or Excel. You can save a chart from
the query for reuse and use scheduled data exports where available. Managed
analytics data downloads require configured export storage.

For an API export of a completed reporting query, queue a download.

```bash
curl --fail-with-body \
  -X POST \
  -H "Authorization: ApiKey $LDPAT" \
  -H 'Content-Type: application/json' \
  --data '{"type":"csv","onlyRaw":true}' \
  "$SITE_URL/api/v2/projects/$ANALYTICS_PROJECT_UUID/query/$QUERY_UUID/schedule-download"
```

Use `"type":"xlsx"` for Excel. The response contains `results.jobId`.
Poll `GET /api/v1/schedulers/job/{jobId}/status` with the same authentication
until `results.status` is `completed` or `error`. A completed download job's
`results.details.fileUrl` points to the generated file. For a protected URL on
your own instance, use the authorized identity. Fetch a signed storage URL
without the API credential. Only attach the reporting token to your configured
instance origin. Inspect `results.details.truncated` when present.
The UI applies the same export and managed analytics access checks. See
[access and downloads](access.md).

## Freshness and interpretation

New query and export attribution becomes queryable after the normal closed-day
compaction. Today's raw events are not yet available in this Explore. Older
rows retain null attribution fields, and backfill cannot reconstruct the signed
tenant selection or external viewer. Existing projects may need their managed
models refreshed before the new fields appear. Compare complete, compacted UTC
intervals when validating your extraction.

A dashboard can issue several queries. Filter changes, retries, automated work,
errors and cache hits can each affect query outcomes. Event delivery can also
repeat a record. Use query IDs to reconcile detailed records and decide how your
own usage report handles repeated attempts. These recorded outcomes do not
establish invoice totals or a contractual chart-load counting rule.

**Export Events** reports existing CSV/XLSX export lifecycle activity separately,
including embedded downloader attribution when captured. Filter
`export_events_event_name` to `download_results.completed` for completed file
generation. `total_events` includes starts, completions, failures and retries.
An export completion establishes generation of a file, with no proof that a
recipient received or read it. Query outcomes and export lifecycle records
measure different actions and must not be added into one load count. Browser
print and image downloads are outside that export stream. See
[export coverage](exports.md).
