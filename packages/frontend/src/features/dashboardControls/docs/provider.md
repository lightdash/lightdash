# Provider contract (`useControlsSidebar`)

`ControlsSidebarProvider.tsx` owns the edit; pure helpers are in
`sidebarState.ts`. The rail is on screen exactly while a filter is edited:
there is no separate list or open state.

## Reading the context

- It is a `use-context-selector` context. Use
  `useControlsSidebarSelector((c) => c.x)` anywhere rendered per tile, per
  pill or around the page; `useControlsSidebar()` re-renders on every change,
  hover included.
- Callbacks keep one identity for the provider's life. They read
  `latest.current` (synced after each render, written eagerly by the
  `write*` helpers) so two calls in one event agree, e.g. `updateFilter` then
  `close`.
- `isSidebarOpen`, `highlightedFieldId`, `pendingRule` and `fieldUndo` are
  derived on render. A rule removed from outside closes the rail at once; the
  next `open`/`openNew` starts over.

## Modes

- Mode is the route's, or the provider's `isEditMode` input (embeds). An
  edit belongs to the mode it started in (`SidebarState.isViewer`) and keeps
  writing that mode's filters.
- A viewer's edit writes only temporary filters
  (`setDashboardTemporaryFilters`), new rules made `isTemporary` and through
  `getFilterRuleWithDisabledState(rule, false)`. `open(id)` on a viewer's
  saved filter does nothing: those keep the shipped popover.
- A mode change closes the edit as Apply does, in the one effect that writes
  the store. In the app the header is inert while editing, so it only meets
  browser Back, a typed URL, or an embed's `isEditMode`.

## Opening and switching

- `openNew()` opens a placeholder (no field, never on the bar). It closes any
  current edit first. `addFirstField` / `addFirstSqlColumn` turn it into a
  filter on every tile that offers the field; `addFirstFieldOnTile` puts it
  on that tile only (`setTileField(rule, tile, null)` for the rest).
- `open(id)` on a pill: nothing edited, it opens. Same pill: closes if no
  unapplied changes, else focuses Apply. Another pill: closes and opens if
  clean; with unapplied changes keeps the clicked id as `pendingFilterId`
  (`getPendingId` treats a vanished rule as none) and the footer asks.
  `resolvePending(isApply)` applies or discards, then opens it.
- "Unapplied changes" is `hasUnappliedChanges`, i.e. `isDirty`: a new filter
  without a field has none.

## Ways out

- `close()` (Apply) keeps the edits: they already live in the dashboard
  draft. A rule that cannot be kept (`canKeepFilterRule`: no field) is
  dropped; a viewer's new filter with no value is kept as any value
  (`disabled`) and tracked; an empty enabled default is written
  `disabled: true`.
- `discard()` (Cancel) and removing the edited filter undo what the editor
  wrote and nothing else: the edited rule goes back to its snapshot
  (`restoreFilterRule`, keeping its current section and place), and other
  rules the editor wrote are restored over `touchedFilterIds`
  (`restoreFilterRules`). Writes from outside the editor survive. Saving to
  the server stays with the dashboard's Save.
- `removeLastField(label)` takes the rule out and reopens a placeholder with
  the same id, label, `required`, `requiredGroupId`, `lockedTabUuids`; the
  next `addFirst*` puts it back at its old index, and so does Cancel, in the
  placeholder's section.
- `haveFiltersChanged` is settled on every way out (`settleFiltersChanged`):
  lowered only if the editor raised it and temporary filters are as they
  were, so a flag shipped code raised is never lowered.
- Every way out clears waiting fields and, once the rail has unmounted
  (`FocusReturn`, rendered after children), focuses the control's pill
  (`data-controls-pill`) or "Add filter". A switch moves no focus.

## Dirty and "changed"

- Rules compare as they would save: `undefined` keys and default tile
  targets (`withoutDefaultTileTargets`) leave no trace; `required: false`,
  `disabled: false` and an absent key are equal; `lockedTabUuids` is a set.
- Never normalised: a `false` tile exclusion (copied by duplicated tiles, and
  applies if the tile later gains the field) and whether `tileTargets` exists
  (required-filter tab gating reads it).
- `isDirty` also counts other rules the editor wrote
  (`haveOtherFilterRulesChanged`). Section membership never counts: a move by
  the Section select or the bar's drag applies to the dashboard at once, and
  Cancel keeps each rule in the section and place it is in now
  (`restoreFilterRule` keeps the current `sectionId`).

## Undo

`applyWithUndo(rule, apply)` is `updateFilter` for the field bar's "Apply to
all" / "Clear". It keeps `undo` only while the field stays clicked before and
after; `fieldUndo` is derived (`isUndoLive`). Any `updateFilter`,
`updateOtherFilters`, `removeWaitingField`, field click change, open or end
of edit drops it. `undoApply()` writes the rule back and restores waiting
fields. There is no toast.

## Highlighted field

`setHighlightedFieldId` clicks a field; use `clearHighlightedField()` for
every way out (it also drops that field's hover). The derived
`highlightedFieldId` is the clicked id only while it is a field of the
filter, a waiting field or the field of a live `fieldUndo`. Changing tab
keeps it.
