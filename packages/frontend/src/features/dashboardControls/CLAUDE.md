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
- The sidebar is pinned under whatever is fixed above it
  (`usePinnedSidebarTop`, `getPinnedSidebarTop`): the navbar until it has
  scrolled away, plus the banner, which never scrolls. Whether there is a
  banner is the navbar's own answer, read from `data-has-banner` on
  `#navbar-header` and watched, since it can arrive after the page.
  Fullscreen is not handled: its toggle only exists in view mode, and the
  editor only opens in edit mode.
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
  the sidebar is open. A pill is disabled until the filterable fields exist
  (`allFilterableFields`), as the shipped pill is; a SQL column filter waits
  for none. Dimension rules and metric rules are two dnd-kit
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
  - `filterLock.ts`: the lock key, label, next rule and tracking event.
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
- `open(id)` does nothing on the control that is already open, new or not.
  While another control is being edited, that one is closed first with
  `close()`, as "Done" would, then the other one opens. So a new control is
  kept when it has a field and dropped otherwise, an existing one left with
  no field goes as "Remove filter" does, and an empty default value is
  switched off on the control that is left.
- `removeLastField(fieldLabel)` takes the edited control out of the dashboard filters
  and opens a placeholder in its place: same id, label, `required`,
  `requiredGroupId` and `lockedTabUuids`; operator, values, default and
  `singleValue` go with the field. The next `addFirst*` puts the control back
  where it was in its list (appended when the new field is of the other
  kind) and tracks nothing. A locked control comes back not `required` when
  the new field brings no value (`isLockedRequiredMissingValue`).
- `updateFilter(rule)` writes to the dashboard context, so tiles preview live.
- `close()` keeps the edits: they already live in the dashboard draft. A
  control that cannot be kept (`canKeepFilterRule`: no field) is dropped
  instead: a new one by `discard()`, an existing one as `removeFilter()`
  does. It turns off a default value that was switched on but left empty.
- A label is optional. A filter with none shows its field's name, as the
  shipped bar does.
- `discard()` and `removeFilter()` undo what the editor wrote and nothing
  else. `discard()` puts the edited rule back as the snapshot holds it
  (`restoreFilterRule`: in the list and at the place the snapshot holds it,
  when it has left the filters or came back in the other list, as after
  `removeLastField` and a field of the other kind), or takes it out when it
  was new; `removeFilter()` takes
  it out. Both also put back the other rules the editor itself wrote
  (`restoreFilterRules` over `touchedFilterIds`). Every rule written from
  outside the editor keeps that write (a duplicated tile, a tab, a lock on
  another pill). Saving to the server stays with the dashboard's own Save.
  Pure helpers: `sidebarState.ts`.
- `updateOtherFilters(rules)` is the one way the editor writes a filter other
  than the edited one (a required alternative added or removed in
  `ViewerControls`). It records the ids it wrote since the control was
  opened; never call the dashboard's `setDashboardFilters` from the editor.
- `haveFiltersChanged` is settled by every way out (`close()`, `discard()`,
  `removeFilter()`, through `settleFiltersChanged`). It is on when the
  filters differ from the snapshot or it was on before
  (`haveFiltersChangedSince`); the `disabled: true` that `close()` writes
  turns it on. It is lowered only when the editor raised it itself and the
  temporary filters are as they were then, so an edit put back by hand (a
  label typed, then emptied) leaves it off, and a flag shipped code raised
  meanwhile (a temporary filter) is never lowered.
- `isSidebarOpen` is derived: a control is being edited and its rule is
  still in the dashboard filters. A rule that something else removed closes
  the sidebar at once; the next `open` or `openNew` starts over: `close()`
  only resets then, so the rule stays away and the flag is left alone.
  Nothing is reset in an effect. The dashboard filters can reach the provider a render
  after a write, so the rule a first field just wrote (`writtenRule`) stands
  in for `editingRule` until they hold it: "not visible yet" never reads as
  "gone". It is dropped the moment the filters hold the rule, so a later
  removal still closes.
