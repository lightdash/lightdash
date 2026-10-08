# Dashboard controls

Wording: a *control* is anything on the bar. A *filter control* narrows data
through fields; a *parameter control* sets parameter values. A parameter is
never called a filter. User-facing copy says *tile*, never *chart*.

- **Flag**: `FeatureFlags.DashboardControls` (`dashboard-controls`), read with
  `useServerFeatureFlag`. Flag off means the dashboard behaves as today.
- **Shipped components are imported, never edited.** Import from
  `features/dashboardFilters`, `features/parameters` and `features/dateZoom`.
- Saved data keeps today's `DashboardFilterRule` shape.

## Gated lines in shipped files

- `features/dashboardTabs/index.tsx` picks `ControlsBar` instead of
  `DashboardFiltersBar`.
- `pages/Dashboard.tsx` picks `ControlsSidebarPage` instead of `Page` and wraps
  the header in `DashboardHeaderGuard` (inert while the sidebar is open).

## Bar and page

- `ControlsSidebarPage` is a drop-in for `components/common/Page/Page`. It always
  passes `ControlSidebar` as the left sidebar and toggles only `isSidebarOpen`,
  so the dashboard grid never remounts.
- `ControlsBar` in edit mode renders `AddControl` ("Add") and `FilterPills`; in
  view mode the shipped `DashboardFilters`. `ParameterControlPills` follows in
  both modes. Parameters, date zoom and the requirements button are the shipped
  components.
- `FilterPills`: click opens the control, the X removes it and is hidden while
  the sidebar is open.

## Provider contract (`useControlsSidebar`)

- The context is a `use-context-selector` context, like the dashboard's.
  `useControlsSidebarSelector((c) => c.x)` re-renders its component's subtree
  only when the selected value changes; use it in anything rendered per tile,
  per pill or around the whole page. `useControlsSidebar()` returns the whole
  value and re-renders on every change, hover included. A selector must return
  a value that is stable for the same state (no new object or array).
- Every callback in the value keeps one identity for the provider's life. They
  read state through the `latest` ref in `ControlsSidebarProvider`, which is
  synced after each render and written eagerly by the `write*` helpers, so two
  calls in one event (`updateFilter` with a label, then `close`) agree. A new
  callback reads `latest.current`, never render state, and writes through the
  helpers.
- `open(id)` snapshots the dashboard filters and edits a saved filter control.
- `openNew()` opens a placeholder with no mapping; it cannot be kept and
  never reaches the bar. `addFirstField(field)` turns it into a filter control.
- `updateFilter(rule)` writes to the dashboard context, so tiles preview live.
- `close()` keeps the edits: they already live in the dashboard draft. It
  discards instead when the control cannot be kept (`canKeepFilterRule`: no
  field, or new with no label; a new parameter control with no label), and it
  turns off a default value that was switched on but left empty.
- `discard()` restores the snapshot taken when the control was opened. Saving
  to the server stays with the dashboard's own Save. Pure helpers:
  `sidebarState.ts`.

## Editor

