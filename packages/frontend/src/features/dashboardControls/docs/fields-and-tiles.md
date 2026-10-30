# Fields and tiles

## Model (`peers.ts`, on today's saved shape)

- First field: the rule's `target`. Another field on a tile:
  `tileTargets[tileUuid] = { fieldId, tableName }`. Tile left out:
  `tileTargets[tileUuid] = false`.
- A tile uses one field of the filter; a field belongs to the filter only
  through a mapping on an existing tile (`getFilterFields`; `undefined` tiles
  means not loaded, every mapping counts).
- A field on no tile cannot be saved, so it _waits_ (`waitingFieldIds`) until
  it lands on a tile; waiting fields vanish when the editor closes.
  `updateFilter` promotes the next field when the first loses its last tile.
- A SQL column is never a field, even when its name matches a field id: use
  `isSqlColumnRow` / `isTargetOnRow` for counts, clearing, highlight, scroll
  and tab counts. SQL chart tiles map per tile with `isSqlColumn` targets.
- `getFilterRows` lists the fields, then every column a SQL chart tile is
  mapped to, so the mapping row's chips match the tile cards. Clearing the
  first promotes the next one (a field, else a column). Known limit: a
  column whose id equals one of the filter's fields shares that field's row.
- Chips are rows split by label (`getFilterChips`, `{ key, fieldId }`): a field is keyed as
  the shipped bar keys distinct filter fields (`getDashboardFilterableFieldKey`,
  id::table label::label) from each tile's own field, since two explores can
  join one table under two labels. `highlightedFieldId`, `hoveredFieldId`,
  `forField` and an undo's `fieldId` hold that key; a chip's counts and
  actions run over its own tiles only (`isTileInRow`), while the row's
  "n of m" stays the filter's total. A column's key is its reference. Never
  parse a key: look its field id up in the chips (`getChipFieldId`); a key
  that is no chip stands for itself.
- A data app tile takes the filter as a whole (on: no entry, off: `false`).
  It counts as filtered, never in a field's count; clear/remove leave it.
- A mapping to a field the tile no longer offers (`getMissingTileFieldId`)
  still counts as filtered and always gets a card so it can be cleared.
- A tile's tab is its effective one (`getEffectiveTabUuid`,
  `getTilesOnTab`): a missing or stale `tabUuid` is the first tab.
- Counts (`getTabCounts`, `getTabCountsForField`) use every tile, not only
  filterable ones. Mapping's counts (the row's "of m" and the tabs) use
  `getTakeableTabCounts` / `canTileTakeFilter` only, so the tabs add up to
  the row's total.

## Mapping (`MappingRow`)

