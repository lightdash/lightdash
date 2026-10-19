# Dashboard store

Filter and parameter state for one mounted dashboard. `DashboardProvider`
creates the store with `createDashboardStore(buildInitialDashboardState(...))`
and mounts it on `DashboardStoreContext`.

## Rules

- **Read values from the store, call actions from the context.** Values
  (`dashboardFilters`, `parameterValues`, ...) come from `useDashboardSelector`
  and the hooks in `hooks.ts`. Mutations stay on `useDashboardContext` (e.g.
  `c.updateDimensionDashboardFilter`). Those callbacks are stable and dispatch to
  the store, so the provider never re-renders on a filter or parameter edit.
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
- **URL, session storage and embed sync** live in
  `providers/Dashboard/DashboardFiltersSync.tsx` and `DashboardParametersSync.tsx`.

## Tests

- `providers/Dashboard/DashboardProvider.characterization.test.tsx` pins provider
  behaviour, quirks included, through one adapter. Change behaviour on purpose,
  never to make it pass.
- `DashboardProvider.renderBenchmark.test.tsx` asserts render counts per edit; a
  rise is a performance regression.
- Component tests seed a real store with `createDashboardTestStore` and
  `DashboardStoreTestProvider` from `src/testing/`; don't mock the selectors.
