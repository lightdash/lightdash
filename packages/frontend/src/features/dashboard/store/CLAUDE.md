# Dashboard store

Filter, parameter, runtime date zoom, tile status and viewer chart sort state
for one mounted dashboard. `DashboardProvider`
creates the store with `createDashboardStore(buildInitialDashboardState(...))`
and mounts it on `DashboardStoreContext`.

## Rules

- **Read values from the store, call actions from the context.** Values
  (`dashboardFilters`, `parameterValues`, `dateZoomGranularity`, ...) come from `useDashboardSelector`
  and the hooks in `hooks.ts`. Mutations stay on `useDashboardContext` (e.g.
  `c.updateDimensionDashboardFilter`). Those callbacks are stable and dispatch to
  the store, so the provider never re-renders on a filter, parameter or date
  zoom change, nor when tiles report their zoomable fields or applied zoom.
- **Tile reports go to the store.** `DashboardTileStatusProvider` keeps only
  stable callbacks and values derived from the tiles and tabs. Read what tiles
  report (loaded tiles, cache time, refresh counter, SQL metadata, custom
  granularities) with selectors, and use `useAreAllChartsLoaded` and
  `useScreenshotReadiness` for the derived states.
- **Use the dashboard hooks, never plain `useSelector`/`useDispatch`.** The store
  lives on its own context so it can't shadow the app-wide AI agent store or an
  explorer store mounted inside a dashboard.
- **Plain reducers, not `createSlice`.** Immer would deep-freeze the react-query
  dashboard objects passed in. `buildInitialState.test.ts` pins that nothing is
  frozen.
- **Lock-aware derived values need context.** Temporary filters are stripped of
  rules locked on the active tab; read them through `useDashboardTemporaryFilters`,
  `useDashboardAllFilters` or `useHasDashboardTemporaryFilters`, never
  `selectRawTemporaryFilters` in UI.
- **Read at call time in handlers.** When a callback needs current values but the
  component doesn't render them, use `useDashboardStore().getState()` instead of
  subscribing (see `pages/Dashboard.tsx` save and add-tile handlers).
- **Select per tile, not the whole map.** Tiles read their own applied zoom with
  `selectIsDateZoomAppliedToTile`, so one tile's report doesn't re-render the rest.
  Chart sorts work the same way: `selectTileChartSorts` returns a shared empty
  list for unsorted tiles, and `c.setTileChartSorts(tileUuid, [])` clears one.
- **The date zoom config stays on the context.** Editor-authored settings
  (`dateZoomConfig`, allowed and default granularities, `isDateZoomDisabled`)
  move with the rest of the edit-mode state, not with the runtime grains.
- **URL, session storage and embed sync** live in
  `providers/Dashboard/DashboardFiltersSync.tsx`, `DashboardParametersSync.tsx`
  and `DashboardDateZoomSync.tsx`.

## Tests

- `providers/Dashboard/DashboardProvider.characterization.test.tsx` pins provider
  behaviour, quirks included, through one adapter. Change behaviour on purpose,
  never to make it pass.
- `DashboardProvider.renderBenchmark.test.tsx` asserts render counts per edit; a
  rise is a performance regression.
- Component tests seed a real store with `createDashboardTestStore` and
  `DashboardStoreTestProvider` from `src/testing/`; don't mock the selectors.
