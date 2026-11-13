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