- `close()`, `discard()`, `removeFilter()` and opening another control clear
  the waiting fields. The first three send focus back to the bar once the
  editor has left the page: to the control's pill when it is still there and
  not disabled (a fields refetch disables it), else to "Add". The provider finds
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
- A mouse down never unclicks the field, and neither does changing the
  dashboard tab: the selection is kept while the editor walks the tabs. It
  ends only by clicking the card again, Escape, selecting another field,
  removing the field, or closing or switching the editor.

## Editor

- `EditorShell` is the one chrome for the sidebar: title, subtitle, More actions
  menu, a Close X, an `aboveTabs` slot for the label, a tab strip (shown when
  there is more than one tab), body and a footer. The X and "Done" both call
  `close`; the quiet discard action ("Discard filter" for a new one, "Discard
  changes" once an existing one has changed) calls `discard`. The footer status
  says what closing would drop. Add chrome there.
- `ControlSidebar` edits the control from `useControlsSidebar`. A placeholder is
  titled "New filter" and cannot be kept until it has a field. Any other
  control is titled by its label, or by its field's name while it has none.
- The label is a local draft (`useLabelDraft`): the title follows the draft,
  and the control gets it after 300ms without typing, on blur, on Enter and
  from a suggestion chip, which hands focus to the label input since the chip
  leaves the page. Enter commits and the editor stays open. Outer spaces are
  trimmed when the label is written, and a label of spaces is written as no
  label: the rule then goes back to exactly what it was when the control was
  opened, with no `label` key if it had none (`withFilterRuleLabel`), so
  emptying a typed label leaves the control unchanged. The placeholder is the name the control goes
  by when the label is empty. Blur commits synchronously, which is what lets
  "Done", the X, Escape and "Discard" see it. The editor body is mounted with
  the control id as `key`, so the draft restarts and a pending commit is
  dropped when another control opens.
- Focus: the label input has `autoFocus`, so it takes focus whenever the keyed
  editor mounts (from a pill, from "Add", on a switch). The first field of a
  filter keeps the same editor mounted: the id is the placeholder's, and the
  rule just written stands in until the dashboard filters show it. So the
  pick calls `focusLabelInput()`, from the sidebar and from a tile card.
- The edited filter's field is resolved as the shipped bar does
  (`useFilterRuleField`, over the shipped `useDashboardFilterField`:
  dimensions and metrics, with the labels of the tile it is mapped on). A SQL
  column filter (`target.isSqlColumn`) has no field: it goes by its column
  name, and its type is the column's as a tile reports it, else the target's
  `fallbackType` (the shipped `getSqlColumnFilterType`, through
  `useFilterRuleSqlColumnType`). `FilterSettings` passes that type down
  (`getFilterRuleType`).
- `useSqlColumnsByTile` offers every filter every column of every SQL chart
  tile, whatever the types, as the shipped popover does
  (`TileFilterConfiguration`). A placeholder gets none.
- Field search is the shipped `FilterFieldSelect`, never a picker of our own:
  every time grain is a field, fields of the current tab come first, grouped
  by table. `FieldsAndTiles` feeds it what the shipped "Add filter" does:
  dimensions, plus metrics under `FeatureFlags.MetricDashboardFilters`.
  - A placeholder shows it inline. When no tile has fields it shows the
    shipped "Select a column to filter" select instead (`SqlColumnSelect`).
  - "Add another field" mounts it open (`defaultOpened`) and focuses it
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
- "Add another field" is a toggle: a click on the button while its search is
  open closes it (a primary press only is read as that press).

## Settings

- `FilterSettings` renders two cards: "Default value" (`FilterValueSettings`)
  and "Viewer access" (`ViewerControls`).
- This layer only exposes what a dashboard can already save: the operator,
  `singleValue`, `disabled` and the rule's values as the default, `required`
  and `requiredGroupId`, and `lockedTabUuids` (the dashboard uuid is the key
  when there are no tabs).
- Settings is disabled for a placeholder ("Select a field first"). The tab id
  stays `settings`.
- `FilterValueSettings` renders the shipped settings form
  (`dashboardFilters/FilterConfiguration/FilterSettings.tsx`) in edit mode,
  with `hideLabel` and `hideRequiredCard`. It adds two lines of its own under
  it: the hint while the default has no value, and the "No default" note while
  the default is off. Operator, value input and default switch are the
  shipped form's; change them there.
- There is no Apply: every edit the form emits is written at once, through
  the shipped popover's rule (`getFilterRuleWithDisabledState`, edit mode): a
  rule that has a value (`hasFilterValueSet`) is never `disabled`, and a
  required rule with no value always is. So choosing an operator with the
  default off keeps it off, unless the operator needs no value or brings one
  (dates), which switches the default on as shipped.
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
  - "Edit rule" shows for a filter that shares a rule, when
    `useFilterBarPopovers()` is there. It closes the editor, then opens the
    bar's "Filter rules", whose button is hidden while the editor is open.
- One edit is refused: the one that would leave a locked, required filter
  with no value, which the shipped Apply refuses too
  (`isLockedRequiredMissingValue`). That covers emptying the value and an
  operator change, since the shipped form empties the value with it. While a
  filter is locked and required the shipped message
  (`filters.config.applyLockedRequiredTooltip`) is shown under the form. A
  rule saved in that state can still be edited out of it.
- A refused edit remounts the shipped form (`key`), since its inputs keep
  their own text and would stay out of step with the rule. The input that was
  being typed in gets focus back with its text selected, and the message
  under the form turns red with `role="alert"` until the next accepted edit.
- Nothing blocks closing. While `isDefaultValueIncomplete(rule)` a hint says
  the default is left off, and `close()` writes `disabled: true`. Incomplete
  is the shipped reading, never our own: enabled and `!hasFilterValueSet(rule)`,
  so "(null)" alone is a value and half a range is not.
- A lock changed in `ViewerControls` goes through the pill's
  `getFilterLockToggle` (`filterLock.ts`) and tracks its event, one per tab
  whose lock changes.
- `FilterPills` carries the shipped lock toggle (`lockSlot` / `lockSlotActive`),
  hidden while the sidebar is open.

## Fields and tiles

A filter control can hold several fields, on today's saved shape (`peers.ts`):

- The first field is the rule's `target`.
- Another field on a tile is `tileTargets[tileUuid] = { fieldId, tableName }`.
- A tile left out is `tileTargets[tileUuid] = false`.
- A tile uses exactly one field of the filter, and a field belongs to a filter
  only through a tile mapping (`getFilterFields`). The tile has to exist: a
  mapping left behind by a deleted tile makes no field and is never promoted.
  `getFilterFields` takes the dashboard's tiles; `undefined` means not
  loaded, and then every mapping counts.
- A SQL column is never a field, even when its name is a field's id. A SQL
  column filter has one row, its column (`isSqlColumnRow`), and a tile is on a
  row only within its kind (`isTargetOnRow`). Counts, clearing, the highlight,
  the scroll target, the tab badges and their tooltip all go through these;
  a SQL column filter is never resolved in the fields map and never prompts a
  link. `useFieldTileActions().forSqlColumn` says the kind outright, for a
  column SQL chart tiles are on in a filter of any kind.
- `filterableFieldsByTileUuid` is `undefined` until the tile fields load, and
  that is not "offers nothing". Until then nothing writes blind
  (`isTileFieldKnown`, `FieldTiles.canAct`): the helpers never drop a tile's
  entry (`setTileField` writes it out, so a tile left out stays left out), a
  tile card writes nothing, and every action of the hook returns early. This
  is a loading state, so what stays on screen is disabled, not hidden: the
  trash can of a card and the bar's "Clear". The on-tile follow-up is not
  offered, since its count would be a guess. A data app tile and a SQL chart
  tile with columns are always known, and so is a SQL column row.
- A field on no tile cannot be saved, so it *waits*: `waitingFieldIds` in the
  provider lists fields added with "Add another field" when every tile they fit
  already had one, and fields that lost their last tile. They show at
  "0 of N tiles", every tile card that could take them offers them, and they
  are gone when the sidebar closes. "Add another field" offers any field of the
  filter's kind that some tile offers, and clicks the new field only when it
  landed on a tile.
- "Remove field" is never refused. On a filter's only field it calls
  `removeLastField(fieldLabel)`: the control stays open on "pick a field" with its
  label, the fields that were waiting go too, and it leaves the bar until a
  field is picked. Closing it there drops it; "Discard changes" brings it
  back as it was opened. An existing control keeps its title: the provider
  keeps the lost field's name in `emptiedAt` (`emptiedFieldLabel` in the
  context) until the control has a field again, and an unlabelled control is
  titled by it. A field that was not known has no name (null), so the title
  stays "Filter". A new control goes back to "New filter".
