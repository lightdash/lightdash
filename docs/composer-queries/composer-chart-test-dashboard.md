# Test composer dashboard

A dashboard holding one composer chart tile, for proofs and tests. Never add
composer tiles to a seeded dashboard: content-as-code upload and promotion
refuse dashboards that hold them, so `contentAsCode.test.ts` and
`promotion.test.ts` fail.

One helper, `createComposerDashboard` in
`packages/api-tests/helpers/composerDashboard.ts`, creates a new dashboard, its
composer chart and the tile; `deleteComposerDashboard` removes the dashboard
and, through it, the chart.

On a preview or local instance (needs the `composer-charts` flag, on in
previews, and a personal access token of an editor or above):

```bash
SITE_URL=https://<preview>.lightdash.dev LDPAT=<token> \
  pnpm -F api-tests composer-dashboard create
# {"dashboardUuid":"…","composerChartUuid":"…","url":"…"}
SITE_URL=… LDPAT=… pnpm -F api-tests composer-dashboard delete <dashboardUuid>
```

In tests:

```ts
// packages/api-tests
const { dashboard, chart } = await createComposerDashboard(apiClientSend(admin));
tracker.trackDashboard(dashboard.uuid);

// packages/e2e (support/cleanup.ts deletes it when the worker exits)
const { dashboard, chart } = await createComposerDashboard(api);
```

## Space-owned chart

A composer chart a space owns, with no dashboard. In an existing space it is
one call (`composerSpaceChartBody(spaceUuid)` in the same helper builds the
body):

```bash
curl -X POST "$SITE_URL/api/v2/projects/<projectUuid>/composer-charts" \
  -H "Authorization: ApiKey $LDPAT" -H 'Content-Type: application/json' \
  -d '{"dashboardUuid": null, "spaceUuid": "<spaceUuid>", "name": "Orders by status",
       "pipeline": {"schemaVersion": 1, "terminalNodeId": "orders", "nodes": [{
         "sourceType": "semanticLayer", "nodeId": "orders", "title": "Orders by status",
         "exploreName": "orders", "dimensions": ["orders_status"],
         "metrics": ["orders_total_order_amount"]}]},
       "chart": {"schemaVersion": 1, "columns": [
         {"reference": "orders_status", "fieldType": "dimension"},
         {"reference": "orders_total_order_amount", "fieldType": "metric"}],
         "chartConfig": {"type": "table", "config": {}}, "pivotConfig": null,
         "tableConfig": {"columnOrder": ["orders_status", "orders_total_order_amount"]}}}'
```

It needs `SavedChart` write on the space, `manage:ComposerChart` and the
per-node permissions. There is no delete for the chart alone yet: deleting its
space deletes it. With soft delete on, the chart stays in the trashed space,
refused for everything, until the space is purged.

The script creates a new space that inherits project access with a chart in it, and deletes it:

```bash
SITE_URL=… LDPAT=… pnpm -F api-tests composer-dashboard create-space
# {"spaceUuid":"…","composerChartUuid":"…","apiUrl":"…"}
SITE_URL=… LDPAT=… pnpm -F api-tests composer-dashboard delete-space <spaceUuid>
```

Scenarios every proof on a space-owned chart checks:

- a viewer of the space reads it (`GET …/composer-charts/{uuid}`, 200);
- a user in the organization who cannot view the space is refused (403);
- with `composer-charts` off, the create is refused (403, `featureFlagId`)
  while reading an existing chart still answers.
