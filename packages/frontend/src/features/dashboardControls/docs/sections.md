# Sections

A section is a named, ordered set of controls. Call it _section_, never
_group_ (that is `requiredGroupId`).

## Saved shape

- `DashboardConfig.controlSections`: `{ id, name, collapsed?, inline? }[]`
  in display order. `collapsed` is absent until an editor sets
  it; then `isCollapsedByDefault` reads it, else more than
  `COLLAPSED_BY_DEFAULT_ABOVE` members starts collapsed.
- `inline: true` puts a section on the bar line of the section before it;
  absent, it starts a line of its own (`groupSectionsIntoLines`; the first
  section always starts one). Only `true` is written, never on a line's first
  section. Read only while no order is stored.
- `DashboardConfig.controlOrder`: every control of every kind, in bar
  order, `newLine: true` where one starts a bar line. Absent or `[]`: no
  order, the bar as above. See "Order" below.
- `DashboardConfig.parameterSections`: parameter name to section id.
- Membership: `DashboardFilterRule.sectionId`, `DateZoomControl.sectionId`. No
  section, or a `sectionId` with no matching section, is unsectioned and
  renders first.
- The keys must survive every rewrite: `applyDimensionOverrides` /
  `applyMetricOverrides`, `adoptPlaceholder` and the emptied placeholder in
  `ControlsSidebarProvider`; `buildDashboardConfig` carries
  `parameterSections` forward and saves `controlSections` from the store
  once `haveControlSectionsChanged`. Embeds don't apply the language map to
  section names yet.

## Order

- Stored only when the editor reorders: a drag, a keyboard move, a line
  change, or any section change (a drag in or out, the editor's Section
  setting, the selection bar's moves, a new section taking pills). Every
  other edit (a value, a rename, a fold, adding or removing a control or a
  section) keeps what is stored, which may be none.
- A section change places the control last in its new section, or right
  after the section it left, on that section's line (`placeSectionChanges`,
  through `useOrderSectionChanges` from the store state before the write).
- The edit slice holds the order (`controlOrder`, seeded by
  `syncControlOrder` unless `hasControlOrderChanged`); `arrangeControls`
  writes one at once, like a section move, and the page's Cancel puts the
  saved one back. `selectOrderedControls` is the bar's list:
  `reconcileDashboardControlOrder` over `getEffectiveControlOrder`, which
  reads `[]` as none and puts never saved parameter controls before the
  first section.
- Save (`getControlOrderToSave`): only after a reorder, the full reconciled
  list (never `[]`), each kind's list (filters, parameter controls,
  sections) sorted to follow it, and the parameter controls with it, so
  their per-load ids become stable. Otherwise `buildDashboardConfig` carries
  the stored order forward, as a flag-off save does.

## State

- `controlSections` and `haveControlSectionsChanged` live in the store's
  `edit` slice (`dashboardEditReducer.ts`). `syncControlSections` seeds from
  the saved config unless edits are staged; the page's Cancel calls it.
- Reducers spread the section, so `collapsed` and `inline` survive
  a rename. New sections are appended, on a line of their own.
- `removeControlSection` keeps the next section's line start
  (`removeSectionKeepingLines`).
- Membership is written with `setDashboardFilters` by the bar (drag,
  selection, remove) plus `setHaveFiltersChanged(true)`, and by the editor's
  Section select through `updateFilter`, which writes it to the dashboard
  at once with its order (the filter's Cancel keeps both).
- Pure helpers: `sections.ts` (`groupRulesBySection`, `moveRuleToSection`,
  `moveRulesToSection`, `removeSectionFromRules`, `underPointerFor`,
  `countSectionChanges`, `groupSectionsIntoLines`,
  `removeSectionKeepingLines`; the order's `placeControl`, `moveControlBy`,
  `placeSectionChanges`, `getShownBarLines`, `toControlRefs`,
  `followOrder`).

## Bar (`SectionedFilters`)

- In edit mode `ControlsBar` always renders `SectionedFilters`; in view mode
  only once the dashboard has sections. With no stored order: "Add filter",
  unsectioned pills, one capsule per section, then (edit mode) the "New
  section" entry slot, so creating a section moves nothing before it.
- With a stored order, one `.orderLine` per bar line: the first holds "Add
  filter", then every control in the order, kinds mixed (runs of one kind
  go to `FilterPills` `ruleIds` / `ParameterPills` `ids`); a capsule holds
  its members in the order. A capsule sits in a `.line` slot, so under 720px
  it takes a line of its own. The last line ends with the new filter's
  pill, temporary and viewer's own pills and "needs value" pills; "New
  section" is last, on its own line.
- Lines:
    - Sections always sit below the filters outside any section, then one
      `.sectionLine` per saved line. The New section entry, and a section
      being named, take a line of their own after them (inline after the
      filters while there are no sections).
    - A fold never moves a section to another line; an open section lays
      its filters side by side and wraps them inside its outline.
    - Under 720px of bar (the app's `.content`, the embed's `.filterArea`
      container), every capsule and "New section" take their own line.
