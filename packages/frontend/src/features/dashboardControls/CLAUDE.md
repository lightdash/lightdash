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
- `ControlsBar` in edit mode renders `AddControl` ("Add"), the eye that hides
  "Add filter" from viewers (`isAddFilterDisabled`, usable while the sidebar is
  open) and `FilterPills`; in view mode the shipped `DashboardFilters`.
  `ParameterControlPills` follows in both modes. Parameters, date zoom and the
  requirements button are the shipped components.
- `AddControl` is disabled or loading on the shipped "Add filter" conditions
  and tracks `ADD_FILTER_CLICKED` on click.
- `FilterPills`: click opens the control, the X removes it and is hidden while
  the sidebar is open. Dimension rules and metric rules are two dnd-kit
  contexts, reordered within their own list (`moveFilterRule`); dragging and
  the grip are off while the sidebar is open.
- One saved rule is one `FilterPill` (memoised; pass it primitives, the rule
  and the field). Its name, value text ("is any value", two values then "+N"),
  required asterisk and "not applied" state follow the shipped pill through
  the shipped helpers; the decisions with no shipped export are restated in
  `pillState.ts` (`getFilterPillPlacement`, `getFilterPillLabels`).
- A rule whose field cannot be resolved renders the shipped `InvalidFilter` or
  `LockedFilter` and opens no editor. Nothing is called unresolved while the
  fields load, or for a placeholder.
- `TemporaryFilterPills` renders `dashboardTemporaryFilters` after the saved
  pills with the shipped `Filter` (`isTemporary`): outline pill, its own
  popover and an X. They are never opened in the sidebar.
- `ParameterControlPills`: for a viewer, a control on one parameter is the
  shipped `Parameter` pill under the control's label. Every other case is the
  control pill, which carries the shipped states itself (required outline,
  description tooltip, reserved-name warning, out-of-range value as unset, and
  a clear X in view mode).

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
  the shipped `createDashboardFilterRuleFromSqlColumn`;
  `addParameterControl(key)` turns it into a parameter control on every tile
  that uses the parameter. All three are the sidebar's.
- `ADD_FILTER_CLICKED` (`mode: 'edit'`, the shipped payload) is tracked where
  a filter is created: `addFirstField`, `addFirstSqlColumn` and
  `addFirstFieldOnTile`. Opening a placeholder and creating a parameter
  control track nothing.
- `addFirstFieldOnTile(field, tileUuid)` and
  `addParameterControlOnTile(key, tileUuid)` are the tile cards': the same
  control, label carried over, on that tile only. Every other tile the filter
  would reach (all tabs) is left out with `setTileField(rule, tile, null)`;
  every other tile in `tileParameterReferences` that uses the key gets
  `false`. A tile that has not reported its parameters yet is not in that map
  and cannot be switched off.
- Adding from a tile links only that tile (first field, another field, a
  parameter); adding from the sidebar applies to every tile it can.
  `openNew()` works while anything is being edited: it calls `close()` first,
  then opens the placeholder with a snapshot taken after that close. On a new
  control with no field yet it does nothing, whether or not a label was typed.
- `open(id)` and `openControl(id)` work while a new control is being edited:
  the new control is closed first, as "Done" would (kept when it has a field
  or a parameter, dropped otherwise), then the other one opens.
- `updateFilter(rule)` writes to the dashboard context, so tiles preview live.
- `close()` keeps the edits: they already live in the dashboard draft. It
  discards instead when the control cannot be kept (`canKeepFilterRule`: no
  field), and it turns off a default value that was switched on but left
  empty.
- A label is optional. A filter with none shows its field's name, as the
  shipped bar does. A parameter control's saved `label` is a required string,
  so the provider fills an empty one with its first parameter's name
  (`getParameterLabel`) whenever the control is left: on `close()`, and when
  `open`, `openControl` or `openNew` moves away from it. While it is edited
  the label stays empty, so the input shows that name as its placeholder.
- `discard()` restores the snapshot taken when the control was opened. Saving
  to the server stays with the dashboard's own Save. Pure helpers:
  `sidebarState.ts`.
- `close()`, `discard()`, `removeFilter()` and `removeControl()` clear the
  waiting fields and send focus back to the bar once the editor has left the
  page: to the control's pill when it is still there, else to "Add". The
  provider finds them in the DOM, as the pressed button nearest to "Add"
  (`aria-pressed="true"`) and by the accessible name "Add filter or
  parameter"; keep both on the bar.
- `setHighlightedFieldId(id)` clicks a field; `clearHighlightedField()`
  unclicks it and drops that field's hover with it, so the tiles show
  everything again while the pointer is still on the row. Use it for every way
  out, never `setHighlightedFieldId(null)` from a row.

