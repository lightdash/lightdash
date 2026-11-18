# Embedded usage attribution

Query Events can distinguish embedded queries for different viewers and
tenants, even when they use the same dashboard or chart. Use the fields in the
Analytics project, query them with the Run Query API, or export a result to
CSV or XLSX. Existing access to the Analytics project applies.
For complete JWT, API-query and export examples, see the
[viewer and brand reporting guide](embedded-attribution-api.md).

To report the existing tenant user attribute, add `usageAnalytics.tenantAttribute`
to the signed JWT alongside the usual `userAttributes` and optional
`user.externalId`:

```json
{
  "user": { "externalId": "viewer-42" },
  "userAttributes": { "brand_id": "brand-7" },
  "usageAnalytics": { "tenantAttribute": "brand_id" }
}
```

The example shows only the attribution claims; keep the regular embed content
and expiry claims. The selected attribute must be an own JWT attribute with a
non-blank string value of at most 254 characters, either directly or in a
single-element array. A multi-value attribute has no single tenant ID. Choose
an opaque identifier appropriate for Analytics project users. The claim does not change any
row-level security rules, and other attributes are not collected for this
attribution.

- **External viewer ID** is the explicit external ID from the signed JWT, when
  it is non-blank and at most 254 characters. It does not populate **User UUID**.
- **Embed token fingerprint** is present when no usable explicit viewer ID was
  supplied. It identifies a token, so refreshed tokens can produce different
  values. Do not count fingerprints as unique people.
- **Embed tenant attribute** and **Embed tenant ID** contain the selected
  attribute name and value when the issuer opted in. Group on both if you
  use different attribute names.

The fields are empty for historical query rows and registered requests.
Preview JWTs do not contribute attribution. New attribution becomes queryable
after the usual event compaction. There is no historical reconstruction.

Query Events report the existing recorded query outcomes, including cache
hits and errors. A dashboard can issue several queries, and queries served
from cache can produce usage rows without a warehouse execution. Do not use
the row count as a dashboard visit count or a billing total. The existing
Export Events stream attributes recorded CSV/XLSX export activity separately;
browser print and image downloads are outside that stream.

## Embedded dashboard loads

Use **Embed view events** for readership trends by customer tenant. It counts
successful authorized dashboard fetches, not tiles, query results, cache hits,
filter changes, browser renders, or billable usage. A reload or retry that
successfully fetches the dashboard again counts separately; replaying the same
source event does not. Standalone chart and data app embeds, preview embeds,
and SDK renders from preloaded dashboard data are not covered.

The Explore uses the same signed attribution claims described above. Unknown
tenants and anonymous viewers remain visible in **Tenant coverage** and
**Viewer coverage**. A token fingerprint is not a viewer ID and is not exposed
in this Explore. Distinct viewer and tenant counts are scoped to project and
tenant attribute; the same external viewer ID in two tenants counts separately.
Customer tenant IDs are reporting dimensions, not access grants. Managed
Analytics reads remain scoped to the Lightdash organization and its existing
project permissions.

The dedicated stream starts at deployment, with the existing managed Analytics
capture gate and nightly compaction. Previously captured **Embed reach** events
remain unchanged and are not backfilled into this model. The two models overlap
after deployment, so do not add their counts. Use **Event id** and **Schema
version** for reconciliation; missing coverage is not evidence of no readership.

### Runnable example

In the Analytics project, open **Embed view events**. Filter **Content id** to
the shared dashboard and **Event ts → Day** to the last seven complete UTC
days. Group by **Event ts → Day**, **Embed tenant attribute** and **Embed tenant
ID**. Select **Loads**, **Distinct external viewers** and **Distinct tenants**.
Add **Tenant coverage** to make unattributed traffic explicit. To see readership
by viewer, add **External viewer ID**; keep the tenant dimensions selected so
shared external IDs stay separate.

For the local raw-to-Explore smoke test against development MinIO, run:

```sh
USAGE_EMBED_VIEWS_SMOKE_ENDPOINT=http://localhost:9000 pnpm -F backend test src/analytics/eventStream/EmbedViewEvents.smoke.test.ts --maxWorkers=1
```