- Focus after the trash can, whose button leaves with its card: the card
  that took its place, else the last card, else "Add another field"; the
  field search when the control was emptied. `FieldsAndTiles` notes the
  pressed card in a ref and moves focus in a layout effect once the card is
  gone. No timer.
- A card (`FieldRow`) is a legend: icon, name and a trash can on the first
  line, "<table> · x of N tiles" over every tab on the second. A click
  anywhere on it toggles the selection (the name button's `::after` covers the
  card, `aria-pressed`). There is no eye and no menu on it.
- The trash can ("Remove field", `aria-label` "Remove field <label>") sits
  above the click area. It is hidden with `visibility` until the card is
  hovered, holds focus (`:focus-within`) or is selected, and is never
  unmounted: focus on the name shows it, so the keyboard reaches it.
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
- `useFieldTileActions(sqlColumnsByTile)` is the one place a field's counts
  and actions are worked out, for the card, the bar and the tile cards'
  follow-up. It reads the context through selectors, never the whole value,
  takes the caller's `useSqlColumnsByTile` result so it is computed once per
  component, and memoises what it returns. It
  returns `{ forField(fieldId), forSqlColumn(reference) }`, or null with no
  control or a placeholder. `forSqlColumn` is for a column SQL chart tiles
  are mapped to on a filter of any kind (it is never a field of the filter).
  Both give the same shape: the
  field, its labels, `isWaiting`, two `FieldScope`s (`thisTabScope`,
  `everyTabScope`), `replacedLabels` for the scope in view,
  `otherTabsUnfiltered`, and `addToUnfiltered`, `switchFromOthers`, `clear`
  (each taking a `TileScope`) and `remove`.
