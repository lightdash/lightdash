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
  section.
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

## State

- `controlSections` and `haveControlSectionsChanged` live in the store's
  `edit` slice (`dashboardEditReducer.ts`). `syncControlSections` seeds from
  the saved config unless edits are staged; the page's Cancel calls it.
- Reducers spread the section, so `collapsed` and `inline` survive
  a rename. New sections are appended, on a line of their own.
- `arrangeControlSections` writes a new order and lines at once (a drag, a
  keyboard move, "Move to its own line"), from `placeSection` /
  `moveSectionBy`; `removeControlSection` keeps the next section's line
  start (`removeSectionKeepingLines`).
- Membership is written with `setDashboardFilters` by the bar (drag,
  selection, remove) plus `setHaveFiltersChanged(true)`, and by the editor's
  Section select through `updateFilter` (so Cancel puts it back).
- Pure helpers: `sections.ts` (`groupRulesBySection`, `moveRuleToSection`,
  `moveRulesToSection`, `removeSectionFromRules`, `underPointerFor`,
  `countSectionChanges`, `groupSectionsIntoLines`, `placeSection`,
  `moveSectionBy`, `removeSectionKeepingLines`).

## Bar (`SectionedFilters`)

- In edit mode `ControlsBar` always renders `SectionedFilters`; in view mode
  only once the dashboard has sections. Order: "Add filter", unsectioned
  pills, one capsule per section, then (edit mode) the "New section" entry
  slot, so creating a section moves nothing before it.
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
- Each saved pill's `DroppableArea` is its target, on both bars. Its 2px
  line takes the side from the kind's filter order (where `arrayMove` lands
  the pill), and shows none for a pill of the other kind or a capsule.
- Targets: every saved pill, each capsule, the first button
  (`UNSECTIONED_TARGET_ID`), "New section" (`NEW_SECTION_TARGET_ID`) and the
  bar's empty space (`BAR_SPACE_TARGET_ID`), which also catches a pointer on
  no target. Resolution is `underPointerFor` (pointer first, `closestCenter`
  for the keyboard); a section drag only meets capsules and the line gaps.
- A section drag: over a capsule it joins that capsule's line on the side of
  its centre the dragged copy's centre is (`data-section-drop`); over the gap
  above a line, or below the last (`LineGap`, `sectionLineTargetId`), it
  takes a line of its own there. `handleDragMove` keeps the one drop line in
  `sectionDrop`, and only for a drop that moves something.
- Keyboard: Alt+ArrowLeft / Alt+ArrowRight on a section's name go one place
  along the bar, joining the neighbour's line; Alt+ArrowUp /
  Alt+ArrowDown join the line above or below (a line of its own at the top
  or bottom when it shares one). The name keeps focus.
- Drops go through `moveRuleToSection`; a no-op drop writes nothing.
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
