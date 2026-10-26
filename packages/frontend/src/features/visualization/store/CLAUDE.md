# Visualization store

Editor state for one mounted chart: what the `useXxxChartConfig` hooks used
to keep in `useState`, plus the cartesian intent the chart type gallery hands
to the next cartesian editor. `VisualizationProvider` creates the store with
`createVisualizationStore(buildInitialVisualizationState(chartConfig, seed))`
and mounts it on `VisualizationStoreContext`. A chart type switch creates a
new store seeded from the new type's config, carrying the cartesian intent;
so does a custom spec arriving while the custom editor has none
(`isFirstCustomSpec`), and, when there is no config owner
(`onChartConfigChange` undefined), a `chartConfig` prop that changes by
value, since the prop is then the only truth (a dashboard tile refetch).

## Rules

- **One slice per chart type, seeded by the provider.** Every slice starts
  at its type's defaults and the provider seeds only the mounted type, so
  slices are never null. Slices are never seeded from inside a
  hook or an effect. The one exception is data app viz: the gallery switches
  the viz without changing the chart type, so its hook dispatches
  `externalConfigReceived` when the owner's viz uuid or version changes.
- **Derive, don't write back.** Anything computed from the editor state and
  the inputs (results, items map, palette, the query being edited) is a
  `createSelector` in `xxxSelectors.ts` taking `(state, inputs)`. Repairs
  ("drop a group whose dimension is gone", "fall back to the first metric")
  are derivations, so a missing field never costs an extra emission or
  render. A derived list that equals the stored one must return the stored
  reference (`keepIfEqual` in `inputSelectors.ts`, which also holds the
  shared `inputs*` accessors and field pools). Only when a repair must
  *generate* new editor state from the inputs (cartesian series) does it
  become a reducer handling one `inputsChanged`-style event.
- **Inputs come from context, never the store.** `useVisualizationInputs()`
  is the react-query results and provider props; it does not change on an
  edit. Select with `useVisualizationInputSelector(selector)` to get the
  inputs passed as the selector's second argument. An action that needs them
  at call time reads `getInputs()` from `useVisualizationServices()`, so it
  stays stable.
- **Consumers select what they show.** A config panel reads its fields with
  `useVisualizationSelector`/`useVisualizationInputSelector` and calls stable
  actions from `useXxxEditorActions()`. Only the chart body and the few
  consumers that need the whole thing read the aggregate through
  `useVisualizationConfig()`. Never read `visualizationConfig` to pick one
  field out of it.
- **Actions are events where there is a meaning, setters where the value is
  the event.** Toggles, list add/remove, override merges and axis patches are
  reducers. A typed field the user types into goes through the slice's `set`
  via `useEditorFieldSetter`, which takes a value, never an updater; an edit
  that depends on the current value is a reducer.
- **Table calculation renames are an event.** The provider dispatches
  `tableCalculationsRenamed` when the explorer's metadata changes, minus any
  rename whose old name is in the edited query again (a new field took the
  name); a slice that stores a field id rewrites it with `renamedFieldId` in
  `extraReducers`, never in a selector. Cartesian is the exception: its
  layout repair (`inputsChanged`) applies the renames. Gauge, map and table
  don't handle it.
- **Commit per control.** Most inputs dispatch on every change. The few
  debounced ones use `useDebouncedDraft`, which flushes on blur so the next
  click sees the edit. Its unmount flush cannot save an edit on a chart type
  switch: it lands in the store being discarded. Legend area width, the
  tooltip, the custom vis spec and the map field label call
  `useDebouncedCallback` directly, because they keep the user's text when the
  commit is skipped or transformed and the draft would hand back the store
  value.
- **Adapters are thin and memoised.** `VisualizationConfigXxx` calls the
  hook, emits `validConfig` with `useEmitChartConfig` when it changes,
  and builds the aggregate. It reads inputs from context, not props, and
  is wrapped in `memo` so a resize skips it. Its emit callback is stable; an
  echoed config still re-renders it (its children change), and the
  memoised aggregate and contexts are what spare the consumers. Data app viz
  emits from its setters instead, since its edits are discrete commands.
- **Use the typed hooks, never plain `useSelector`/`useDispatch`.** The store
  lives on its own context so it can't shadow the explorer or dashboard store
  it is mounted inside.
- **`createSlice` is fine here.** Editor values are plain data; the chart
  config they came from was already frozen by the explorer store.

## Emission and the explorer

The adapter emits the derived `validConfig`; the provider forwards it unless
it equals the `chartConfig` prop's config. A provider effect keyed on the
prop re-forwards the last emitted config when the owner resets the prop to
something else, so an edit in progress wins over an external reset
(pinned). The explorer card follows the chart config only
through `ConnectedVisualizationProvider`, so the echo re-renders the
provider and the adapter; the memoised aggregate and contexts keep the
consumers below from re-rendering.

## Tests

- `components/LightdashVisualization/VisualizationProvider.emissions.test.tsx`
  pins what each chart type reports through `onChartConfigChange`. Fewer
  emissions with the same final payload is the expected result of moving a
  repair into a selector; regenerate with `UPDATE_EMISSIONS=1` and review
  the diff of the `.jsonl`.
- `VisualizationProvider.renderBenchmark.test.tsx` pins renders per
  consumer per edit for cartesian, pie and table. `RENDER_BENCHMARK_OUT=<file>`
  writes the numbers. A rise is a regression; a drop is re-pinned on purpose.
- `VisualizationProvider.renderCharacterization.test.tsx` pins the
  feedback-loop behaviour and the isolation between providers.
- Hook tests wrap `renderHook` with `withVisualizationStore(chartConfig)`
  from `src/testing/visualizationStore.tsx`, which seeds the store the way
  the provider does (pass `{ hasConfigOwner: true }` to seed as an owned
  chart); component tests mount `VisualizationStoreTestProvider`.
