# Sections

A section is a named, ordered set of controls. Call it _section_, never
_group_ (that is `requiredGroupId`).

## Saved shape

- `DashboardConfig.controlSections`: `{ id, name, collapsed? }[]` in display
  order. `collapsed` is absent until an editor sets it; then
  `isCollapsedByDefault` reads it, else more than
  `COLLAPSED_BY_DEFAULT_ABOVE` members starts collapsed.
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
- Reducers spread the section, so `collapsed` survives a rename. New
  sections are appended.
- Membership is written with `setDashboardFilters` by the bar (drag,
  selection, remove) plus `setHaveFiltersChanged(true)`, and by the editor's
  Section select through `updateFilter` (so Cancel puts it back).
- Pure helpers: `sections.ts` (`groupRulesBySection`, `moveRuleToSection`,
  `moveRulesToSection`, `removeSectionFromRules`, `underPointerFor`,
  `countSectionChanges`).

## Bar (`SectionedFilters`)

- In edit mode `ControlsBar` always renders `SectionedFilters`; in view mode
  only once the dashboard has sections. Order: "Add filter", unsectioned
  pills, one capsule per section, then (edit mode) the "New section" entry
  slot, so creating a section moves nothing before it.
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
  open no context and wrap pills in `BarDraggable`. Only the flat bar keeps
  the shipped per-group contexts.
- Targets: every saved pill, each capsule, the first button
  (`UNSECTIONED_TARGET_ID`), "New section" (`NEW_SECTION_TARGET_ID`) and the
  bar's empty space (`BAR_SPACE_TARGET_ID`), which also catches a pointer on
  no target. Resolution is `underPointerFor` (pointer first, `closestCenter`
  for the keyboard); a section drag only meets capsules.
- Drops go through `moveRuleToSection`; a no-op drop writes nothing.
  Every pill's drag, the edited one's included, survives Cancel and is no
  edit. Capsule drag is off while a filter is edited.
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

## Naming

`SectionNameInput` reports how naming ended (`NameExit`); the bar moves focus
only when it is not `elsewhere`. Every way to start a section puts
`NewSection` in the end slot; a committed name dispatches
`addControlSection` and moves the picked pills in.