- Scope: there is no mode. On a dashboard with two tabs or more the scopes
  are `'this-tab'` (the dashboard's active tab, which it follows),
  `'other-tabs'` (every tile off that tab) and `'every-tab'`; with fewer
  there is only `'every-tab'`, `thisTabScope` is null and `'other-tabs'` is
  empty. Scope is only which tiles are passed to the helpers
  (`tilesByScope`), so an action never writes a tile out of scope. The card
  counts `everyTabScope`; the bar acts on the scope in view.
- A tile's tab is its effective one (`getEffectiveTabUuid`, `getTilesOnTab`
  in `peers.ts`): a missing or stale `tabUuid` is the first tab, as the grid
  draws it. The scopes, the tab badges and the tile cards all use it.
- A `FieldScope` (`getFieldScope`; `getSqlColumnScope` for a SQL column row)
  is, of the tiles that offer the field or are on it (`possible`, so a tile
  on a field it no longer offers counts and `applied` never exceeds it, on
  the card, the bar and the badge alike): the ones on it
  (`applied`), the ones the filter is not on (`unfiltered`) and the ones on
  another field (`replaced`, with `replacedFieldIds`). The three never
  overlap.
- `FieldTilesBar` is where a field's tiles are changed: a compact floating
  selection bar, shown while a field is clicked (`highlightedFieldId`, never
  the hovered one) and the control is not a placeholder. A waiting field can
  be clicked too.
  - One line that wraps when narrow: the field's icon and name, a vertical
    `Divider`, then the tab in view (every tile on a dashboard without
    tabs): "on **x of N** tiles on this tab" ("on x of N tiles" without
    tabs) and its actions. There is nothing about every tab: no count,
    switch or clear for it.
  - Where no tile of the scope offers the field the count reads "No tile on
    this tab has this field" ("No tile has this field" without tabs) and
    there is no action.
  - Actions, size `xs`: the filled main button when the scope has unfiltered
    tiles (`applyFieldToUnfilteredTiles`). Its label is "Filter n unfiltered
    tile(s)" when a tile of the scope is on another field, else "Filter the
    other n" when the field is on a tile there, else "Filter all n".
    "Replace <fields> on n tile(s)" (`default`, `switchTilesToField`: only
    the tiles on another field of the filter, so the two never count the
    same tile); a subtle gray "Clear" (`removeFieldFromAll`).
  - With tabs, after a second `Divider`: a subtle "Filter m on other tabs"
    when `otherTabsUnfiltered` is above 0. It is
    `addToUnfiltered('other-tabs')`: it fills the unfiltered tiles of the
    tabs that are not active and never this tab's. It shows on a tab with no
    tile for the field too.
  - A button that would change nothing is not rendered, never disabled.
  - It is a `region` named "Tiles filtered by <field>"; the count sentence
    is the `aria-live="polite"` element. A button's `aria-label` starts with
    the words on the button, then adds the scope and the field: "Filter all
    3 tiles on this tab by <field>", "Replace <fields> on 2 tiles with
    <field> on this tab", "Filter 4 on other tabs by <field>" (no "on this
    tab" without tabs). "Clear" is named "Clear <field> from this tab".
  - A pressed button leaves once its action is done, so focus moves to the
    region itself (`tabIndex={-1}`), from a layout effect and only when
    focus would otherwise be on `<body>`.
  - Surface: a `Paper` with no border (`withBorder={false}` over the theme
    default), the `xl` shadow and the body background.
  - Mount: `ControlsSidebarPage` renders it. It finds the active tab's
    `.react-grid-layout` with `usePortalTargets`, inserts an element of its
    own right after that grid and portals into it, so it moves no tile. The
    element is keyed on the grid: a grid mounted again gets a new one, or
    React would append the new grid after the bar.
  - Position: that element is `position: sticky; bottom`, `width:
    fit-content` and auto side margins, so it is centred in the dashboard
    content and stays at the bottom of the view while the page scrolls;
    under the last tile row on a short dashboard. `z-index: 3`: above the
    tile overlays (2), below the sticky tabs, menus and modals. It is not in
    `ControlsBar`: that would put it in the sticky filter bar.
  - "Remove field" and `isWaiting` are always whole-dashboard.
