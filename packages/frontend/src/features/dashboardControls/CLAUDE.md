# Dashboard controls

Wording: a *control* is a *filter control* on the bar: it narrows data through
fields. User-facing copy says *tile*, never *chart*.

- **Flag**: `FeatureFlags.DashboardControls` (`dashboard-controls`), read with
  `useServerFeatureFlag`. Flag off means the dashboard behaves as today.
- **Shipped components are imported, not restated.** Import from
  `features/dashboardFilters`, `features/parameters` and `features/dateZoom`.
  A shipped file is edited only by a pure move into an exported piece, or by
  an optional prop whose default is today's behaviour; see "Openings in
  shipped files".
- Saved data keeps today's `DashboardFilterRule` shape.

## Gated lines in shipped files

- `features/dashboardTabs/index.tsx` picks `ControlsBar` instead of
  `DashboardFiltersBar`.
- `pages/Dashboard.tsx` picks `ControlsSidebarPage` instead of `Page` and wraps
  the header in `DashboardHeaderGuard` (inert while the sidebar is open).

## Openings in shipped files

Each is a pure move or an optional prop that defaults to today's behaviour.
All are in `features/dashboardFilters/`.

- `DashboardFiltersBar`: `filterArea`, which replaces the shipped filters and
  the requirements button (default: both, as today).
- `ActiveFilters/`: `FilterRuleLabel`, `TemporaryFilters`, `UnresolvedFilter`,
  `useFilterTabPlacement`, `filterLabels`, `filterLock` and `filterOrder`,
  moved out of `index.tsx` and `Filter.tsx`.

In `FilterConfiguration/`:

- `FilterSettings`: `hideLabel`, `hideRequiredCard` (both default false).
- `FilterFieldSelect`: `defaultOpened` (default false).
- `SqlColumnSelect`: the "Select a column to filter" select, moved out of
  `index.tsx`.
- `utils`: `getDefaultField`, `getUniqueSqlColumns`,
  `getSqlColumnFilterType` and `getFilterRuleWithDisabledState`, moved out of
  `index.tsx`.

## Bar and page

- `ControlsSidebarPage` is a drop-in for `components/common/Page/Page`. It always
  passes `ControlSidebar` as the left sidebar and toggles only `isSidebarOpen`,
  so the dashboard grid never remounts.
- `ControlsBar` is the shipped `DashboardFiltersBar` with its one opening,
  `filterArea`: the slot that replaces `DashboardFilters` and the requirements
  button. In edit mode it holds `AddControl`, `FilterPills` and the shipped
  requirements button (hidden while the sidebar is open); in view mode nothing
  is passed, so the bar is the shipped one. Separators, parameters, date zoom,
  the hide button, the compact drawer and the `data-tour-*` anchors are the
  shipped bar's own.
- `AddControl` is the shipped `AddFilterButton` in edit mode: the dashed
  button with its disabled and loading states and the eye that hides
  "Add filter" from viewers (usable while the sidebar is open). It is never
  given a popover id to open on, so a click only calls `onPopoverOpen`, which
  is `openNew`. It tracks nothing; `ADD_FILTER_CLICKED` stays with the
  provider. The provider returns focus to it by
  `[data-filter-actions] > button[data-dashboard-filter-control]`.
- `FilterPills`: click opens the control, the X removes it and is hidden while
  the sidebar is open. Dimension rules and metric rules are two dnd-kit
  contexts, reordered within their own list (the shipped `moveFilterRule`);
  dragging and the grip are off while the sidebar is open.
- One saved rule is one `FilterPill` (memoised; pass it primitives, the rule
  and the field). Only its button is the feature's (click opens the editor,
  `aria-pressed`, the selected and draft looks). Everything else is extracted
  from the shipped pill, in `dashboardFilters/ActiveFilters`, and called from
  both sides:
  - `FilterRuleLabel`: name, "is any value", two values then "+N", the tables
    tooltip (off on the pill being edited).
  - `useFilterTabPlacement` and `isFilterHiddenOnTab`: the tabs a rule is on,
    hidden on this tab, the "not applied" state and its tooltip. The pill
    being edited shows on every tab.
  - `filterLabels.ts`, `filterOrder.ts`: the label rules and the reorder.