## Dismissing (`useEditorDismiss`)

- Escape is one capture listener on `document`, attached while the editor is
  open, so one press does one thing. In order: an open list, menu or popover
  (`aria-expanded="true"` on its target) or a modal owns the press; an input
  marked `data-own-escape` owns it (the "Add a field" and "Add a parameter"
  searches, through `useCollapsibleSearch`); a clicked field is unclicked;
  otherwise, with focus inside the editor (`data-controls-editor` on
  `EditorShell`), the focused input is blurred so its label commits and the
  editor closes as "Done" does. From the page, Escape never closes.
- A mouse down unclicks the field unless it lands inside `data-keeps-field`
  (the field and parameter rows, the tile cards) or inside a Mantine portal
  (lists and menus). That listener exists only while a field is clicked. It
  works on the tiles because their overlays stop no events.
- `useCollapsibleSearch` puts a search away when its list closes on an empty
  search, when focus leaves it, and on Escape once the list is closed. Enter
  picks the first match (`selectFirstOptionOnChange`).

## Editor

- `EditorShell` is the one chrome for the sidebar: title, subtitle, More actions
  menu, a Close X, an `aboveTabs` slot for the label, a tab strip (shown when
  there is more than one tab), body and a footer. The X and "Done" both call
  `close`; the quiet discard action ("Discard control" for a new one, "Discard
  changes" once an existing one has changed) calls `discard`. The footer status
  says what closing would drop. Add chrome there.
- `ControlSidebar` edits the control from `useControlsSidebar`. A placeholder is
  titled "New control" and cannot be kept until it has a field. Any other
  control is titled by its label, or by its field's or first parameter's name
  while it has none.
- The label is a local draft (`useLabelDraft`): the title follows the draft,
  and the control gets it after 300ms without typing, on blur, on Enter and
  from a suggestion chip. Enter commits and the editor stays open. A label of
  spaces is written as no label. The placeholder is the name the control goes
  by when the label is empty. Blur commits synchronously, which is what lets
  "Done", the X, Escape and "Discard" see it. The editor body is mounted with
  the control id as `key`, so the draft restarts and a pending commit is
  dropped when another control opens.
- Focus: the label input has `autoFocus`, so it takes focus whenever the keyed
  editor mounts (from a pill, from "Add", on a switch, and when a parameter
  turns the placeholder into a control). The first field of a filter keeps the
  same editor mounted, so the pick calls `focusLabelInput()`, from the sidebar
  and from a tile card.
- The edited filter's field is resolved as the shipped bar does
  (`useFilterRuleField`, over the shipped `useDashboardFilterField`:
  dimensions and metrics, with the labels of the tile it is mapped on). A SQL
  column filter (`target.isSqlColumn`) has no field: it goes by its column
  name, and its type is the column's as a tile reports it, else the target's
  `fallbackType` (`getSqlColumnType`). `FilterSettings` passes that type down
  (`getFilterRuleType`), and `useSqlColumnsByTile` offers a dimension filter
  the SQL columns of its kind, a SQL column filter those of its column's type,
  and a metric filter none.
- Field search is the shipped `FilterFieldSelect`, never a picker of our own:
  every time grain is a field, fields of the current tab come first, grouped
  by table. `FieldsAndTiles` feeds it what the shipped "Add filter" does:
  dimensions, plus metrics under `FeatureFlags.MetricDashboardFilters`.
  - A placeholder shows it inline (`NewControlFieldSearch`). When no tile has
    fields it shows the shipped "Select a column to filter" select instead,
    restated here because the shipped one is inline in `FilterConfiguration`.
    Free parameters are not in the field search: a small "Or control a
    parameter" select sits under it when there are any.
  - "Add a field" mounts it focused and open (`AddFieldSearch`) with the
    fields of exactly the target's type (`getFieldCandidates`, the shipped
    `matchFieldByType`) that are not rows yet and that some tile offers:
    metrics for a metric filter, dimensions otherwise. Another grain of a date
    the filter is on is offered. It is put away when its list closes (Escape,
    focus leaving, a pick); Escape hands focus back to the button.
  - The shipped picker sets no `aria-expanded`, so `useEditorDismiss` cannot
    see its open list. Both wrappers carry `data-own-escape`; the placeholder
    one closes the editor itself on Escape once the list is closed.
  - Enter picks the option reached with the arrow keys; it does not pick the
    first match.
- A row is named by its field's own label (a grain says which one). A SQL
  column filter has one row, its column, counted over the SQL chart tiles that
  have the column; it takes no other field.
