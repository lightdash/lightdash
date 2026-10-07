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
  view mode the shipped `DashboardFilters`. Parameters, date zoom and the
  requirements button are the shipped components.
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