- A rule whose field cannot be resolved renders the shipped `UnresolvedFilter`
  (invalid or locked) and opens no editor. Nothing is called unresolved while
  the fields load, or for a placeholder.
- `TemporaryFilterPills` renders the shipped `TemporaryFilters` after the saved
  pills, inside the shipped `FiltersProvider` its popover needs: outline pill,
  its own popover and an X. They are never opened in the sidebar.

## Provider contract (`useControlsSidebar`)

- The context is a `use-context-selector` context, like the dashboard's.
  `useControlsSidebarSelector((c) => c.x)` re-renders its component's subtree
  only when the selected value changes; use it in anything rendered
  per pill or around the whole page. `useControlsSidebar()` returns the whole
  value and re-renders on every change. A selector must return
  a value that is stable for the same state (no new object or array).
- Every callback in the value keeps one identity for the provider's life. They
  read state through the `latest` ref in `ControlsSidebarProvider`, which is
  synced after each render and written eagerly by the `write*` helpers, so two
  calls in one event (`updateFilter` with a label, then `close`) agree. A new
  callback reads `latest.current`, never render state, and writes through the
  helpers.
- `open(id)` snapshots the dashboard filters and edits a saved filter control.
- `openNew()` opens a placeholder with no mapping; it cannot be kept and
  never reaches the bar. `addFirstField(field)` turns it into a filter control
  on every tile that offers the field (a metric makes a rule in
  `filters.metrics`); `addFirstSqlColumn(column, availableTileColumns)` turns
  it into a filter on a SQL column, on every SQL chart tile that has it, with
  the shipped `createDashboardFilterRuleFromSqlColumn`. Both are the
  sidebar's.
- `ADD_FILTER_CLICKED` (`mode: 'edit'`, the shipped payload) is tracked where
  a filter is created: `addFirstField` and `addFirstSqlColumn`.
  Opening a placeholder tracks nothing.
- `openNew()` works while anything is being edited: it calls `close()` first,
  then opens the placeholder with a snapshot taken after that close. On a new
  control with no field yet it does nothing, whether or not a label was typed.
- `open(id)` works while a new control is being edited: the new control is
  closed first, as "Done" would (kept when it has a field, dropped
  otherwise), then the other one opens.
- `updateFilter(rule)` writes to the dashboard context, so tiles preview live.
- `close()` keeps the edits: they already live in the dashboard draft. It
  discards instead when the control cannot be kept (`canKeepFilterRule`: no
  field).
- A label is optional. A filter with none shows its field's name, as the
  shipped bar does.
- `discard()` restores the snapshot taken when the control was opened. Saving
  to the server stays with the dashboard's own Save. Pure helpers:
  `sidebarState.ts`.
- `close()`, `discard()` and `removeFilter()`
  send focus back to the bar once the editor has left the page: to the
  control's pill when it is still there, else to "Add". The provider finds
  them in the DOM, as the pressed button nearest to "Add"
  (`aria-pressed="true"`) and as the shipped "Add filter" button
  (`[data-filter-actions] > button[data-dashboard-filter-control]`); keep both
  on the bar.

## Dismissing (`useEditorDismiss`)

- Escape is one capture listener on `document`, attached while the editor is
  open, so one press does one thing. In order: an open list, menu or popover
  (`aria-expanded="true"` on its target, or `data-expanded` on a Mantine
  combobox target) or a modal owns the press; an input
  marked `data-own-escape` owns it (nothing carries it today);
  otherwise, with focus inside the editor (`data-controls-editor` on
  `EditorShell`), the focused input is blurred so its label commits and the
  editor closes as "Done" does. From the page, Escape never closes.

## Editor