- `ControlsBar` carries the same `data-tour-*` anchors as `DashboardFiltersBar`;
  keep them in step when either changes.

## Settings

- `FilterSettings` renders two cards: "Default value" (`FilterValueSettings`)
  and "Viewer controls" (`ViewerControls`).
- This layer only exposes what a dashboard can already save: the operator,
  `singleValue`, `disabled` and the rule's values as the default, `required`
  and `requiredGroupId`, and `lockedTabUuids` (the dashboard uuid is the key
  when there are no tabs).
- Settings is disabled for a placeholder ("Pick a field first"). The tab id
  stays `settings`.
- `FilterValueSettings` is a port of the shipped settings form
  (`dashboardFilters/FilterConfiguration/FilterSettings.tsx`) without its label
  input and its Required card, which the shipped form cannot hide. Keep the
  two in step: the operator is always shown, with a disabled "any value" input
  while the default is off; "Single value" / "Multiple values" sits in the
  operator select where `supportsSingleValue` allows it and writes
  `singleValue`; the default switch is hidden for a required filter, whose
  value input stays. Strings the shipped form has are the shipped strings.
- Every edit it emits goes through the shipped popover's rule
  (`handleChangeFilterRule`): a rule that has a value (`hasFilterValueSet`) is
  never `disabled`, and a required rule with no value always is. So choosing
  an operator with the default off keeps it off, unless the operator needs no
  value or brings one (dates), which switches the default on as shipped.
- Requirement rules are over dimension and metric filters only, as in the
  shipped card; a table calculation filter is never offered as an alternative.
- "Required" in `ViewerControls` follows the shipped form
  (`handleToggleRequired`, `RequiredFilterCard`, the "Filter rules" popover)
  through `requirements.ts`. The shipped card is not rendered: its switch
  cannot be disabled or carry a tooltip.
  - On: a filter saved in a shared rule goes back into it (`requiredGroupId`
    of the rule in `dashboard.filters`), valueless; any other becomes required
    on its own. A default value does not block it: it stays as a temporary
    value, removed on dashboard save.
  - Off: only this filter changes, and its values and settings are cleared
    (`getFilterRuleWithDefaultValue(..., null)`). The rest of its rule keeps
    its `requiredGroupId`, even a rule left with one member.
  - Both writes go through the shipped disabled rule, like every edit of
    `FilterValueSettings`.
  - "Or one of these instead" gives the shipped reasons
    (`getRequirementIneligibilityReason`). Unchecking takes that filter out
    and leaves the others.
  - A locked, required filter with no value cannot be satisfied by a viewer
    (`isLockedRequiredMissingValue`, the shipped Apply guard restated: locked
    on any tab, `required`, no value). The editor has no Apply, so the toggle
    that would reach that state is disabled with the shipped message as its
    tooltip: "Required" on a locked filter, each lock switch on a required
    one. Switching either off is always allowed.
  - "Edit rule →" shows for a filter that shares a rule, when
    `useFilterBarPopovers()` is there. It closes the editor, then opens the
    bar's "Filter rules", whose button is hidden while the editor is open.
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
- `TabTargets` is the sidebar's "Tabs" section, for a filter on a dashboard
  with two tabs or more: one checkbox per tab with the tab badge's count. The
  state is over the tiles the filter can reach on the tab (the ones it is on,
  the ones the switch could turn on, SQL chart tiles with a column of its
  kind): checked when all are filtered, indeterminate when some are. A click
  is one `updateFilter` write (`setTabTargets`). As in the shipped popover, a
  checked or indeterminate tab switches off (`setTileField(..., null)` for
  every tile on it) and an unchecked one switches on. On, each unfiltered tile
  gets the filter's first field when it offers it, else the shipped best
  match among the filter's own fields it offers (same name and type, then
  same type); a field the filter does not have is never added, a data app
  tile follows the rule again, and a SQL chart tile is left alone.
- Counts (`getTabCounts`, `getTabCountsForField`) use every tile on the tab or
  dashboard, not only the filterable ones.
