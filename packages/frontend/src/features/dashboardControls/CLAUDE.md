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

- `open(id)` snapshots the dashboard filters and edits a saved filter control.
- `openNew()` opens a placeholder with no mapping; it cannot be applied and
  never reaches the bar. `addFirstField(field)` turns it into a filter control.
- `updateFilter(rule)` writes to the dashboard context, so tiles preview live.
- `cancel()` restores the snapshot; `apply()` keeps the edits. Saving to the
  server stays with the dashboard's own Save. Pure helpers: `sidebarState.ts`.

## Editor

- `EditorShell` is the one chrome for the sidebar: title, subtitle, More actions
  menu, Cancel, an `aboveTabs` slot for the label, a tab strip (shown when there
  is more than one tab), body and a right-aligned footer. Add chrome there.
- `ControlSidebar` edits the control from `useControlsSidebar`. A placeholder is
  titled "New control" and cannot be applied until it has a field.
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
- Apply is blocked while `isDefaultValueIncomplete(rule)`; the inline error
  shows only after an Apply attempt.
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
- Highlight has two states on a tile, set as `data-highlighted`: `mapped`
  (the tile is on the active field: its dashed edit border becomes a solid
  hairline in `--mantine-color-blue-5` with a soft blurred glow of the same
  blue) and `available` (the tile offers the field but is on another one or on
  none: the dashed border at full strength). The highlighted sidebar row uses
  the same blue. No ink: `--mantine-primary-color-filled` reads too heavy here.
- A tab with a count badge keeps its natural width (`TabCounts.module.css`),
  so the tab strip scrolls instead of cutting the names.
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
