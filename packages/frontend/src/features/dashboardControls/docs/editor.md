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

`FilterEditor` keys the body by the filter id, so the view and the name
restart on every switch, and hands it the provider's state and callbacks:
the provider stays the only writer. A placeholder (no field) is
`PlaceholderEditor`: a new filter's field search, the shipped picker,
opened and alone (no hint, no footer); an existing filter left with no
field keeps its name, with Apply disabled. Every other filter is
`FilterPopover`, a component of props (the Storybook stories render it
through `stories/DashboardControls/StatefulPopovers.tsx`). Top to bottom:

- Prompt (while `isAsking`, `EditorPrompt`): "Apply changes to {filter}
  first?" with Discard (subtle) and Apply (default, `data-controls-apply`
  while it shows) takes focus as it appears (Discard when Apply is
  blocked). Everything under it is dimmed and `inert` meanwhile.
- Header, a sentence: the field's icon (`FieldIcon`, a SQL icon for a
  column), the name, the field's description as an info icon with a
  tooltip (only when it has one), the operator menu and, for editors, the
  "Rename" pencil.
- Name: the label, else the field's name (as the pill), else "Filter
  name". The pencil turns it into `NameInput` (`data-controls-label`,
  `data-own-escape`, named "Name", placeholder "Label for {field}" as the
  shipped "Filter label" input); blur and Enter commit through
  `withFilterRuleLabel` (all spaces is no label, so emptying it restores
  the rule exactly), Escape writes back the label it had when renaming
  started. Blur commits synchronously, so Apply, Cancel and Escape see the
  text. Focus goes back to the pencil (`useRefocusAfter` in
  `nameFocus.ts`, shared with section names). A viewer has no pencil.
- Operator menu (`controls.operatorLabel`, "Operator: {operator}"): the
  shipped options (`getFilterOperatorOptions`), each labelled as the
  operator itself, written with `getFilterRuleWithOperator` through the
  same edit rules as the value. For editors, where `supportsSingleValue`,
  an "Allow multiple values" checkbox ends the menu (the shipped "Single
  value / Multiple values" button); it is not an item, so toggling keeps
  the menu open, and its description says what viewers can pick.
- Value (`FilterValueSettings`): the shipped `FilterInputComponent` on its
  own, with the viewer's clear X (`ClearToAnyValueButton`, the shipped
  one) and a viewer's new filter's "Value" label. None for is null / is
  not null.
- Chips: "Applies to {n of m tiles} · Choose tiles" (m: the tiles that can
  take a filter, `canTileTakeFilter`, so it agrees with mapping's total),
  which enters mapping (`docs/fields-and-tiles.md`), wherever
  `canChooseTiles`; and, for editors, "Settings" with its summary
  (`getSettingsSummary`: section, required with its alternatives, lock),
  which wraps rather than truncates.
- Footer: Cancel (`discard`) and Apply (`close`), and, on a viewer's saved
  filter whose value differs from the saved one (`hasSavedFilterValueChanged`),
  the shipped "Reset to original value" button before them. It writes the
  saved value into the draft (`getFilterRuleRevertableObject`), so Apply
  still decides; the form remounts so every input shows it.
- Settings view, in place of the value and the chips: back arrow and the
  filter's name, Section (`SectionSetting`, when the dashboard has
  sections), then `ViewerControls` (Required, then Lock). Same footer.
  There is no Move left / Move right: Alt+Left / Alt+Right on a focused
  pill moves it (`docs/sections.md`).

A viewer's popover is the value view: the name, the operator, the value
and, on their own filter, the tiles chip.

## Focus on mount

The value input takes focus when the value view mounts (open, a new
filter's first field); the operator is a button, so the first input is the
value. A string value's list stays shut on focus (`openListOnFocus: false`,
see below) and waits for typing, a click or ArrowDown. Any other typed
input that owns a list (`aria-haspopup`, not read-only: the date inputs,
the searchable unit select) opens it on focus over the footer, so the
operator takes focus instead. Nothing under an open question
takes focus (it is `inert`). A new filter's field search
(`[data-controls-start]`) takes it when it opens. The back arrow takes it
when Settings opens, and Back gives it to the Settings chip
(`useSettingsChipFocus`). All with `preventScroll`: the popover is still
being placed. The first target is marked `data-autofocus` too, since the
focus trap hands focus to it once the popover is placed (`editorFocus.ts`).

