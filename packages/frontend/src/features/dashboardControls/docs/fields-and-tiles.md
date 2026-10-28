# Fields and tiles

## Model (`peers.ts`, on today's saved shape)

- First field: the rule's `target`. Another field on a tile:
  `tileTargets[tileUuid] = { fieldId, tableName }`. Tile left out:
  `tileTargets[tileUuid] = false`.
- A tile uses one field of the filter; a field belongs to the filter only
  through a mapping on an existing tile (`getFilterFields`; `undefined` tiles
  means not loaded, every mapping counts).
- A field on no tile cannot be saved, so it _waits_ (`waitingFieldIds`) until
  it lands on a tile; waiting fields vanish when the rail closes.
  `updateFilter` promotes the next field when the first loses its last tile.
- A SQL column is never a field, even when its name matches a field id: use
  `isSqlColumnRow` / `isTargetOnRow` for counts, clearing, highlight, scroll
  and tab counts. SQL chart tiles map per tile with `isSqlColumn` targets.
- The rail lists `getFilterRows`: the fields, then every column a SQL chart
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
  filterable ones.

## Actions (`useFieldTileActions`)

The one place counts and actions are computed, for the field card, the field
bar and the tile follow-up. It reads selectors only and takes the caller's
`useSqlColumnsByTile` result. Returns `forField` / `forSqlColumn`, each with
`thisTabScope`, `everyTabScope`, `applyToAll`, `clear`, `remove`.

- Scope is only which tiles are passed (`tilesByScope`); an action never
  writes outside it. `'this-tab'` exists only with two tabs or more.
- `FieldScope` (`getFieldScope`, `getSqlColumnScope`): `applied`,
  `unfiltered`, `replaced` never overlap and sum to `possible`.
- `applyToAll` = `applyFieldToAllTiles`, `clear` = `removeFieldFromAll`, both
  through `applyWithUndo`. "Remove field" is whole-dashboard and never
  refused; on the only field it calls `removeLastField`.
- A button that would change nothing is not rendered (never disabled),
  except while fields load, when it is disabled.

## Field bar (`FieldTilesBar`)

Shown while a field is clicked (`highlightedFieldId`, never hover) and the
control is not a placeholder. Portalled into an element inserted after the
active tab's `.react-grid-layout` (`usePortalTargets`), keyed on the grid so
a remounted grid gets a new one; it is not in `ControlsBar`, which is
sticky. When a pressed button leaves, focus goes to the region.

## Tile overlays (`TileOverlay`, `TileOverlays`)

- `data-highlighted` answers only "on this control?" and "on the active
  field?": `filtered`, `mapped` (blue), `other`, `available`, or none. Whether
  a tile _could_ take the field never changes its look.
- Only a click on a field row scrolls (`scrollFieldId`,
  `useScrollToHighlightedTile`); marks and hover never scroll.
- A veiled tile is locked by `LOCKED_TILE_CLASS` (no grid drag) and `inert`
  siblings via `usePortalTargets(..., lockSiblings: true)`, which removes
  exactly what it set. No event is stopped.
- Per-tile candidates are computed in one `useMemo` keyed on the filter's
  joined field ids, not the rule.
- `LazySelect` mounts the real select only on open; focus alone never opens
  it, and its clear button works without mounting.
- A placeholder shows cards too (`getTileStarterFieldIds`), built in one
  `useMemo` keyed on the dashboard so typing the label re-renders no card.

## Follow-up on a tile card

After a tile changes from its card, that card offers "Apply to the other
n" / "Clear the other k" for the scope in view (`applyToAll` / `clear`).
`EditedTileOverlays` keeps only the intent (`FollowUp`); everything shown is
derived, and it ends on use, tab or control change, or close. The card gets
it as two strings plus one stable `onFollowUp`, so the memo holds. Never on a
placeholder or a data app tile.

## Tab counts (`TabCounts`)

Shown only while a filter is edited. App editors portal into the tab's slot
(`hasTabSlots`, the ⋮ beside it made inert); viewers and embed editors into
the tab node. The width of the widest fraction is reserved, so nothing
reflows while a filter is open; a viewer's tabs get slots only once their
filter has a field.

## Pill hover (`useTileHover`)

With no filter open, hovering an editor's pill sets `data-controls-hovered`
on its tiles' grid items directly: no re-render, veil or scroll. Only the
pill that marked last clears (`tileHoverOwner`), after `LEAVE_GRACE_MS`.
