# Sections

A section is a named, ordered set of controls. Call it _section_, never
_group_ (that is `requiredGroupId`).

## Saved shape

- `DashboardConfig.controlSections`: `{ id, name, collapsed? }[]` in display
  order. Absent `collapsed` means the size rule (`isCollapsedByDefault`).
  Line placement lives only in `controlOrder`; a save drops the `inline` that
  earlier versions stored.
- `DashboardConfig.controlOrder`: every control of every kind in bar order,
  `newLine: true` where one starts a line. Absent or `[]` means no order: the
  bar is the same as main.
- Membership lives on the control (`DashboardFilterRule.sectionId`,
  `DashboardParameterControl.sectionId`, `DateZoomControl.sectionId`). A
  `sectionId` with no matching section counts as unsectioned.
- These keys must survive every rewrite: the dimension and metric overrides,
  `adoptPlaceholder`, and `buildDashboardConfig`.
- Dashboard files never hold section ids: see "Dashboard files (as code)" in
  `../AGENTS.md`.

## Rules

- **An order is stored only after a reorder.** That means a drag, a keyboard
  move, any section change (by drag, the editor's Section setting, or the
  selection bar), or adding a section. Every other edit keeps what is
  stored, which may be none.
  The save (`getControlsToSave`) writes the full reconciled list, never `[]`,
  and sorts each kind's array to follow it. A flag-off save carries the
  stored order forward.
- **A reorder or a new section freezes never-saved parameter controls.** Their ids are made per
  load, so `arrangeControls` marks them changed and the save stores them with
  the order. An order that doesn't list them shows them before the first
  section (`getEffectiveControlOrder`).
- **A section change places the control last in its new section,** or right
  after the section it left (`placeSectionChanges`).
- **The bar reads `selectOrderedControls`.** Section and order state lives in
  the store's `edit` slice. The page's Cancel restores both from the saved
  config.
- **Which bar renders:** in edit mode, always `SectionedFilters`. In view
  mode and embeds, `SectionedFilters` once there are sections or a stored
  order; otherwise the flat bar.

## Bar layout

- No stored order: "Add filter", unsectioned pills, one capsule per section
  on its own line, then "New section" (edit mode). Adding a section, the
  first included, stores the bar's order with the new section last and no
  `newLine`, so it ends the bar's last line (`addControlSection`).
- "New section" and a new section's name input end the last line, where the
  new section lands: inline after the pills for the first.
- Stored order: one `.orderLine` per line. "Add filter" is first on line one,
  kinds are mixed, and a capsule holds its members in order. Unsaved pills
  ("needs value", temporary and the viewer's own) end the last line.
- Under 720px of bar width, every capsule takes its own line.
- A fold never moves a section. An editor's fold writes `collapsed`; a
  viewer's fold lasts for the visit only. Viewers see only sections with a
  visible member on the tab.

## Drag and drop

- One `DndContext` in `SectionedFilters`. The pill itself is the handle
  (PointerSensor, 5px), so a click still opens the editor. Nothing drags
  while a filter is edited.
- A section drags from anywhere on its capsule except its pills (their own
  drag) and its trailing "+" and "..." (`data-section-actions`). A click on
  the chevron still folds and on the name still renames.
- **A pointer drag drops at the insertion point nearest the pointer**
  (`chooseInsertionPoint` in `insertionPoints.ts`, over `measureBar`'s rects).
  What the drop line shows is where the control lands; there is never more
  than one line and there are no dead zones.
    - The candidate points are before each item and after a row's last item.
      "Add filter" is the first slot. The gaps between lines, and up to 40px
      below the last line, start a new line.
    - Over a capsule's head, the drop goes before it. Over its trailing actions,
      after it. Over its members, between them. In a folded or empty capsule,
      anywhere past the head joins it.
    - A dragged section sees only outside points and line gaps.
- The keyboard drag keeps dnd-kit's targets (`underPointerFor`), mapped by
  `placementOf`.
- Alt+arrows (`BarMoveContext`, `moveControlBy`): Left and Right move one place
  along the bar across kinds, stepping over a capsule. Up and Down join the
  line above or below.
- Feedback is one `DropLine` (2px, pill height). Nothing resizes while
  dragging. The drag copy floats beside the pointer (`besidePointer`), so it
  never covers the line.

## Selection

- Edit mode only. Cmd/Ctrl-click toggles a control, Shift-click selects a
  range in bar order, and a plain click clears the selection and opens the
  editor. Opening the editor empties the selection.
- `SelectionBar` offers only moves that change something. Dragging a picked
  pill carries the whole selection, which lands in bar order.

## Naming

`SectionNameInput` reports how naming ended (`NameExit`, `nameFocus.ts`); the
bar moves focus only when it is not `elsewhere`. A committed name dispatches
`addControlSection` and moves the picked pills in.
