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
- `FieldsAndTiles` shows the inline `FieldPicker` for a placeholder and the
  filter's field once it has one. `FieldPicker` is one searchable dropdown with
  time grains folded into one row per field (`fieldGrains.ts`).
- `ControlsBar` carries the same `data-tour-*` anchors as `DashboardFiltersBar`;
  keep them in step when either changes.
