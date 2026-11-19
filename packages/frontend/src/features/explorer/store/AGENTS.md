# Explorer store

The chart being built (`explorer`, `explorerSlice.ts`) and its undo history
(`history`, `history.ts`), behind one root reducer. Every mounted Explorer
creates its own store with `createExplorerStore`.

## How undo decides what a step is

The store stamps each action with its origin (`utils/changeOrigin.ts`): the
browser task it was dispatched in (its gesture) and whether it ran inside
`derived()`. `history.ts` reads only that stamp and the chart before and
after the action:

- A change to `unsavedChartVersion` or the staged palette by the user is a
  step. Everything dispatched in the same browser task joins that step, so a
  handler that dispatches three actions is undone as one.
- A change dispatched inside `derived()` folds into the chart: no step, and
  the redo stack survives.
- `reset`, `setSavedChart` and a changed table name start a new chart and
  clear the history.
- Undo and redo restore the chart together with `cachedChartConfigs` and
  `metadata`, then bump `history.revision`. `VisualizationCard` passes the
  revision to `VisualizationProvider`, which starts its editor over from the
  restored config.

## Rules

- **An effect that changes the chart dispatches inside `derived()`.** Seeding
  a default sort, applying default filters, replacing a custom metric,
  placing a dropped field once results arrive: none of these is the user's
  step. Dispatched bare from an effect, each one records a step on load, and
  when undo restores the state that triggers the effect it fires again and
  wipes the redo stack. `history.test.ts` and
  `VisualizationProvider.undo.test.tsx` fail on a load that records a step.
- **A user handler dispatches bare.** Never wrap a click or keyboard handler
  in `derived()`: its change could not be undone.
- **Chart state outside this store is not undoable.** While such state is in
  play, suspend the history with `explorerHistoryActions.setSuspended(true)`
  (merge queries do, from `components/Explorer/index.tsx`); steps recorded
  around it would restore a chart that points at something gone.
- **Server metadata goes through `setSavedChartMetadata`.** `setSavedChart`
  means a new saved version: it clears the history and the staged palette.
- **Undo is refused, not queued,** while a modal in `explorer.modals` is
  open, during chart type authoring and during a cost confirmation. A chart
  type authoring session is recorded as one step, or none if it is cancelled
  without other changes.
- **Selectors take `{ explorer }`.** They are typed to read the explorer
  alone, so tests can call them without building a history.