## Fields and SQL columns

- `useFilterRuleField` resolves the field as the shipped bar does. A SQL
  column filter (`target.isSqlColumn`) has no field; its type is the
  column's, else `fallbackType`.
- A new filter's field search is the shipped `FilterFieldSelect`
  (`FieldsAndTiles`). Mapping's "Add a field" offers `getFieldCandidates`
  (same kind, via shipped `matchFieldByType`, not already a chip).

## Settings rules

- Edit mode edits the default: there is no "Provide default value" switch
  and the value input is always enabled
  (a `disabled` rule is shown enabled). An editor's edit is written as
  `disabled: !hasFilterValueSet(rule)`: a value is in effect, no value is any
  value. A viewer's goes through `getFilterRuleWithDisabledState`. An editor
  may apply a required filter with no value: it is written `disabled: true`,
  for viewers to set, as the shipped form does.
- `close()` still writes `disabled: true` on an enabled rule with no value
  (`isDefaultValueIncomplete`), for rules that arrive that way.
- "Required" is the shipped `RequiredFilterCard` without its card
  (`withCard={false}`), which marks it with an asterisk, as the pill; the alternative filter it
  adds goes through `onChangeOtherFilterRule` = `updateOtherFilters`, so it
  waits in the draft with the rest. Off restores the saved default
  (`savedDefaultRule`), so on then off is a no-op.
- The lock locks the saved tabs, else the tab in view; all changes go
  through `getFilterLockToggle` one tab at a time (one tracking event per
  tab).
- One edit is refused: any that leaves a locked, required filter with no
  value (`isLockedRequiredMissingValue`), an operator change included
  (`useRuleEdits`). The toggles that would reach it are disabled with a
  reason; a refused edit remounts the value input (`key`), gives focus back
  to the input it came from, and shows the shipped message as
  `role="alert"`.
- Requirement alternatives are dimension and metric filters only.
- Apply is disabled, with the shipped wording as a tooltip
  (`getApplyBlockedReason`; `useApplyBlockedReason` for the mapping row's
  Apply): for an editor, while the filter reaches no tile or is locked and
  required with no value; for a viewer, while a required filter they
  cleared, or a required group with no other member with a value (read
  from the draft, `editorFilters`), has no value. As with the flag off, a
  rule still off (`disabled`) was not cleared and applies unchanged: an
  untouched filter saved with no value, or a group member the viewer's edit
  wrote as any value. Save keeps a value the editor set on a
  required filter as its default.

## Escape (`useEditorDismiss`)

One capture listener on `document` while a filter is edited, so one press
does one thing, in order: an open layer (`hasOpenLayer`: `aria-expanded` or
Mantine `data-expanded`, a modal, or a date calendar's `[data-dates-dropdown]`,
since Mantine's `DateInput` drops its roles) owns it; an element in
`[data-own-escape]` owns it; a clicked field is unclicked; else, with focus
in the editor or lost to the page (`body`), blur (commits the label) then
withdraw a pending question or cancel. From elsewhere on the page Escape
never cancels; while the prompt asks, Escape withdraws it wherever focus is.
A withdrawn question hands focus back to the editor (Apply, else its first
enabled control) once it has left.

So every open layer closes itself on Escape, a value input whose popover
keeps focus on the input (multi-date, quarter, invalid date, paste prompt)
closes it from the input's own Escape: Mantine's popover only hears Escape
from inside its dropdown.

A `pointerdown` outside the editor and the pills acts as a click outside a
popover: nothing while a layer is open (the press closes it, or acts
inside it), else
`requestClose` cancels the edit, unapplied changes included, and never asks
(only a pill or Add asks); its `mousedown` is left alone. A new
filter with nothing picked has nothing to lose: a press outside dismisses it
even with its list open, unless the press is on that list.

## Header guard

`DashboardHeaderGuard` is a `display: contents` wrapper with `inert` over the
shipped header, Save and Cancel included, while an editor's filter is open.
A viewer's edit never locks it.
