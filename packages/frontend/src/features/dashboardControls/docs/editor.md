# Editor, settings and dismissing

## Rail placement

- `ControlSidebar` is always rendered under the flag and returns null while
  nothing is edited, so the grid wrapper keeps its index in the row and never
  remounts. `CONTROLS_RAIL_LAYOUT` undoes `Group grow`'s equal split.
- `useRailTop` writes `--controls-rail-offset` (sticky `top` and the
  `max-height` subtraction) so Apply in the footer stays in view; below `sm`
  `useRailIntoView` scrolls the stacked rail under the stuck bar.

## Structure

`EditorShell` (`data-controls-editor`, the embed contract class) holds
`FilterEditor`, keyed by the filter id so the label draft and mount focus
restart on every switch. Body: label input (editors only), then a
placeholder's field search or `FilterSettings` (value, Section select,
"Tiles", "Rules"). Footer: Cancel (`discard`) and Apply (`close`, "Create"
for a new filter); with a `pendingRule` it becomes the switch question,
keeping the same Apply button so focus stays.

A viewer's own filter has no label input, no "Rules" and no Section.

## Label draft (`useLabelDraft`)

Commits after 300ms idle, on blur and on Enter. Blur commits synchronously,
which is what lets Apply, Cancel and Escape see the text. An all-space label
is written as no label (`withFilterRuleLabel`), so emptying it restores the
rule exactly.

## Focus on mount

The label input focuses itself on mount (`preventScroll`); a new filter's
field search (`[data-controls-start]`) instead. The first field keeps the
same editor mounted (same id), so the pick calls `focusLabelInput()`. A
viewer's new filter focuses `[data-controls-value]`.

## Fields and SQL columns

- `useFilterRuleField` resolves the field as the shipped bar does. A SQL
  column filter (`target.isSqlColumn`) has no field; its type is the
  column's, else `fallbackType`.
- Field search is always the shipped `FilterFieldSelect`. "Add another field"
  offers `getFieldCandidates` (same kind, via shipped `matchFieldByType`, not
  already a row).

## Settings rules

- Every edit is written at once (Apply only ends the edit) through
  `getFilterRuleWithDisabledState`: a rule with a value is never `disabled`;
  a required rule with no value always is.
- Incomplete default is the shipped reading: enabled and
  `!hasFilterValueSet(rule)` (`isDefaultValueIncomplete`). Nothing blocks
  closing; `close()` writes `disabled: true`.
- "Required" is the shipped `RequiredFilterCard`; the alternative filter it
  adds goes through `onChangeOtherFilterRule` = `updateOtherFilters`, so
  Cancel undoes it. Off restores the saved default (`savedDefaultRule`), so
  on then off is a no-op.
- The lock locks the saved tabs, else the tab in view; all changes go
  through `getFilterLockToggle` one tab at a time (one tracking event per
  tab).
- One edit is refused: any that leaves a locked, required filter with no
  value (`isLockedRequiredMissingValue`). The toggles that would reach it are
  disabled with a reason; a refused value edit remounts the shipped form
  (`key`) and shows the shipped message as `role="alert"`.
- Requirement alternatives are dimension and metric filters only.

## Escape (`useEditorDismiss`)

One capture listener on `document` while a filter is edited, so one press
does one thing, in order: an open layer (`hasOpenLayer`: `aria-expanded` or
Mantine `data-expanded`, or a modal) owns it; an element in
`[data-own-escape]` owns it; a clicked field is unclicked; else, with focus
in the editor, blur (commits the label) then withdraw a pending question or
cancel. From the page, Escape never cancels.

## Header guard

`DashboardHeaderGuard` is a `display: contents` wrapper with `inert` over the
shipped header, Save and Cancel included, while an editor's filter is open.
A viewer's edit never locks it.
