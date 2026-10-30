# Editor, settings and dismissing

## Popover

- `EditorPopover` (`FilterEditor.tsx`) wraps each pill (`FilterPill`) and,
  for a new filter with no pill yet, "Add filter" (`AddControl`). It opens
  when its filter is edited, under the target, set up as the shipped pill's
  popover (`bottom-start`, arrow, `offset` 1, portalled), so the grid never
  moves. It arrives with `usePopoverTransition` (`popoverMotion.ts`): a fade
  and 4px settle at Mantine's duration, none under reduced motion.
- Focus stays inside while it is open (`trapFocus`); `FocusReturn` hands it
  back to the pill once it closes.
- Mantine's Escape, click outside and roles are off: the provider owns both
  (`useEditorDismiss`), and an `aria-expanded` target would read as an open
  list to `hasOpenLayer`. The dropdown carries `data-controls-editor` and the
  embed's `rail` and `filterDropdown` classes; its body is a `dialog` named
  by the filter.
- No tile overlay or card shows while a filter is open; they belong to
  mapping.

## Structure

`FilterEditor`, keyed by the filter id so the label draft and the view
restart on every switch. Top to bottom: the prompt (while `isAsking`), a
placeholder's field search or `FilterSettings`, the footer.

- `FilterSettings`, value view: the shipped value form (`FilterValueSettings`),
  then for editors two quiet rows: "Applies to {n tiles}" (`formatTileCount`,
  `useAppliedTileCount`) with "Choose tiles" (disabled until mapping), and
  "Settings".
- Settings view, in place: back arrow, Name (the label input), Section,
  then `ViewerControls` (Required, then Lock). Same footer.
- Footer: Cancel (`discard`) and Apply (`close`, "Create" for a new filter).
- Prompt: "Apply changes to {filter} first?" with Discard (subtle) and Apply
  (default, `data-controls-apply` while it shows) takes focus as it appears
  (Discard when Apply is blocked). Everything under it, value, rows and
  footer, is dimmed and `inert` meanwhile.

A viewer's popover (own or saved filter) is the value view alone.

## Label draft (`useLabelDraft`)

Held by `FilterEditor`, so Back keeps it. Commits after 300ms idle, on blur
and on Enter. Blur commits synchronously, which is what lets Apply, Cancel
and Escape see the text. An all-space label is written as no label
(`withFilterRuleLabel`), so emptying it restores the rule exactly.

## Focus on mount

The value input after the operator takes focus when the value view mounts
(open, back from Settings, a new filter's first field); a new filter's field
search (`[data-controls-start]`) when it opens. The back arrow takes it when
Settings opens. All with `preventScroll`: the popover is still being placed.
The first target is marked `data-autofocus` too, since the focus trap hands
focus to it once the popover is placed.

## Fields and SQL columns

- `useFilterRuleField` resolves the field as the shipped bar does. A SQL
  column filter (`target.isSqlColumn`) has no field; its type is the
  column's, else `fallbackType`.
- Field search is always the shipped `FilterFieldSelect`. "Add another field"
  offers `getFieldCandidates` (same kind, via shipped `matchFieldByType`, not
  already a row).

## Settings rules

- Every edit is written to the draft (Apply takes it to the dashboard)
  through `getFilterRuleWithDisabledState`: a rule with a value is never
  `disabled`; a required rule with no value always is.
- Incomplete default is the shipped reading: enabled and
  `!hasFilterValueSet(rule)` (`isDefaultValueIncomplete`). Nothing blocks
  closing; `close()` writes `disabled: true`.
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
  while a required filter has no value or the filter reaches no tile
  (`useAppliedTileCount`). Save keeps a required filter's value as its
  default.

## Escape (`useEditorDismiss`)

One capture listener on `document` while a filter is edited, so one press
does one thing, in order: an open layer (`hasOpenLayer`: `aria-expanded` or
Mantine `data-expanded`, or a modal) owns it; an element in
`[data-own-escape]` owns it; a clicked field is unclicked; else, with focus
in the editor, blur (commits the label) then withdraw a pending question or
cancel. From the page, Escape never cancels; while the prompt asks, Escape
withdraws it wherever focus is.

A `pointerdown` outside the editor and the pills acts as a click outside a
popover: nothing while a list is open (the press closes it), else
`requestClose` closes a clean edit and asks on a dirty one.

## Header guard

`DashboardHeaderGuard` is a `display: contents` wrapper with `inert` over the
shipped header, Save and Cancel included, while an editor's filter is open.
A viewer's edit never locks it.
