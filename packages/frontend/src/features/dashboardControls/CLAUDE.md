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
  never reaches the bar. `addFirstField(field)` turns it into a filter control
  on every tile that offers the field (a metric makes a rule in
  `filters.metrics`); `addFirstSqlColumn(column, availableTileColumns)` turns
  it into a filter on a SQL column, on every SQL chart tile that has it, with
  the shipped `createDashboardFilterRuleFromSqlColumn`. Both are the
  sidebar's.
- `ADD_FILTER_CLICKED` (`mode: 'edit'`, the shipped payload) is tracked where
  a filter is created: `addFirstField`, `addFirstSqlColumn` and
  `addFirstFieldOnTile`. Opening a placeholder tracks nothing.
- `addFirstFieldOnTile(field, tileUuid)` is the tile cards': the same
  control, label carried over, on that tile only. Every other tile the filter
  would reach (all tabs) is left out with `setTileField(rule, tile, null)`.
- Adding from a tile links only that tile (first field, another field);
  adding from the sidebar applies to every tile it can.
  `openNew()` works while anything is being edited: it calls `close()` first,
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
- `close()`, `discard()` and `removeFilter()` clear the waiting fields and
  send focus back to the bar once the editor has left the page: to the
  control's pill when it is still there, else to "Add". The provider finds
  them in the DOM, as the pressed button nearest to "Add"
  (`aria-pressed="true"`) and as the shipped "Add filter" button
  (`[data-filter-actions] > button[data-dashboard-filter-control]`); keep both
  on the bar.
- `setHighlightedFieldId(id)` clicks a field; `clearHighlightedField()`
  unclicks it and drops that field's hover with it, so the tiles show
  everything again while the pointer is still on the row. Use it for every way
  out, never `setHighlightedFieldId(null)` from a row.

## Dismissing (`useEditorDismiss`)

- Escape is one capture listener on `document`, attached while the editor is
  open, so one press does one thing. In order: an open list, menu or popover
  (`aria-expanded="true"` on its target, or `data-expanded` on a Mantine
  combobox target) or a modal owns the press; an input
  marked `data-own-escape` owns it (nothing carries it today); a clicked field
  is unclicked;
  otherwise, with focus inside the editor (`data-controls-editor` on
  `EditorShell`), the focused input is blurred so its label commits and the
  editor closes as "Done" does. From the page, Escape never closes.
- A mouse down unclicks the field unless it lands inside `data-keeps-field`
  (the field rows, the tile cards) or inside a Mantine portal
  (lists and menus). That listener exists only while a field is clicked. It
  works on the tiles because their overlays stop no events.

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
  same editor mounted, so the pick calls `focusLabelInput()`, from the sidebar
  and from a tile card.
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
  - "Add a field" mounts it open (`defaultOpened`) and focuses it
    (`AddFieldSearch`) with the fields of exactly the target's type
    (`getFieldCandidates`, the shipped `matchFieldByType`) that are not rows
    yet and that some tile offers: metrics for a metric filter, dimensions
    otherwise. Another grain of a date the filter is on is offered. It is put
    away when its list closes (Escape, focus leaving, a pick); Escape hands
    focus back to the button.
  - Mantine marks the shipped picker's input `data-expanded`, which is how
    `useEditorDismiss` leaves Escape to its open list. Once the list is
    closed, Escape in the placeholder's search closes the editor like any
    other input.
  - Enter picks the option reached with the arrow keys; it does not pick the
    first match.
- A row is named by its field's own label (a grain says which one). A SQL
  column filter has one row, its column, counted over the SQL chart tiles that
  have the column; it takes no other field.

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
  filter's kind that some tile offers, and clicks the new field only when it
  landed on a tile.
- "Remove field" is switched off on a filter's only field: without it the
  filter could not be kept. Its tooltip points to "Remove filter" in More
  actions, or to "Discard control" for a new one.
