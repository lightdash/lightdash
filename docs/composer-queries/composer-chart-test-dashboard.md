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

A composer chart a space owns, with no dashboard. `createComposerSpaceChart`
in the same helper creates a new space (inheriting project access) and the
chart; `deleteComposerSpace` deletes the space and, through it, the chart.
With soft delete on, the chart stays in the trashed space, refused for
everything, until the space is purged.

```bash
SITE_URL=… LDPAT=… pnpm -F api-tests composer-dashboard create-space
# {"spaceUuid":"…","composerChartUuid":"…","apiUrl":"…"}
SITE_URL=… LDPAT=… pnpm -F api-tests composer-dashboard delete-space <spaceUuid>
```

The create alone is one call: the body of `composerSpaceChartBody(spaceUuid)`
(`dashboardUuid: null`, `spaceUuid`, a name, the pipeline and the chart) sent
to `POST /api/v2/projects/{projectUuid}/composer-charts`. It needs `SavedChart`
write on the space, `manage:ComposerChart` and the per-node permissions.

Scenarios every proof on a space-owned chart checks:

- a viewer of the space reads it (`GET …/composer-charts/{uuid}`, 200);
- a user who cannot view the space is refused (403);
- with `composer-charts` off, the create is refused (403, `featureFlagId`)
  while reading an existing chart still answers.