- Counts (`getTabCounts`, `getTabCountsForField`) use every tile on the tab or
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
  does hover. Only a click on a row scrolls. The list passes `scrollFieldId`
  to the tiles on the clicked field (`highlightedFieldId`), whatever is
  hovered, so hovering or focusing another row and leaving changes no tile's
  prop and nothing scrolls again. `useScrollToHighlightedTile` scrolls the
  first `[data-highlighted='mapped']` tile into view when none of them is
  visible. A clicked field that is on no tile scrolls nothing.
- A selected row keeps Mantine's `:focus-visible` ring; it only drops the
  outline it would get without keyboard focus.
- A waiting field's row carries `data-waiting` and a dashed border.
- A tab with a count badge keeps its natural width (`TabCounts.module.css`),
  so the tab strip scrolls instead of cutting the names.
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
  (`fieldCandidates.ts`, the rule "Add another field" in the sidebar uses: same
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
  in one `useMemo` keyed on the dashboard, and names the select "New filter
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
  button ("Stop filtering this tile") that reports `null`: `tileTargets[tileUuid] = false`.
  The clear button works on the stand-in button without mounting the `Select`,
  and it is a named tab stop, since it is the only way to clear.
- Follow-up on a tile card: right after a tile is changed from its card, that
  card offers the same for the rest of the scope in view, under the select
  and a top border, as one subtle `compact-xs` button.
  - Set to a field (from nothing or from another field): "Filter the other n
    on this tab too", n being the other tiles of the tab that offer it and
    are unfiltered. It is `addToUnfiltered`, the bar's main button.
  - Left out: "Clear the other k on this tab too", k being the other tiles
    of the tab still on that field. It is `clear`, the bar's "Clear".
  - Without tabs the scope is every tile and the labels drop "on this tab".
    The `aria-label` carries the field, the count and the scope.
  - `EditedTileOverlays` keeps only the intent in state (`FollowUp`: rule
    id, tab, tile, field, whether it is a SQL column, kind), written by
    `handleSelect`. Everything shown is derived on render from
    `useFieldTileActions`: it shows on that tile only while the tile is still
    as the change left it and the count is above 0, so changes from the bar
    or the sidebar update or end it. One exists at a time, on the tile
    changed last.
  - Once used the button leaves, so focus goes to that tile's select.
  - It ends for good when it is used, when the tab or the edited control
    changes or the control loses its last field (compared during render,
    which resets the state; no effect), and
    when the editor closes: `TileOverlays` mounts `EditedTileOverlays` only
    while a control is edited.
  - Never for a placeholder, and never for a data app tile, whose switch
    also ends the one there was. A SQL chart tile gets it for its column,
    over the other SQL chart tiles that have the column.
  - The card gets it as two strings (`followUpLabel`, `followUpName`, null
    on every other tile) and one stable `onFollowUp`, so the memo holds.
- `TileOverlays` portals a veil and a "Filtered by" card into each
  `[data-tile-uuid]` grid item on the active tab; `TabCounts` portals an
  "x of N" badge into each tab node. Both resolve targets with
  `usePortalTargets`. `TabCounts` renders nothing for a placeholder. A badge
  is grey: `light` on a tab the control reaches (`data-reached`), transparent
  on the rest. While a field is active (hovered or clicked,
  `data-field-active`), the tabs that field is on turn `color="blue"`, and
  the tabs it is on no tile of stay grey and transparent. The badge's tooltip
  names the active field from dimensions and metrics
  (`useFilterableItemsMap`), a SQL column by its own name.
- A veiled tile is locked three ways, and none of them stops an event. Every
  overlay root (`TileOverlay`, `LinkPrompts`) carries the
  grid's `draggableCancel` class `non-draggable` (`LOCKED_TILE_CLASS`), so no
  drag starts on it, by mouse or touch. It carries `data-controls-overlay`,
  and `usePortalTargets(..., lockSiblings: true)` sets `inert` on every other
  child of the grid item, so the tile's own buttons are out of the tab order;
  it re-applies as the tile's DOM changes and removes exactly what it set when
  the editor closes, the tab changes or the list unmounts. A caller that locks
  must portal an overlay into every target it gets. The stylesheet's
  `pointer-events: none` on the siblings stays. Never call `stopPropagation`
  on an overlay: Mantine closes lists on a `mousedown` that reaches
  `document`.

## Link prompts

- `LinkPrompts` portals a veil and a card into a chart tile added while
  editing, when a filter control could reach it through a field other than
  the filter's own target (`getLinkCandidates`): one of the filter's other
  fields, else a field of exactly the target's type (`getFieldCandidates`,
  the rule the tile dropdown uses; a date filter is not offered a timestamp).
  A tile with the target field links on its own, SQL chart tiles never
  prompt, and neither does a SQL column filter.
- A row's choice follows its candidates: a choice that is no longer offered
  is dropped, and a single candidate is the choice. It is derived on render,
  never synced in an effect. Candidates that read the same carry their table
  label (`getCandidateOptions`).
- The card never spills out of its tile: `.promptCard` bounds it to the tile
  and scrolls.
- "Apply" and "Skip" are named with the filter ("Apply Status"). Once the
  answered row has left, focus goes to the prompt that took its place, else
  to the one before it, else to the tile itself (`tabindex="-1"`).
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
  card). The field bar rises from `translateY(6px)`. Tab badges do not replay: they change on every hover. The editor's
  content arrives, not its panel, so the page never shows through. Closing is
  immediate.
- Tile cards arrive in one wave: `data-wave` is the tile's index modulo
  `WAVE_BUCKETS`, and the stylesheet maps it to 20ms delay steps.
- A row's press scales the name inside the button. A transform on the button
  would shrink its card-wide `::after` click area mid-click.
- Every animation and transition is switched off under
  `@media (prefers-reduced-motion: reduce)` at the end of its stylesheet.
- No new `:has()` selectors.
