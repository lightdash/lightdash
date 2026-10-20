# Dashboard store

Filter, parameter, runtime date zoom, tile status and edit state for one
mounted dashboard. `DashboardProvider`
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
- **Edit state is staged in the store until save or cancel.** Tiles, tabs,
  the active tab, custom metrics, the disabled flags, the required filters
  note and their changed flags live in `edit`. The provider subscribes only
  to keys (`selectTileUuidsKey`, `selectSavedChartUuidsAndTileUuidsKey`), so
  moving a tile or switching tab doesn't re-render it.
- **Editor-authored date zoom settings are drafts of the saved config.**
  `dateZoomConfig` and the allowed and default granularities are stored as
  `{ value, basedOn }` and resolved against the saved config at read time,
  so a changed saved config replaces the draft in the same render. Read them
  with `useDashboardDateZoomConfig`, `useDashboardDateZoomGranularities` and
  `useDefaultDateZoomGranularity`; a component that also gets
  `isDashboardLoaded` by prop must get the config by prop too (see
  `ConnectedDashboardDateZoomSync`).
- **URL, session storage and embed sync** live in
  `providers/Dashboard/DashboardFiltersSync.tsx`, `DashboardParametersSync.tsx`
  and `DashboardDateZoomSync.tsx`.

## Tests

- `providers/Dashboard/DashboardProvider.characterization.test.tsx` pins provider
  behaviour, quirks included, through one adapter. Change behaviour on purpose,
  never to make it pass.
- `DashboardProvider.renderBenchmark.test.tsx` asserts render counts per edit; a
  rise is a performance regression.
- `pages/Dashboard.editLifecycle.characterization.test.tsx` pins the edit
  lifecycle (save payloads, dirty state, cancel, failed saves, refetches,
  drafts from session storage) with the real provider and page.
- Component tests seed a real store with `createDashboardTestStore` and
  `DashboardStoreTestProvider` from `src/testing/`; don't mock the selectors.
  `seedDashboardEditState` writes a context-shaped fixture into the store.