- The clicked row shows an x, "Show all tiles" (`ShowAllTilesButton`), above
  the row's stretched click area like the other row actions.
- SQL chart tiles are mapped per tile with `isSqlColumn` targets
  (`toSqlColumnTarget`, columns from `useSqlColumnsByTile`) and are never
  fields of the filter.
- A data app tile takes the filter as a whole, as in the shipped popover: on
  with no entry, off with `false`, never a field. Its card has the line
  "Filtered" / "Not filtered" and a `Switch` in place of the select. While it
  is on it is `mapped`, and `other` once any field is active, since it is on
  no particular field. It counts as filtered in the tab and sidebar counts and
  never in a field's count; clearing or removing a field leaves it as it is.
- A tile mapped to a field or column it no longer offers
  (`getMissingTileFieldId`, the shipped invalid state) reads "Filtered by a
  field this tile no longer has" with a warning icon naming the id. Its select
  is empty, lists only what the tile does offer, and keeps the clear X. The
  tile is `available`, and it always gets a card so the mapping can be
  cleared. It still counts as filtered, as the shipped popover counts it
  selected. Nothing is called missing while the tile's fields are unknown.
- Counts (`getTabCounts`) use every tile on the tab or
  dashboard, not only the filterable ones.
- A tile's look answers two questions only: is it filtered by this control, and, if a field is active, is it on that field. Whether the tile
  could take the active field never changes the look. `data-highlighted` is:
  - `mapped`: on the control, and either no field is active or the tile is on
    the active one. A solid hairline in `--mantine-color-blue-5` over a faint
    blue wash.
  - `other`: on the control, but through another field than the active one.
    A dashed `blue-5` border with no fill.
  - `available`: reachable, but not on the control. A neutral dashed outline
    in `ldGray-4` with no fill.
  - no attribute: the control cannot reach the tile. No line.

  Blue on a tile always means the control filters it. "On the control" is a
  field or SQL column of the filter on the tile (`tileFieldId !== null`); a
  SQL chart tile on a column, or a data app tile that is on, is `other` while any field is active.
  A tile whose mapped field is missing is not on the control. The two blue
  layers are the
  `::before` (solid and wash) and `::after` (dashed) of the `.ring` child, and
  the grey outline is `.overlay::after`; all three only change `opacity`. The
  veil (`.overlay::before`) paints out the tile's own dashed edit border on
  every veiled tile, so the only line on a tile is one of these three. The
  highlighted sidebar row and the pill being edited use the same blue. No
  ink: `--mantine-primary-color-filled` reads too heavy here.
- Tiles are marked at rest too, so the marks alone never scroll, and neither
  does hover. The list passes `scrollFieldId` only to a `mapped` tile while
  the clicked field (`highlightedFieldId`) is the active one, which makes it a
  tile on that field, and `useScrollToHighlightedTile` scrolls the first
  `[data-highlighted='mapped']` tile into view when none of them is visible.
  A clicked field that is on no tile scrolls nothing.
- A waiting field's row carries `data-waiting` and a dashed border.
- The per-tile cards (`TileOverlay`) are memoised with `areTilePropsEqual`
  and read no context. The list component derives each
  tile's props, the highlight string included, and passes primitives, stable
  references and short lists compared by item, plus one stable `onSelect`.
  Keep it that way: an object built per render, or the rule itself, as a prop
  re-renders every tile on every edit.
- The select on a card is `LazySelect`: a button that looks like the closed
  select (same `aria-label`, `aria-haspopup="listbox"`) and mounts the Mantine
  `Select`, focused and open, on click, Enter, Space or an arrow key. Focus
  alone never opens the list (`openOnFocus={false}`), so clearing from the
  keyboard leaves it closed. The page scrolls as a whole, so Mantine's
  `hideDetached` never fires for a tile under the pinned bar: while its list
  is open, the select closes it on scroll once something else covers it.