- `EditorShell` is the one chrome for the sidebar: title, subtitle, More actions
  menu, a Close X, an `aboveTabs` slot for the label,
  body and a footer. The X and "Done" both call
  `close`; the quiet discard action ("Discard control" for a new one, "Discard
  changes" once an existing one has changed) calls `discard`. The footer status
  says what closing would drop. Add chrome there.
- `ControlSidebar` edits the control from `useControlsSidebar`. A placeholder is
  titled "New control" and cannot be kept until it has a field. Any other
  control is titled by its label, or by its field's name while it has none.
- The label is a local draft (`useLabelDraft`): the title follows the draft,
  and the control gets it after 300ms without typing, on blur, on Enter and
  from a suggestion chip. Enter commits and the editor stays open. A label of
  spaces is written as no label. The placeholder is the name the control goes
  by when the label is empty. Blur commits synchronously, which is what lets
  "Done", the X, Escape and "Discard" see it. The editor body is mounted with
  the control id as `key`, so the draft restarts and a pending commit is
  dropped when another control opens.
- Focus: the label input has `autoFocus`, so it takes focus whenever the keyed
  editor mounts (from a pill, from "Add", on a switch). The first field of a
  filter keeps the
  same editor mounted, so the pick calls `focusLabelInput()`.
- The edited filter's field is resolved as the shipped bar does
  (`useFilterRuleField`, over the shipped `useDashboardFilterField`:
  dimensions and metrics, with the labels of the tile it is mapped on). A SQL
  column filter (`target.isSqlColumn`) has no field: it goes by its column
  name.
- `useSqlColumnsByTile` offers every filter every column of every SQL chart
  tile, whatever the types, as the shipped popover does
  (`TileFilterConfiguration`). A placeholder gets none.
- Field search is the shipped `FilterFieldSelect`, never a picker of our own:
  every time grain is a field, fields of the current tab come first, grouped
  by table. `FieldsAndTiles` feeds it what the shipped "Add filter" does:
  dimensions, plus metrics under `FeatureFlags.MetricDashboardFilters`.
  - A placeholder shows it inline. When no tile has fields it shows the
    shipped "Select a column to filter" select instead (`SqlColumnSelect`).
  - The shipped picker sets `aria-expanded` on its input, which is how
    `useEditorDismiss` leaves Escape to its open list. Once the list is
    closed, Escape in the placeholder's search closes the editor like any
    other input.
  - Enter picks the option reached with the arrow keys; it does not pick the
    first match.

## Fields and tiles

A filter control can hold several fields, on today's saved shape (`peers.ts`):

- The first field is the rule's `target`.
- Another field on a tile is `tileTargets[tileUuid] = { fieldId, tableName }`.
- A tile left out is `tileTargets[tileUuid] = false`.
- A tile uses exactly one field of the filter, and a field belongs to a filter
  only through a tile mapping (`getFilterFields`).
- SQL chart tiles are mapped per tile with `isSqlColumn` targets
  (columns from `useSqlColumnsByTile`) and are never
  fields of the filter.
- A data app tile takes the filter as a whole, as in the shipped popover: on
  with no entry, off with `false`, never a field.
  It counts as filtered in the tab and sidebar counts.
- Counts (`getTabCounts`) use every tile on the tab or
  dashboard, not only the filterable ones.

## Motion

Values are the homepage builder's (`ee/features/homepageBuilder/HomepageEditor.module.css`),
restated, never imported. Each stylesheet declares the ones it uses once, as
custom properties on its root class:

- `--controls-duration-hover: 0.12s`
  with `--controls-ease: ease-in-out`.
- `--controls-duration-arrive: 0.28s` with
  `--controls-ease-arrive: cubic-bezier(0.22, 1, 0.36, 1)`, from transparent
  (the editor uses `translateX(-6px)`, the
  footer status `translateY(4px)`).
- Press is `scale(0.97)` on "Done".

Rules:

- Animate `opacity` and `transform` only. Never width, height, margin,
  position or `box-shadow`: these run once per tile. A shadow that has to
  appear sits on its own layer and that layer's opacity changes.
- No React state, effects, refs, timers or context for motion. Things arrive
  with a mount animation; a replay is a `key` on a small leaf element (the
  footer status). The editor's
  content arrives, not its panel, so the page never shows through. Closing is
  immediate.
- Every animation and transition is switched off under
  `@media (prefers-reduced-motion: reduce)` at the end of its stylesheet.
- No new `:has()` selectors.
