# Provider contract (`useControlsSidebar`)

`ControlsSidebarProvider.tsx` owns the edit; pure helpers are in
`sidebarState.ts`. The editor popover is on screen exactly while a filter is
edited: there is no separate list or open state.

## The draft

- Opening a filter copies its filter set into `draft`. `updateFilter`,
  `updateOtherFilters`, `addFirst*`, `removeLastField` and the field bar's
  applies write the draft only (`writeFilters`); the context's `editingRule`
  reads it. Tiles query the dashboard's filters, so they keep their results.
- Apply (`close`) writes the edited rule and `touchedFilterIds` onto the
  dashboard once (`applyDraft`, in each rule's current section), raises
  "changed", then ends the edit. A clean edit writes nothing.
- Cancel (`discard`) drops the draft: nothing of it reached the dashboard.
- Mapping (`startMapping`, `SidebarState.mappingStart`) writes tile targets
  to the same draft. Its Apply is `close`; `cancelMapping` puts the rule back
  as mapping found it (the value cannot change meanwhile) and the popover
  returns; `endMapping` (the row's back arrow) returns to the popover with
  the tile choices kept in the draft, for its Apply or Cancel. Both drop the
  undo, the clicked field and waiting fields. Escape in mapping (`dismiss`) never drops tile changes: with
  none since `mappingStart` it returns to the popover, else it does nothing
  (the row's Cancel is the one discard). A press outside does nothing.
- A section move is no edit: `updateFilter` writes a changed `sectionId` to
  the dashboard at once as well, and Cancel keeps it.
- Outside an edit (a link prompt), `updateFilter` writes the dashboard at
  once. Writes from outside (a drag, another pill's X) go to the dashboard;
  the draft never sees them, and Apply leaves them in place.

## Reading the context

- It is a `use-context-selector` context. Use
  `useControlsSidebarSelector((c) => c.x)` anywhere rendered per tile, per
  pill or around the page; `useControlsSidebar()` re-renders on every change,
  hover included.
- Callbacks keep one identity for the provider's life. They read
  `latest.current` (synced after each render, written eagerly by the
  `write*` helpers) so two calls in one event agree, e.g. `updateFilter` then
  `close`.
- `isSidebarOpen`, `highlightedFieldId`, `isAsking` and `fieldUndo` are
  derived on render. An existing rule removed from the dashboard from outside
  closes the editor at once; the next `open`/`openNew` starts over. A new
  rule lives only in the draft until Apply.

## Modes

- Mode is the route's, or the provider's `isEditMode` input (embeds). An
  edit belongs to the mode it started in (`SidebarState.isViewer`) and keeps
  writing that edit's filter set (`SidebarState.filterSet`).
- A viewer's own filter and a viewer's new one are on the temporary filters
  (`setDashboardTemporaryFilters`), new rules made `isTemporary` and through
  `getFilterRuleWithDisabledState(rule, false)`. A viewer's saved filter
  opens too; its Apply goes through the shipped
  `updateDimensionDashboardFilter` / `updateMetricDashboardFilter` in view
  mode, so the URL carries the override and nothing is saved.
- A mode change closes the edit as Apply does, in the one effect that writes
  the store. In the app the header is inert while editing, so it only meets
  browser Back, a typed URL, or an embed's `isEditMode`.

## Opening and switching

- `openNew()` opens a placeholder (no field, no pill, the popover anchored
  on "Add filter"). A clean edit is applied first; one with unapplied changes
  asks as a pill switch does (`pending = { kind: 'new', sectionId }`).
  `addFirstField` / `addFirstSqlColumn` turn it into a filter on every tile
  that offers the field. Until Apply it is only in the draft; `FilterPills`
  draws it last in its group as the open, dashed draft pill, from the rule
  with `disabled: true` (the bar shows the dashboard as it is), and the
  popover moves to it.
- `open(id)` on a pill: nothing edited, it opens. Same pill: closes if no
  unapplied changes, else focuses Apply. Another pill: closes and opens if
  clean; with unapplied changes keeps `pending = { kind: 'open', filterId }`
  (`getPending` treats a vanished rule as none) and the popover asks at its
  top (`isAsking`).
- A press outside the editor (`useEditorDismiss`, `pointerdown`, never on a
  pill or while a list is open) cancels the edit as Cancel does, unapplied
  changes and any pending question included, and never asks: what was
  clicked (a tile's data-point menu, a cell) acts at once.
- `resolvePending(isApply)` applies or discards, then opens the pill clicked
  or the new filter asked for, if any.
- "Unapplied changes" is `hasUnappliedChanges`, i.e. `isDirty`: a new filter
  without a field has none.

## Ways out

- `close()` (Apply) commits the draft (see above). A rule that cannot be
  kept (`canKeepFilterRule`: no field) is dropped: an existing one leaves the
  dashboard as "Remove filter"; a viewer's new filter with no value is kept
  as any value (`disabled`) and tracked; an empty enabled default is written
  `disabled: true`.
- `discard()` (Cancel) drops the draft; removing the edited filter takes it
  off the dashboard and drops the draft. Writes from outside the editor
  survive. Saving to the server stays with the dashboard's Save.
- `removeLastField(label)` takes the rule out of the draft and reopens a
  placeholder with the same id, label, `required`, `requiredGroupId`,
  `lockedTabUuids`; the next `addFirst*` puts it back at its old index. The
  dashboard keeps the rule until Apply.
- `haveFiltersChanged` is settled on every way out (`settleFiltersChanged`):
  lowered only if the editor raised it and temporary filters are as they
  were, so a flag shipped code raised is never lowered.
- Every way out clears waiting fields and, once the editor has unmounted
  (`FocusReturn`, rendered after children), focuses the control's pill
  (`data-controls-pill`) or "Add filter". A switch moves no focus.

## Dirty and "changed"

- Rules compare as they would save: `undefined` keys and default tile
  targets (`withoutDefaultTileTargets`) leave no trace; `required: false`,
  `disabled: false` and an absent key are equal; `lockedTabUuids` is a set.
- Never normalised: a `false` tile exclusion (copied by duplicated tiles, and
  applies if the tile later gains the field) and whether `tileTargets` exists
  (required-filter tab gating reads it).
- `isDirty` compares the draft with the snapshot taken on open, and also
  counts other rules the editor wrote (`haveOtherFilterRulesChanged`).
  Section membership never counts: a move by the Section select or the bar's
  drag applies to the dashboard at once, and Apply keeps each rule in the
  section it is in on the dashboard (`applyDraft`).

## Undo

`applyWithUndo(rule, apply)` is `updateFilter` for the field bar's Filter /
Clear, for "Add a field" (`kind: 'add'`) and for a tile card's write on the
clicked field (a pick in its select is `kind: 'pick'`). It keeps `undo` only while the field stays clicked before and
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