- A card's dropdown has up to two groups: first the control's own fields that
  the tile offers, then the others the tile offers.

  | Situation | First group | Second group |
  | -- | -- | -- |
  | Filter control | "In this filter" | "Other fields on this tile" |
  | New control (placeholder) | "Fields on this tile" | none |

  `LazySelect` takes `groups` and drops the empty ones. Labels show only
  when two groups have entries: Mantine labels a lone group too, so one group
  is passed as a plain list with no label. The second group of a filter control is every other field the
  tile offers that the filter could take
  (`fieldCandidates.ts`, the rule "Add a field" in the sidebar uses: same
  kind, not already a row; the table label added where two entries read the
  same). Every time grain is an entry under its own label, as in the shipped
  field selects: another grain of a date the filter is on is offered. Entries
  are sorted by table, then by base date or field name, the grains of one
  date together in `sortTimeFrames` order with the base field first. Choosing one is the
  same write as any other choice, `setTileField` for this tile only, and by
  the model that is what adds the field to the filter. SQL chart tiles have no
  second group. The dropdown is searchable when the second group has entries
  or the first has more than 8.
- A placeholder shows the cards too, so a new control can start from a tile.
  A tile is reachable when it offers a filterable field; SQL chart tiles are
  not. A reachable tile is `available` with "Not filtered" and an empty
  select ("Select a field"); none is `mapped` or `other`. The list is the
  tile's fields of every kind (`getTileStarterFieldIds`: every grain an
  entry, sorted and labelled like the candidates), as one plain list.
  `TileOverlays` builds these per tile
  in one `useMemo` keyed on the dashboard, and names the select "New control
  on <tile>", so typing the label re-renders no card.
- A tile is reachable when it offers one of the filter's fields or a field it
  could add; the second kind shows the empty select and is `available`. A data
  app tile and a tile with a missing field are always reachable. Counts do not
  depend on reachability.
- The list component computes each tile's candidates in one `useMemo` keyed on
  the filter's field ids (joined), not on the rule, and passes them as
  `candidates`.
- The select has no "Not filtered" entry; the line above it says that. A tile
  the control leaves alone has an empty select with a placeholder ("Select a
  field", "Select a column" on a SQL chart tile). A chosen value has a clear
  button ("Leave this tile out") that reports `null`: `tileTargets[tileUuid] = false`.
  The clear button works on the stand-in button without mounting the `Select`,
  and it is a named tab stop, since it is the only way to clear.
- `TileOverlays` portals a veil and a "Filtered by" card into each
  `[data-tile-uuid]` grid item on the active tab. It resolves targets with
  `usePortalTargets`.
- A veiled tile is locked three ways, and none of them stops an event. Every
  overlay root (`TileOverlay`) carries the
  grid's `draggableCancel` class `non-draggable` (`LOCKED_TILE_CLASS`), so no
  drag starts on it, by mouse or touch. It carries `data-controls-overlay`,
  and `usePortalTargets(..., lockSiblings: true)` sets `inert` on every other
  child of the grid item, so the tile's own buttons are out of the tab order;
  it re-applies as the tile's DOM changes and removes exactly what it set when
  the editor closes, the tab changes or the list unmounts. A caller that locks
  must portal an overlay into every target it gets. The stylesheet's
  `pointer-events: none` on the siblings stays. Never call `stopPropagation`
  on an overlay: Mantine closes lists on a `mousedown` that reaches
  `document`, and the clicked field is cleared the same way.

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
  card). The editor's
  content arrives, not its panel, so the page never shows through. Closing is
  immediate.
- Tile cards arrive in one wave: `data-wave` is the tile's index modulo
  `WAVE_BUCKETS`, and the stylesheet maps it to 20ms delay steps.
- A row's press scales the name inside the button. A transform on the button
  would shrink its card-wide `::after` click area mid-click.
- Every animation and transition is switched off under
  `@media (prefers-reduced-motion: reduce)` at the end of its stylesheet.
- No new `:has()` selectors.
