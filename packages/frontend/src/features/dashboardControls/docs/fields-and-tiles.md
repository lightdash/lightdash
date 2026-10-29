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
- The fields list (`FieldsAndTiles`) shows `getFilterRows`: the fields, then every column a SQL chart
  tile is mapped to, so the list matches the tile cards. Removing such a
  column row takes it off its tiles. Removing the first row promotes the
  next one (a field, else a column); only the last row empties the filter.
  Known limit: a column whose id equals one of the filter's fields shares
  that field's row.
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
closes and the draft stays. `ControlsBar` keeps the filter row in its grid
cell, faded and `inert`, and fades the mapping row in over it, so the grid
never moves. The row: the open pill (inert, no grip or X), "Choose the tiles
it filters" with "{n} of {m} tiles · {k} tabs" (its widest form reserved),
"via", a chip per `getFilterRows` entry, "Add a field", Cancel
(`cancelMapping`: tile targets back to where mapping started, then the
popover) and Apply (`close`, the editor's Apply). The row, cards, bar and
the Add a field menu are `data-controls-editor`, so Escape there deselects
a chip, then, only while nothing changed, goes back to the popover. A press
outside never leaves mapping.

- Chip hover sets `hoveredFieldId`: its tiles get the overlay's `mapped`
  ring. Chip click selects it (`highlightedFieldId`) and raises the bar.
- "Add a field" lists `getFieldCandidates` with a count of the tiles that
  have the field and are not filtered yet (only those with one). A pick is
  `applyFieldToUnfilteredTiles`, then the chip is selected and the write
  goes through `applyWithUndo` as `kind: 'add'`, so the bar's Undo takes it
  back. Sorted by count, then name; labels that still read the same carry
  their table; a search shows past eight entries.
- Focus (`mappingFocus.ts` markers): the added chip takes it; Tab from the
  selected chip goes to the bar (portalled after the tiles) and Shift+Tab
  from the bar's first action comes back; once the bar leaves with focus,
  it goes to the chip, else "Add a field". "Filter this tile" hands it to
  the card's select.

## Actions (`useFieldTileActions`)

The one place counts and actions are computed, for the field bar and the
tile cards. It reads selectors only and takes the caller's
`useSqlColumnsByTile` result. Returns `forField` / `forSqlColumn`, each with
`thisTabScope`, `everyTabScope`, `applyToAll`, `clear`, `remove`.

- Scope is only which tiles are passed (`tilesByScope`); an action never
  writes outside it. `'this-tab'` exists only with two tabs or more.
- `FieldScope` (`getFieldScope`, `getSqlColumnScope`): `applied`,
  `unfiltered`, `replaced` never overlap and sum to `possible`.
- `applyToAll` = `applyFieldToAllTiles`, `clear` = `removeFieldFromAll`, both
  through `applyWithUndo`. "Remove field" is whole-dashboard and never
  refused; on the only field it calls `removeLastField`.
- The field bar always shows Undo, "Filter all tiles" and Clear, disabled
  when they would change nothing (and while fields load).

## Field bar (`FieldTilesBar`)

Shown in mapping while a chip is selected (`highlightedFieldId`, never
hover): one field only, its "{applied} of {total} tiles" over every tab,
then Undo (off until `fieldUndo`; filled right after "Add a field", the one
filled control on the bar), "Filter all tiles" (`applyToAll('every-tab')`,
off when every tile with the field is on it) and Clear (`clear('every-tab')`,
off on the filter's only field). Portalled into an element inserted after the
active tab's `.react-grid-layout` (`usePortalTargets`), keyed on the grid so
a remounted grid gets a new one; it is not in `ControlsBar`, which is
sticky. When a pressed button leaves, focus goes to the region.

## Tile overlays (`TileOverlay`, `TileOverlays`)

Mounted only in mapping (`isMapping`): opening or editing a value leaves
every tile as it is. No wash: a tile that can take the filter keeps its
look under its card; one that cannot dims (its own surface over it), with no
card. Cards read "Filtered by {field}" on the filter's own field, "Filtered
via {field}" with the select of fitting fields on another, and "Not
filtered" with "Filter this tile" (the filter's field the tile has, else
its first fitting one).

- `data-highlighted` answers only "on this control?" and "on the active
  field?": `filtered`, `mapped` (blue), `other`, `available`, or none. Whether
  a tile _could_ take the field never changes its look.
- Only a click on a chip scrolls (`scrollFieldId`,
  `useScrollToHighlightedTile`); marks and hover never scroll.
- A veiled tile is locked by `LOCKED_TILE_CLASS` (no grid drag) and `inert`
  siblings via `usePortalTargets(..., lockSiblings: true)`, which removes
  exactly what it set. No event is stopped.
- Per-tile candidates are computed in one `useMemo` keyed on the filter's
  joined field ids, not the rule.
- `LazySelect` mounts the real select only on open; focus alone never opens
  it, and its clear button works without mounting.
- A placeholder has no overlay: nothing is on the canvas until a field is
  picked in the editor's field search, the one way to start a filter.

## Tab counts (`TabCounts`)

Counts show only in mapping, always the whole filter's (a hovered or
selected chip never changes them); an editor's slots stay at rest so nothing
reflows, and a viewer never gets them. App editors portal into the tab's slot
(`hasTabSlots`, the ⋮ beside it made inert); viewers and embed editors into
the tab node. The width of the widest fraction is reserved, so nothing
reflows while a filter is open; a viewer's tabs get slots only once their
filter has a field.

## Pill hover (`useTileHover`)

With no filter open, hovering an editor's pill sets `data-controls-hovered`
on its tiles' grid items directly: no re-render, veil or scroll. Only the
pill that marked last clears (`tileHoverOwner`), after `LEAVE_GRACE_MS`.