- `EditorShell` is the one chrome for the sidebar: title, subtitle, More actions
  menu, a Close X, an `aboveTabs` slot for the label, a tab strip (shown when
  there is more than one tab), body and a footer. The X and "Done" both call
  `close`; the quiet discard action ("Discard control" for a new one, "Discard
  changes" once an existing one has changed) calls `discard`. The footer status
  says what closing would drop. Add chrome there.
- `ControlSidebar` edits the control from `useControlsSidebar`. A placeholder is
  titled "New control" and cannot be kept until it has a field.
- The label is a local draft (`useLabelDraft`): the title, footer status and
  label error follow the draft, and the control gets it after 300ms without
  typing, on blur, on Enter and from a suggestion chip. Blur commits
  synchronously, which is what lets "Done", the X and "Discard" see it. The
  editor body is mounted with the control id as `key`, so the draft restarts
  and a pending commit is dropped when another control opens.
- `FieldsAndTiles` shows the inline `FieldPicker` for a placeholder, and
  otherwise one `FieldRow` per field of the filter plus "Add a field". `FieldPicker` is one searchable dropdown with
  time grains folded into one row per field (`fieldGrains.ts`).
- `ControlsBar` carries the same `data-tour-*` anchors as `DashboardFiltersBar`;
  keep them in step when either changes.

## Settings

- `FilterSettings` renders two cards: "Default value" (`FilterValueSettings`)
  and "Viewer controls" (`ViewerControls`).
- This layer only exposes what a dashboard can already save: `disabled` and the
  rule's values as the default, `required` and `requiredGroupId`, and
  `lockedTabUuids` (the dashboard uuid is the key when there are no tabs).
- Settings is disabled for a placeholder ("Pick a field first"). The tab id
  stays `settings`.
- Nothing blocks closing. While `isDefaultValueIncomplete(rule)` a hint says
  the default is left off, and `close()` writes `disabled: true`.
- `FilterPills` carries the shipped lock toggle (`lockSlot` / `lockSlotActive`),
  hidden while the sidebar is open.

## Fields and tiles

A filter control can hold several fields, on today's saved shape (`peers.ts`):

- The first field is the rule's `target`.
- Another field on a tile is `tileTargets[tileUuid] = { fieldId, tableName }`.
- A tile left out is `tileTargets[tileUuid] = false`.
- A tile uses exactly one field of the filter, and a field belongs to a filter
  only through a tile mapping (`getFilterFields`).
- A field on no tile cannot be saved, so it *waits*: `waitingFieldIds` in the
  provider lists fields added with "Add a field" when every tile they fit
  already had one, and fields that lost their last tile. They show at
  "0 of N tiles", every tile card that could take them offers them, and they
  are gone when the sidebar closes. "Add a field" offers any field of the
  filter's kind that some tile offers.
- SQL chart tiles are mapped per tile with `isSqlColumn` targets
  (`toSqlColumnTarget`, columns from `useSqlColumnsByTile`) and are never
  fields of the filter.
- Counts (`getTabCounts`, `getTabCountsForField`) use every tile on the tab or
  dashboard, not only the filterable ones.
- Highlight has three states on a tile, set as `data-highlighted`. While a
  field is active: `mapped` (the tile is on the active field: its dashed edit
  border becomes a solid hairline in `--mantine-color-blue-5` with a soft
  blurred glow of the same blue) and `available` (the tile offers the field
  but is on another one or on none: the dashed border at full strength over a
  faint free-slot wash). While no field is active: `reached` (the control
  reaches the tile: a filter has a field or SQL column on it, a parameter
  control sets a parameter on it). A tile the control cannot reach never gets
  the attribute. Only `mapped` and `available` are scroll targets
  (`useScrollToHighlightedTile`). The
  hairline lives on the `.ring` child, the glow on `.ring::after` (so `reached`
  is the hairline alone and `mapped` adds the glow) and the dashed border on
  `.overlay::after`; all three only change `opacity`. The highlighted sidebar row
  and the pill being edited use the same blue. No ink:
  `--mantine-primary-color-filled` reads too heavy here.
- A waiting field's row carries `data-waiting` and a dashed border.
- A tab with a count badge keeps its natural width (`TabCounts.module.css`),
  so the tab strip scrolls instead of cutting the names.
- The per-tile cards (`TileOverlay`, `ParameterOverlay`) are memoised with
  `areTilePropsEqual` and read no context. The list component derives each
  tile's props, the highlight string included, and passes primitives, stable
  references and short lists compared by item, plus one stable `onSelect`.
  Keep it that way: an object built per render, or the rule itself, as a prop
  re-renders every tile on every edit.
- The select on a card is `LazySelect`: a button that looks like the closed
  select (same `aria-label`, `aria-haspopup="listbox"`) and mounts the Mantine
  `Select`, focused and open, on click, Enter, Space or an arrow key.
- `TileOverlays` portals a veil and a "Filtered by" card into each
  `[data-tile-uuid]` grid item on the active tab; `TabCounts` portals an
  "x of N" badge into each tab node. Both resolve targets with
  `usePortalTargets` and render nothing for a placeholder.

## Parameter controls

- Saved with the dashboard as `parameterControls: DashboardParameterControl[]`:
  `{ id, label, parameterKeys, tileTargets }`. Per tile: no entry means the
  control sets every one of its parameters the tile uses, a key means only that
  one, `false` switches the tile off (it runs on its chart value or the default).
- Values are not on the control. They stay in the dashboard's parameters, one
  per key; a control writes the same value to every key it holds.
- A parameter in no control keeps the shipped input, and nothing is created
  automatically. `ControlsBar` passes the shipped `Parameters` only the
  definitions outside `getControlledParameterKeys`, so each shows once.
- Chart tiles preview unsaved controls because the query request carries them.
  SQL chart tiles follow the saved controls only.
- `ParameterControlPills`: edit mode opens the control and offers the X; view
  mode opens the shipped `ParameterInput` and sets every key. On a tab, a pill
  shows when the control sets a tile there, is being edited, or no tile on the
  tab has reported its parameters yet.
- `ParameterOverlays` portals a "Set by" card into each tile on the active tab,
  with the value the tile runs with and its source (`parameterSources.ts`).
  `TabCounts` counts with `getControlTabCounts`. Pure helpers:
  `parameterControls.ts`.
- Additive edits in shipped files: `DashboardProvider` holds `parameterControls`,
  `setParameterControls`, `resetParameterControls`,
  `haveParameterControlsChanged` and `tileChartSavedParameters`;
  `pages/Dashboard.tsx` loads, resets and sends the controls only when changed;
  `useDashboardChartReadyQuery.ts` keys on the tile's narrowed values and sends
  the controls with the query.

## Link prompts

- `LinkPrompts` portals a veil and a card into a chart tile added while
  editing, when a filter control could reach it through a field other than
  the filter's own target (`getLinkCandidates`). A tile with the target field
  links on its own and SQL chart tiles never prompt.
- "New" is derived: `newTileUuids` is the dashboard's tiles that are not in the
  saved dashboard. There is no snapshot state.
- Link writes `tileTargets[tileUuid]` on the rule (`setTileField`), which ends
  the prompt. Skip is `dismissLink`; skips live in the provider until edit mode
  ends.
- Rendered only in edit mode while the sidebar is closed, so it never stacks
  on `TileOverlays`.

## Motion

Values are the homepage builder's (`ee/features/homepageBuilder/HomepageEditor.module.css`),
restated, never imported. Each stylesheet declares the ones it uses once, as
custom properties on its root class:

- `--controls-duration-hover: 0.12s` and `--controls-duration-state: 0.15s`,
  both with `--controls-ease: ease-in-out`.
- `--controls-duration-arrive: 0.28s` with
  `--controls-ease-arrive: cubic-bezier(0.22, 1, 0.36, 1)`, from transparent
  and `translateY(-6px) scale(0.98)` (the editor uses `translateX(-6px)`, the
  footer status `translateY(4px)`).
- Press is `scale(0.98)` on a row's name and `scale(0.97)` on "Done".

Rules:

- Animate `opacity` and `transform` only. Never width, height, margin,
  position or `box-shadow`: these run once per tile. A shadow that has to
  appear sits on its own layer and that layer's opacity changes.
- No React state, effects, refs, timers or context for motion. Things arrive
  with a mount animation; a replay is a `key` on a small leaf element (the
  count in a sidebar row, the footer status, the `.confirm` line on a tile
  card). Tab badges do not replay: they change on every hover. The editor's
  content arrives, not its panel, so the page never shows through. Closing is
  immediate.
- Tile cards arrive in one wave: `data-wave` is the tile's index modulo
  `WAVE_BUCKETS`, and the stylesheet maps it to 20ms delay steps.
- A row's press scales the name inside the button. A transform on the button
  would shrink its card-wide `::after` click area mid-click.
- Every animation and transition is switched off under
  `@media (prefers-reduced-motion: reduce)` at the end of its stylesheet.
- No new `:has()` selectors.