- A tile's look answers two questions only: is it filtered (or set) by this
  control, and, if a field is active, is it on that field. Whether the tile
  could take the active field never changes the look. `data-highlighted` is:
  - `mapped`: on the control, and either no field is active or the tile is on
    the active one. A solid hairline in `--mantine-color-blue-5` over a faint
    blue wash.
  - `other`: on the control, but through another field than the active one.
    A dashed `blue-5` border with no fill.
  - `available`: reachable, but not on the control. A neutral dashed outline
    in `ldGray-4` with no fill.
  - no attribute: the control cannot reach the tile. No line.

  Blue on a tile always means the control filters or sets it. "On the control"
  is a field or SQL column of the filter on the tile (`tileFieldId !== null`),
  or a parameter the control sets on it (`setKeys`); a SQL chart tile on a
  column, or a data app tile that is on, is `other` while any field is active.
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
  `Select`, focused and open, on click, Enter, Space or an arrow key. Focus
  alone never opens the list (`openOnFocus={false}`), so clearing from the
  keyboard leaves it closed. The page scrolls as a whole, so Mantine's
  `hideDetached` never fires for a tile under the pinned bar: while its list
  is open, the select closes it on scroll once something else covers it.
- A card's dropdown has up to two groups: first the control's own fields (or
  parameters) that the tile offers, then the others the tile offers.

  | Situation | First group | Second group |
  | -- | -- | -- |
  | Filter control | "In this filter" | "Other fields on this tile" |
  | Parameter control | "In this control" | "Other parameters on this tile" |
  | New control (placeholder) | "Fields on this tile" | "Parameters on this tile" |

  `LazySelect` takes `groups` and drops the empty ones. Labels show only
  when two groups have entries: Mantine labels a lone group too, so one group
  is passed as a plain list with no label. "All its parameters" stays in the
  first group. The second group of a filter control is every other field the
  tile offers that the filter could take
  (`fieldCandidates.ts`, the rule "Add a field" in the sidebar uses: same
  kind, not already a row, one grain per date; grains folded to one entry,
  the table label added where two entries read the same). Choosing one is the
  same write as any other choice, `setTileField` for this tile only, and by
  the model that is what adds the field to the filter. SQL chart tiles have no
  second group. The dropdown is searchable when the second group has entries
  or the first has more than 8.
- A placeholder shows the cards too, so a new control can start from a tile.
  A tile is reachable when it offers a filterable field or uses a free
  parameter (`getAllFreeParameterKeys`, the list behind the sidebar search);
  SQL chart tiles are not. A reachable tile is `available` with "Not
  filtered" and an empty select ("Select a field", "Select a field or
  parameter", or "Select a parameter" when it offers no field); none is
  `mapped` or `other`. The list is the tile's fields of every kind
  (`getTileStarterFieldIds`: grains folded, sorted and labelled like the
  candidates), then its free parameters. `TileOverlays` builds these per tile
  in one `useMemo` keyed on the dashboard, and names the select "New control
  on <tile>", so typing the label re-renders no card.
- A tile is reachable when it offers one of the filter's fields or a field it
  could add; the second kind shows the empty select and is `available`. A data
  app tile and a tile with a missing field are always reachable. Counts do not
  depend on reachability.
- The list component computes each tile's candidates in one `useMemo` keyed on
  the filter's field ids (joined), not on the rule, and passes them as
  `candidates`.
- The select has no "Not filtered" / "Not set" entry; the line above it says
  that. A tile the control leaves alone has an empty select with a placeholder
  ("Select a field", "Select a column" on a SQL chart tile, "Select a
  parameter"). A chosen value has a clear button ("Leave this tile out",
  "Switch this tile off") that reports `null`: `tileTargets[tileUuid] = false`.
  The clear button works on the stand-in button without mounting the `Select`,
  and it is a named tab stop, since it is the only way to clear.
- `TileOverlays` portals a veil and a "Filtered by" card into each
  `[data-tile-uuid]` grid item on the active tab; `TabCounts` portals an
  "x of N" badge into each tab node. Both resolve targets with
  `usePortalTargets`. `TabCounts` and `ParameterOverlays` render nothing for
  a placeholder.
- A veiled tile is locked three ways, and none of them stops an event. Every
  overlay root (`TileOverlay`, `ParameterOverlay`, `LinkPrompts`) carries the
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
- A tile card's second group, "Other parameters on this tile", lists the
  parameters the tile uses that are free and of the control's kind
  (`getControlFreeParameterKeys`, also behind the sidebar's "Add a
  parameter"). A tile that uses only such a parameter is reachable and
  `available`.
- Choosing one is `addControlKeyFromTile`, one `updateControl` write: the key
  joins `parameterKeys` and this tile is narrowed to it. Because no entry
  means every parameter of the control, each other tile that uses the new key
  and has no entry is pinned to what the control set on it before: its one
  parameter of the control, or `false` when it used none. A tile on two or
  more parameters of the control cannot be pinned (an entry is one key or
  `false`) and takes the new parameter too. The sidebar's "Add a parameter"
  pins nothing: there the parameter lands on every tile that uses it.
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
