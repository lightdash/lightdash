# Editor, settings and dismissing

## Popover

- `EditorPopover` (`FilterEditor.tsx`) wraps each pill (`FilterPill`) and
  "Add filter" (`AddControl`), which anchors a new filter until its field is
  picked. Then the new filter's draft pill takes the editor. It opens
  when its filter is edited, under the target, set up as the shipped pill's
  popover (`bottom-start`, arrow, `offset` 1, portalled), so the grid never
  moves. Mantine's transition is off (`duration: 0`), so closing is
  immediate; the dropdown arrives with its own CSS animation on mount
  (`.dropdown`: a fade and 4px settle, none under reduced motion). That
  also plays when the editor moves from "Add filter" to a new pill, which
  mounts already open, and nothing is drawn at the old spot.
- Focus stays inside while it is open (`trapFocus`); `FocusReturn` hands it
  back to the pill once it closes.
- Mantine's Escape, click outside and roles are off: the provider owns both
  (`useEditorDismiss`), and an `aria-expanded` target would read as an open
  list to `hasOpenLayer`. The dropdown carries `data-controls-editor` and the
  embed's `rail` and `filterDropdown` classes; its body is a `dialog` named
  by the filter.
- No tile overlay or card shows while a filter is open; they belong to
  mapping, while which the popover stays closed (`isMapping`).

## Structure

`FilterEditor`, keyed by the filter id so the label draft and the view
restart on every switch. Top to bottom: the prompt (while `isAsking`), a
placeholder's field search or `FilterSettings`, the footer. A new filter's
field search is the shipped picker, opened, and alone: no hint, no footer.

- `FilterSettings`, value view: the name as its title (`FilterName`), the
  shipped value form (`FilterValueSettings`), then two quiet rows: "Applies
  to {n tiles}" (`formatTileCount`, `useAppliedTileCount`) with "Choose
  tiles", which enters mapping (`docs/fields-and-tiles.md`), wherever
  `canChooseTiles`; and, for editors, "Settings".
- Name: the label, else the field's name (as the pill), as plain text. An
  editor's has a "Rename" pencil after it (as the dashboard header's) that
  turns it into the input (`data-controls-label`, `data-own-escape`, named
  "Name", placeholder "Label for {field}" as the shipped "Filter label"
  input); blur and Enter commit, Escape reverts to the label it had when
  renaming started. Focus goes back to the pencil (`useRefocusAfter` in
  `nameFocus.ts`, shared with section names). Text and input share one
  height (`--controls-name-height`). A viewer's has no pencil.
- Settings view, in place: back arrow, Section, then `ViewerControls`
  (Required, then Lock). Same footer.
- Footer: Cancel (`discard`) and Apply (`close`), for a new filter too.
- Prompt: "Apply changes to {filter} first?" with Discard (subtle) and Apply
  (default, `data-controls-apply` while it shows) takes focus as it appears
  (Discard when Apply is blocked). Everything under it, value, rows and
  footer, is dimmed and `inert` meanwhile.

A viewer's popover is the value view: the name, the value and, on their own
filter, "Applies to" with "Choose tiles".

## Label draft (`useLabelDraft`)

Held by `FilterEditor`, so a trip to Settings keeps it. Commits after 300ms idle, on blur
and on Enter. Blur commits synchronously, which is what lets Apply, Cancel
and Escape see the text. An all-space label is written as no label
(`withFilterRuleLabel`), so emptying it restores the rule exactly.

## Focus on mount

The value input after the operator takes focus when the value view mounts
(open, back from Settings, a new filter's first field). A string value's
list stays shut on focus (`openListOnFocus: false`, see below) and waits
for typing, a click or ArrowDown. Any other typed input that owns a list
(`aria-haspopup`, not read-only: the date inputs, the searchable unit
select) opens it on focus over the footer, so the operator takes focus
instead; a new filter's field
search (`[data-controls-start]`) when it opens. The back arrow takes it when
Settings opens. All with `preventScroll`: the popover is still being placed.
The first target is marked `data-autofocus` too, since the focus trap hands
focus to it once the popover is placed.

## Fields and SQL columns

- `useFilterRuleField` resolves the field as the shipped bar does. A SQL
  column filter (`target.isSqlColumn`) has no field; its type is the
  column's, else `fallbackType`.
- A new filter's field search is the shipped `FilterFieldSelect`
  (`FieldsAndTiles`). Mapping's "Add a field" offers `getFieldCandidates`
  (same kind, via shipped `matchFieldByType`, not already a chip).

## Settings rules

- Edit mode edits the default: there is no "Provide default value" switch
  (`withDefaultValueSwitch={false}`) and the value input is always enabled
  (a `disabled` rule is shown enabled). An editor's edit is written as
  `disabled: !hasFilterValueSet(rule)`: a value is in effect, no value is any
  value. A viewer's goes through `getFilterRuleWithDisabledState`. Apply is
  still refused for a required filter with no value.
- `close()` still writes `disabled: true` on an enabled rule with no value
  (`isDefaultValueIncomplete`), for rules that arrive that way.
- "Required" is the shipped `RequiredFilterCard`; the alternative filter it
  adds goes through `onChangeOtherFilterRule` = `updateOtherFilters`, so it
  waits in the draft with the rest. Off restores the saved default
  (`savedDefaultRule`), so on then off is a no-op.
- The lock locks the saved tabs, else the tab in view; all changes go
  through `getFilterLockToggle` one tab at a time (one tracking event per
  tab).
- One edit is refused: any that leaves a locked, required filter with no
  value (`isLockedRequiredMissingValue`). The toggles that would reach it are
  disabled with a reason; a refused value edit remounts the shipped form
  (`key`) and shows the shipped message as `role="alert"`.
- Requirement alternatives are dimension and metric filters only.
- Apply (editors only) is disabled, with the shipped wording as a tooltip,
  while a required filter has no value, a required group has no member with
  a value (read from the draft, `editorFilters`), or the filter reaches no tile
  (`useApplyBlockedReason`, shared with the mapping row's Apply). Save keeps a required filter's value as its
  default.

## Escape (`useEditorDismiss`)

One capture listener on `document` while a filter is edited, so one press
does one thing, in order: an open layer (`hasOpenLayer`: `aria-expanded` or
Mantine `data-expanded`, or a modal) owns it; an element in
`[data-own-escape]` owns it; a clicked field is unclicked; else, with focus
in the editor or lost to the page (`body`), blur (commits the label) then
withdraw a pending question or cancel. From elsewhere on the page Escape
never cancels; while the prompt asks, Escape withdraws it wherever focus is.
A withdrawn question hands focus back to the editor (Apply, else its first
enabled control) once it has left.

A `pointerdown` outside the editor and the pills acts as a click outside a
popover: nothing while a list is open (the press closes it), else
`requestClose` cancels the edit, unapplied changes included, and never asks
(only a pill or Add asks); its `mousedown` is left alone. A new
filter with nothing picked has nothing to lose: a press outside dismisses it
even with its list open, unless the press is on that list.

## Header guard

`DashboardHeaderGuard` is a `display: contents` wrapper with `inert` over the
shipped header, Save and Cancel included, while an editor's filter is open.
A viewer's edit never locks it.