- An editor sees every section (each is a drop target); a viewer only those
  with a member visible on this tab.
- An editor's chevron writes the saved `collapsed` (back to `undefined` when
  it returns to the size rule's value), marking the dashboard changed. A
  viewer's fold is local for the visit (`flippedIds`) and resets on mode
  change.
- `SectionedFilters` owns one popover state so one saved popover is open
  across the whole bar.
- While a filter is edited, capsule names and actions are inert; the
  chevron still folds.

## Drag and drop

- One `DndContext` in `SectionedFilters`; sectioned passes of `FilterPills`
  open no context and wrap pills in `PillDraggable`. Only the flat bar keeps
  the shipped per-group contexts.
- An editor drags the pill itself (no grip): `PillDraggable` forwards a
  pointer down on its `[data-controls-pill]` to dnd-kit's `onPointerDown`
  alone (PointerSensor, 5px, on the flat bar too), so a click opens the
  editor, the click ending a drag is swallowed, and Enter and Space keep
  opening it. A pointer down in the portalled editor never drags. While a
  filter is edited, or the fields load, no pill drags. Cursor `grab`, then
  `grabbing` (`.pillDrag`).
- Keyboard reorder: in edit mode Alt+ArrowLeft / Alt+ArrowRight on a
  focused pill moves it one place among
  `getMoveNeighbours` (its kind, its section or the unsectioned run, shown
  on the tab). `moveFilter(id, 'left' | 'right')` finds the neighbour from
  the provider's latest state and writes the dashboard at once, as a
  section move (no edit, Cancel keeps it), refocuses a focused pill and
  announces the move in the provider's status region (edit mode only; a
  counter key re-announces the same text). An end stays focusable
  (`data-disabled`).
- Each saved pill's `DroppableArea` is its target. On the sectioned bar its
  2px line takes the side from the bar order (`barOrder`, every control),
  for a control of any kind; the flat bar keeps the kind's filter order.
- Targets: every saved pill, each capsule, the first button
  (`UNSECTIONED_TARGET_ID`), "New section" (`NEW_SECTION_TARGET_ID`), the
  line gaps and the bar's empty space (`BAR_SPACE_TARGET_ID`), which also
  catches a pointer on no target. Resolution is `underPointerFor` (pointer
  first, `closestCenter` for the keyboard, which leaves line gaps to section
  drags); a section drag meets capsules, line gaps, the first button and
  controls outside every section.
- Every drop is a placement (`placementOf`, `placeControl`): beside a
  control it joins that control's line and section, on the side it moves
  towards (a section never enters one; over a capsule a section takes the
  side of its centre the dragged copy's centre is, `data-section-drop`);
  on a capsule a control joins it last; on the gap above a line, or below
  the last (`LineGap`, `lineGapTargetId`), it takes a line of its own; on
  the first button it ends the first line; a member on the bar's empty
  space lands right after its section (the line on that capsule,
  `data-loose-end`). A section change writes the membership too.
  `handleDragMove` keeps the one drop line in `sectionDrop`, and only for a
  drop that moves something. A no-op drop writes nothing.
- Keyboard (`BarMoveContext`, `moveControlBy`), on a pill or a section's
  name: Alt+ArrowLeft / Alt+ArrowRight go one place along the bar across
  kinds, stepping over a capsule (inside one, among its members);
  Alt+ArrowUp / Alt+ArrowDown join the end of the line above or below, a
  line of its own at the bottom when it shares one (the first line is "Add
  filter"'s). The control keeps focus; the status region says where it is.
  A drag made before a filter opened survives its Cancel and is no edit. Capsule drag is off while a filter is edited.
- Nothing changes size during a drag; feedback is drop lines, not slots.

## Selection

- Edit mode only, sectioned bar only. Cmd/Ctrl toggles, Shift selects a
  range in bar order (`rangeBetween`, folded capsules skipped); a plain
  click clears and opens. Shared via `BarSelectionContext`.
- A selection never lives alongside an edit: it is emptied in render as
  `isSidebarOpen` turns on, and pills are not selectable then.
- `SelectionBar` floats where the field bar does (`useBarHost`). Moves use
  `moveRulesToSection`, one write. Dragging a picked pill while several are
  picked carries them all.
- It offers only moves that change something: "Move to" leaves out the
  section every picked filter is in (`sharedSectionId`), "No section" shows
  only while one is in a section (`isAnyInSection`), and "Shift click for a
  range" only while one filter is picked.

## Naming

`SectionNameInput` reports how naming ended (`NameExit`, `nameFocus.ts`); the
bar moves focus only when it is not `elsewhere`. Every way to start a section puts
`NewSection` in the end slot; a committed name dispatches
`addControlSection` and moves the picked pills in.
