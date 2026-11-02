# Dashboard store

All state of one mounted dashboard: what the provider loaded (`source`), filters,
parameters, runtime date zoom, tile status, viewer chart sort and edit state.
`DashboardProvider` creates the store with
`createDashboardStore(buildInitialDashboardState(...))` and mounts it on
`DashboardStoreContext`.

## Rules

- **The dashboard context is a view of the store.** `useDashboardContext(selector)`
  reads `getDashboardContextView(store)`, a memoised object of the `source`
  selectors plus the setters from `contextActions.ts`; it re-renders only when
  the selected value changes. There is no React context behind it. New code
  reads with `useDashboardSelector` and a selector, and dispatches actions.
- **`source` mirrors the provider.** The dashboard query, the project, the
  available filters, comments and the version refresh land in `source` through
  `dashboardSourceActions.sync`, seeded on the first render and mirrored in a
  layout effect after that. Embeds set `embedDashboard`; `selectDashboard`
  returns whichever is loaded. Derived values (`selectFilterableFieldsByTileUuid`,
  `selectAllFilterableFieldsMap`, `selectTemporaryFilterLocks`, ...) are
  reselect selectors over it.
- **Setters read the store at call time.** `createDashboardContextActions(store)`
  builds them once per store, so they are stable for the dashboard's life and
  the provider never re-renders on a filter, parameter or date zoom change, nor
  when tiles report their zoomable fields or applied zoom.
- **A subtree may override the filter fields.** `SettledFilterFields` provides
  `FilterFieldsOverrideContext`; `useDashboardContext` merges it over the view
  for that subtree only.
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
  `seedDashboardEditState` writes a context-shaped fixture into the store, and
  `source` seeds the dashboard, project and available filters.
