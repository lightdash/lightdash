# Visualization store

Editor state for one mounted chart: what the `useXxxChartConfig` hooks used
to keep in `useState`, plus the cartesian intent the chart type gallery hands
to the next cartesian editor. `VisualizationProvider` creates the store with
`createVisualizationStore()` and mounts it on `VisualizationStoreContext`.

## Rules

- **One slice per chart type, `null` until its adapter mounts.** A hook seeds
  its slice with `useEditorState(select, actions, build)`: the seed is built
  once from the chart config on mount, read until the store holds it, and
  cleared when the adapter unmounts. This keeps the `useState` semantics the
  explorer relies on: a chart type switch starts from the cached config, and a
  later change to the saved config does not reset an edit in progress.
- **Hooks keep their signatures and return shapes.** Consumers read
  `visualizationConfig.chartConfig` as before; only where the state lives
  changed. Setters that consumers call with an updater function go through
  `useEditorFieldSetter`, which resolves the updater against the committed
  value.
- **Plain setters use the slice's `set`; anything that reads the previous
  value is a reducer.** Toggles, add/remove on lists and override merges live
  in the slice so they are testable and never race on a stale render.
- **Derived values stay in the hook.** Anything computed from results, the
  items map or the metric query (`validConfig`, chart data, repairs) is not
  stored. Repair effects dispatch `set` like any edit.
- **Use the typed hooks, never plain `useSelector`/`useDispatch`.** The store
  lives on its own context so it can't shadow the explorer or dashboard store
  it is mounted inside.
- **`createSlice` is fine here.** Editor values are plain data; the chart
  config they came from was already frozen by the explorer store.

## Tests

- `components/LightdashVisualization/VisualizationProvider.emissions.test.tsx`
  pins what each chart type reports through `onChartConfigChange`;
  `VisualizationProvider.renderCharacterization.test.tsx` pins render counts.
  Change behaviour on purpose, never to make them pass.
- Hook tests wrap `renderHook` with `withVisualizationStore()` from
  `src/testing/visualizationStore.tsx`; component tests mount
  `VisualizationStoreTestProvider` with `createVisualizationStore()`.