"Choose tiles" in the popover enters mapping (`startMapping`); the popover
closes and the draft stays. It is offered where the shipped popover's Tiles
tab is (`canChooseTiles`): an editor's filters and a viewer's own
(temporary) ones, new or existing, never a viewer's saved filter. A viewer's
mapping writes their temporary filters only, on Apply. `MappingSwap`
(`ControlsBar`, and the embed's filter bar) keeps the filter row mounted,
faded, `inert` and out of the layout, and fades the mapping row in over it,
so the bar shrinks to the mapping row's one line (the grid moves up once as
mapping starts, back once it ends). In view mode there is no band; nothing else changes. The row
carries the embed's `rail` class, as the popover it stands in for. The row reads as one sentence: the open pill (inert, no grip or X)
"filters {n} of {m} tiles using" (the count 600, its widest form reserved,
`aria-live`; no tabs part, the tabs show their own counts), a chip per
`getFilterRows` entry, "Add a field", Cancel
(`cancelMapping`: tile targets back to where mapping started, then the
popover) and Apply (`close`, the editor's Apply). The row, cards, bar and
the Add a field menu are `data-controls-editor`, so Escape there deselects
a chip, then, only while nothing changed, goes back to the popover. A press
outside never leaves mapping.

- Fields are named as the shipped tile select names them,
  `getFieldSelectLabel(field, false)` (table label + field label): chips,
  the field bar, the cards' heading and select. Pills keep the field label.
- A chip is a default `xs` button with the field's `FieldIcon`; selected,
  it takes the open pill's ink border. Chip hover sets `hoveredFieldId`: its
  tiles get the overlay's `mapped` ring. Chip click selects it
  (`highlightedFieldId`) and raises the bar.
- "Add a field" (the shipped "Add filter" dashed style) opens the shipped
  `FilterFieldSelect` in a popover, its list kept inside it so a pick is not
  a press outside. It lists `getFieldCandidates` that a tile not filtered
  yet has, with no count. A pick is `applyFieldToUnfilteredTiles`, then the
  chip is selected and the write goes through `applyWithUndo` as
  `kind: 'add'`, so the bar's Undo takes it back.
- Focus (`mappingFocus.ts` markers): the added chip takes it; Tab from the
  selected chip goes to the bar (portalled after the tiles) and Shift+Tab
  from the bar's first action comes back; once the bar leaves with focus,
  it goes to the chip, else "Add a field". "Filter this tile" hands it to
  the card's select.

## Actions (`useFieldTileActions`)

The one place counts and actions are computed, for the field bar and the
tile cards. It reads selectors only and takes the caller's
`useSqlColumnsByTile` result. Returns `forField` / `forSqlColumn`, each with
`thisTabScope`, `otherTabsScope`, `everyTabScope`, `applyToAll`, `clear`,
`remove`.

- Scope is only which tiles are passed (`tilesByScope`); an action never
  writes outside it. Without two tabs `'this-tab'` is every tile and
  `'other-tabs'` none (their scopes are null). An action's undo is
  `acrossTabs` unless it was `'this-tab'` on a dashboard with tabs.
- `FieldScope` (`getFieldScope`, `getSqlColumnScope`): `applied`,
  `unfiltered`, `replaced` never overlap and sum to `possible`.
- `applyToAll` = `applyFieldToAllTiles`, `clear` = `removeFieldFromAll`, both
  through `applyWithUndo`. "Remove field" is whole-dashboard and never
  refused; on the only field it calls `removeLastField`.
- The field bar always shows Filter and Clear, disabled when they would
  change nothing (and while fields load); Undo only while there is one.

## Field bar (`FieldTilesBar`)

Shown in mapping while a chip is selected (`highlightedFieldId`, never
hover): one field only, its "{applied} of {total} tiles" over every tab,
then Filter, Clear and Undo. Filter and Clear act on the tab in view first:
"Filter {count} more" (`applyToAll('this-tab')`, the tiles it changes:
unfiltered plus replaced) while this tab has any, then "Filter {count} on
other tabs" (`'other-tabs'`), else a disabled "Filter more"; "Clear {count}",
then "Clear {count} on other tabs", else a disabled "Clear", always off on
the filter's only field. Without tabs the tab in view is every tile. The
"Replaces ..." tooltip names what that fill takes off other fields. Undo is
an icon after a divider, only while `fieldUndo` is live (no disabled
state). One of them is filled at most: Undo right after "Add a field"
(`kind: 'add'`), Filter right after a tile card's pick (`kind: 'pick'`) while
it can act. Portalled into an element inserted after the
active tab's `.react-grid-layout` (`usePortalTargets`), keyed on the grid so
a remounted grid gets a new one; it is not in `ControlsBar`, which is
sticky. When a pressed button leaves, focus goes to the region.

## Tile overlays (`TileOverlay`, `TileOverlays`)

Mounted only in mapping (`isMapping`): opening or editing a value leaves
every tile as it is. No wash: a tile that can take the filter keeps its
look under its card; one that cannot dims (its own surface over it), with no
card. Cards read "Filtered by" on the filter's own field, "Filtered via" on
another, the select below naming the field (it stays in the heading only
when the select cannot show it), and "Not filtered" with "Filter this tile"
(the filter's field the tile has, else its first fitting one). While a chip
is clicked a card's write on that chip's field goes through `applyWithUndo`
(`acrossTabs: false`), so the field bar's Undo takes it back; a write on
another field records none; a card's
"Stop filtering" that removes a whole field (`remove()`) leaves no undo.
A field picked in a card's select selects that field's chip first
(`setHighlightedFieldId`, so the bar rises for it), then writes as
`kind: 'pick'`; "Filter this tile" and a data app's switch select no chip.

- `data-highlighted` answers only "on this control?" and "on the active
  field?": `filtered`, `mapped` (blue), `other`, `available`, or none. Whether
  a tile _could_ take the field never changes its look.
- Only a click on a chip scrolls (`scrollFieldId`,
  `useScrollToHighlightedTile`); marks and hover never scroll.
- A veiled tile is locked by `LOCKED_TILE_CLASS` (no grid drag) and `inert`
  siblings via `usePortalTargets(..., lockSiblings: true)`, which removes
  exactly what it set. No event is stopped.
- A card's options are the shipped tile select's: `getTileFieldOptions`
  (`dashboardFilters/FilterConfiguration/utils`, shared with
  `TileFilterConfiguration`) over the tile's own fields
  (`filterableFieldsByTileUuid`), never the dashboard-wide map, so a field id
  two explores share is named as each tile's explore names it. One list per
  tile, computed in one `useMemo`.
- `LazySelect` mounts the shipped `FieldSelect` (ungrouped, searchable, as
  the Tiles tab) only on open, a plain select for a SQL tile's columns;
  focus alone never opens it, and its clear button works without mounting.
- A placeholder has no overlay: nothing is on the canvas until a field is
  picked in the editor's field search, the one way to start a filter.

## Tab counts (`TabCounts`)

Counts show only in mapping, always the whole filter's (a hovered or
selected chip never changes them); an editor's slots stay at rest so nothing
reflows. A viewer's mapping shows none: their tabs have no slot to reserve. App editors portal into the tab's slot
(`hasTabSlots`, the ⋮ beside it made inert); viewers and embed editors into
the tab node. The width of the widest fraction is reserved, so nothing
reflows while a filter is open; a viewer's tabs get slots only once their
filter has a field.

## Pill hover (`useTileHover`)

With no filter open, hovering an editor's pill sets `data-controls-hovered`
on its tiles' grid items directly (the mapping ring's 2px ink, no tint): no
re-render, veil or scroll. Only the pill that marked last clears
(`tileHoverOwner`), after `LEAVE_GRACE_MS`.
