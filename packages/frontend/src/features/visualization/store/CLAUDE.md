# Visualization store

Editor state for one mounted chart: what the `useXxxChartConfig` hooks used
to keep in `useState`, plus the cartesian intent the chart type gallery hands
to the next cartesian editor. `VisualizationProvider` creates the store with
`createVisualizationStore(buildInitialVisualizationState(chartConfig, seed))`
and mounts it on `VisualizationStoreContext`. A chart type switch creates a
new store seeded from the new type's config, carrying the cartesian intent.

## Rules

- **One slice per chart type, seeded by the provider.** Only the mounted
  type's slice is non-null; `selectXxxEditor` falls back to the type's
  defaults so selectors are total. Slices are never seeded from inside a
  hook or an effect.
- **Derive, don't write back.** Anything computed from the editor state and
  the inputs (results, items map, palette, the query being edited) is a
  `createSelector` in `xxxSelectors.ts` taking `(state, inputs)`. Repairs
  ("drop a group whose dimension is gone", "fall back to the first metric")
  are derivations, so a missing field never costs an extra emission or
  render. A derived list that equals the stored one must return the stored
  reference (`keepIfEqual` in `pieSelectors.ts`). Only when a repair must
  *generate* new editor state from the inputs (cartesian series) does it
  become a reducer handling one `inputsChanged`-style event.
- **Inputs come from context, never the store.** `useVisualizationInputs()`
  is the react-query results and provider props; it does not change on an
  edit. Select with `useVisualizationInputSelector(selector)` to get the
  inputs passed as the selector's second argument.
- **Consumers select what they show.** A config panel reads its fields with
  `useVisualizationSelector`/`useVisualizationInputSelector` and calls stable
  actions from `useXxxEditorActions()`. Only the chart body and the few
  consumers that need the whole thing read the aggregate through
  `useVisualizationConfig()`. Never read `visualizationConfig` to pick one
  field out of it.
- **Actions are events where there is a meaning, setters where the value is
  the event.** Toggles, list add/remove, override merges and axis patches are
  reducers. A typed field the user types into goes through the slice's `set`
  via `useEditorFieldSetter`. No consumer passes an updater function; call
  the reducer instead.
- **Debounce on the dispatch, in the control.** A text or colour input keeps
  a local draft and dispatches debounced (`useDebouncedCallback`), so the
  store is the only truth and `validConfig` never lags it.
- **Adapters are thin and memoised.** `VisualizationConfigXxx` calls the
  hook, emits `validConfig` through `onChartConfigChange` when it changes,
  and builds the aggregate. It reads inputs from context, not props, and
  is wrapped in `memo` so a resize or an echoed config does not run it.
- **Use the typed hooks, never plain `useSelector`/`useDispatch`.** The store
  lives on its own context so it can't shadow the explorer or dashboard store
  it is mounted inside.
- **`createSlice` is fine here.** Editor values are plain data; the chart
  config they came from was already frozen by the explorer store.

## Emission and the explorer

The adapter emits the derived `validConfig`; the provider forwards it unless
it equals the `chartConfig` prop's config, and re-forwards when the owner
resets that prop to something else, so an edit in progress wins over an
external reset (pinned). The explorer card follows the chart config only
through `ConnectedVisualizationProvider`, so the echo re-renders the
provider, whose contexts are memoised, and nothing below it.

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
  the provider does; component tests mount `VisualizationStoreTestProvider`.
