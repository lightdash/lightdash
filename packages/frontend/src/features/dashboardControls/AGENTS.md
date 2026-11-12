# Dashboard controls

The filter editor popover, bar and tile overlays that replace the dashboard
filter bar and popover. A _control_ is a filter control on the bar; it narrows data
through fields. User-facing copy says _tile_, never _chart_.

- **Flag**: `FeatureFlags.DashboardControls` (`dashboard-controls`), read with
  `useServerFeatureFlag`. Flag off, the dashboard behaves exactly as before.
- **Saved data grows by optional fields only**: `DashboardFilterRule` (plus
  `sectionId`) and `DashboardConfig` (including `parameterControls`). Older
  dashboards must keep loading, and with the flag off the shipped readers
  ignore the new fields, so flag-off saves carry them forward.

## Topic docs

Read the matching file before changing that area:

- [`docs/provider.md`](docs/provider.md): read when changing
  `ControlsSidebarProvider`, an edit's lifecycle (the draft, open, switch,
  Apply, Cancel, mode change), "changed"/dirty rules, undo or focus return.
- [`docs/editor.md`](docs/editor.md): read when changing the editor popover
  (`FilterPopover`), the lock or "Required" rules, Escape handling or the
  name.
- [`docs/fields-and-tiles.md`](docs/fields-and-tiles.md): read when changing
  multi-field mapping, scopes, `FieldTilesBar`, tile overlays and cards, tab
  counts or pill hover.
- [`docs/link-prompts.md`](docs/link-prompts.md): read when changing
  `LinkPrompts` or `linkCandidates.ts`.
- [`docs/sections.md`](docs/sections.md): read when changing sections, the
  sectioned bar, its drag and drop or multi-select.
- [`docs/tracking.md`](docs/tracking.md): read when adding or changing a
  tracked event.

## Shipped files: gated lines and openings

Shipped components are imported, never restated: reuse
`features/dashboardFilters`, `features/parameters` and `features/dateZoom`.
A shipped file changes only by a pure move into an exported piece, or by an
optional prop whose default is today's behaviour. Keep that true, so flag-off
is untouched and removing the flag is deleting these lines.

Gated on the flag:

- `pages/Dashboard.tsx`: `ControlsSidebarPage` instead of `Page`; the header
  through `DashboardHeaderGuard`; `PageSpinner` until the flag's
  `isInitialLoading` ends, so `Page` is never swapped for
  `ControlsSidebarPage` (that remounts the grid).
- `features/dashboardTabs/index.tsx`: `ControlsBar` instead of
  `DashboardFiltersBar`; `hasQuietActions` on each `DraggableTab`;
  `ControlsSummary` instead of the collapsed `DashboardFiltersBarSummary`.
  Editing with the edit ergonomics flag, the floating bar's switch collapses
  the strip (no toggle); without it, the strip's toggle does, as in view.
- `components/common/Dashboard/DashboardHeader.tsx`: `isControls` on
  `EditFiltersVisibilityControl` (the switch says "Controls"); the indigo "Editing"
  badge before the name in edit mode, for users who can manage the dashboard;
  the `save` class, outlined by `DashboardHeader.module.css` under the guard's
  `[data-dashboard-header-guard][inert]`.
- `ee/features/embed/EmbedDashboard/components/EmbedDashboard.tsx`:
  `isEmbedFilterRailEnabled` (flag on, and not an embed editor in edit mode)
  turns on `isControlsEnabled` for the header and filter bar, and
  renders `TileOverlays`, `TabCounts` and `FieldTilesBar` (all three act only in mapping). A dashboard with
  no tiles has no grid, so its header gets `isControlsEnabled={false}`.
- `pages/Dashboard.tsx` Save: `getDimensionFiltersToSave` keeps a required
  filter's value as its default with the flag on; off, it strips it as before.
- `pages/DashboardVersionComparison.tsx`: a "Filter sections" block after
  "Filters" when either version has a section, rows from
  `getSectionChangeRows` in the shipped filters table.

Openings (optional props, defaults are today's behaviour):

- `dashboardTabs/Tab.tsx`: `hasQuietActions`; the tab `maw` reads
  `--dashboard-tab-max-width` first (also in the embed's tabs).
- `DashboardFiltersBar`: `filterArea`, `isCompactDrawerSuppressed`,
  `filtersAlign`, `isParametersColumn`, `withGroupMarkers` and
  `withDateZoom` (the controls bar passes `false` for both: no funnel,
  sliders or calendar circles, no date zoom group on the right), and
  `withHideButton` (`false`: the strip's toggle collapses it).
- `EditFiltersVisibilityControl`: `isControls`.
- `AddFilterButton`: `editModeAction`.
- `FilterRequirements/FilterRequirementsButton`: `renderTarget` (must take a
  ref; the popover anchors on it).
- `FilterRequirements/RequiredFilterCard`: `onChangeOtherFilterRule`,
  `disabledReason`, `isListInPortal`, `withCard` (off, Required's icon is the
  pill's asterisk rather than the dashed circle).
- `ActiveFilters/FilterPillButton`: `removeLabel`, `fieldIconOverride`,
  `isLockSpaceReserved`, `areActionsHidden`, `dragHandle` (unused
  by the bar since the pill itself drags), `tablesTooltipNote` (through `Filter`, `TemporaryFilters`
  and `FilterRuleLabel`'s `tooltipNote`), `isPlain` (the
  pill looks below; `Filter` and `TemporaryFilters` pass it through, and
  `FilterRuleLabel` takes `isValueBold`).
- `FilterConfiguration/FilterFieldSelect`: `defaultOpened`, `withLabel`,
  `placeholder`, `withinPortal`.
- The string value inputs take `popoverProps.closeListOnPick` and
  `popoverProps.openListOnFocus: false` (the editor passes both: an open
  value list would cover its Apply), and `MultiSelectCombobox` takes
  `closeOnOptionSubmit` and `openOnFocus` (default `true`): the list waits
  for typing, a click or ArrowDown.
- `FilterConfiguration/utils`: `getFilterRuleWithRequired` takes
  `savedDefaultRule` (only the editor passes it).
- Embed: `EmbedDashboardFilterBar` and `EmbedDashboardHeader` take
  `isControlsEnabled`; with it the filter bar sits in `MappingSwap`, starts
  with `ControlsLead` (no shipped Hide) and collapses to
  `ControlsCollapsedStrip`.

Pure moves out of shipped files, now shared by both sides:
`features/dateZoom/hooks.ts` (`useGranularityData`,
`useEligibleDateZoomTiles`, out of `DateZoomControlConfig`),
`ActiveFilters/` (`FilterRuleLabel`, `FilterPillSkeletons`,
`TemporaryFilters`, `UnresolvedFilter`, `FilterPillButton`,
`useFilterTabPlacement`, `filterLabels`, `filterLock`, `filterOrder`),
`FilterConfiguration/` (`FilterValueSection` and its
`ClearToAnyValueButton`, `SqlColumnSelect`, and in
`utils` the rule helpers such as `getFilterRuleWithDisabledState`,
`isLockedRequiredMissingValue`, `getFilterRuleFilterType`,
`getRequiredGroupMemberUpdates`, `getDimensionFiltersToSave`, and
`getTileFieldOptions`, the Tiles tab's per-tile options),
`components/common/FieldSelect/fieldSelectLabel.ts` (`getFieldSelectLabel`), the embed's `EmbedResetFiltersButton`, and `Dashboard/DashboardPerformanceWarning`.
Fix behaviour in the shared piece, once, never in a copy.

## Map

| File | Owns |
| --- | --- |
| `ControlsSidebarProvider.tsx`, `useControlsSidebar.ts`, `sidebarState.ts` | The edit state, every write to filters, focus return; pure state helpers |
| `ControlsSidebarPage.tsx` | Drop-in for `Page`: the provider plus tile overlays, tab counts, link prompts, field bar |
| `ControlsBar.tsx` | The shipped bar with its openings; picks flat or `SectionedFilters`; `MappingSwap` cross-fades to `MappingRow` (the embed's bar uses it too) |
| `ControlMappingRow.tsx` | Every mapping row's frame; the parameter and date zoom rows (back, open pill, count, Clear all tiles, Cancel, Apply) |
| `MappingRow.tsx` | Mapping: the open pill, title and counts, field chips, "Add a field", Cancel and Apply |
| `AddControl.tsx`, `FilterBarMenu.tsx` | "Add filter" and the editor's "..." menu ("Hide for viewers" / "Show for viewers", named for the action as the shipped pin item; "Filter rules"); `InertWhileEditing` |
| `useBarPill.ts`, `ControlEditorPopover.tsx` | Every kind's pill behaviour (modified-click pick, Alt+arrow move, tile hover, the select hint) and its editor popover's frame |
| `FilterPills.tsx`, `FilterPill.tsx`, `TemporaryFilterPills.tsx` | Bar pills: an editor's, a viewer's saved and own pills (each anchors the editor), an editor's temporary pills (shipped) |
| `SettledFilterFields.tsx` | Keeps the last fields while tiles reload, so the bar does not flash a first load |
| `FilterEditor.tsx` | `EditorPopover`, under a pill or "Add filter"; wires `FilterPopover` to the provider, a placeholder's field search |
| `FilterPopover.tsx`, `FilterValueSettings.tsx`, `useRuleEdits.ts`, `NameInput.tsx`, `SectionSetting.tsx`, `ViewerControls.tsx`, `settingsSummary.ts`, `editorFocus.ts`, `useSettingsChipFocus.ts` | The popover, by props: header (icon, name, operator menu), value, chips (tiles, Settings), the prompt, Cancel and Apply, the Settings view (section, required, lock) |
| `FieldsAndTiles.tsx`, `fieldCandidates.ts` | A new filter's field search; field candidates for "Add a field" and the cards |
| `peers.ts` | Multi-field model on the saved shape, scopes, counts |
| `ControlTilesBar.tsx` | The parameter key's and date zoom's floating bar: host, tab scopes, slide guard |
| `FieldTilesBar.tsx`, `useFieldTileActions.ts`, `useBarHost.ts` | Floating field bar; the one place a field's counts and actions are computed |
| `TileOverlay.tsx`, `LazySelect.tsx`, `tileProps.ts`, `tileSelector.ts`, `TileCard.tsx`, `useTabTileTargets.ts` | Per-tile veil and card; every kind's veil, card frame, Move question, tab tiles and ring highlight |
| `TabCounts.tsx`, `usePortalTargets.ts`, `useTileHover.ts`, `useScrollToHighlightedTile.ts` | Tab counts, portal targets and sibling locking, pill hover marks, scroll to tile |
| `LinkPrompts.tsx`, `linkCandidates.ts` | Link prompts on tiles added while editing |
| `SectionedFilters.tsx`, `SectionMenu.tsx`, `SectionNameInput.tsx`, `sections.ts`, `nameFocus.ts` | Sections bar, drag and drop, naming (focus after naming, shared with the editor's name); pure section helpers |
| `controlOrder.ts` | Pure bar order and section line helpers, free of dnd-kit: the store and `utils/dashboardConfig.ts` import them |
| `SelectionBar.tsx`, `SelectionActions.tsx`, `barSelection.ts` | Multi-select on the sectioned bar |
| `useEditorSession.ts`, `EditorFocusReturn.tsx`, `controlKinds.ts` | The parameter and date zoom editors' shared session: the pending question, open, Apply, Cancel, Escape, a press outside, another kind's pill, mode change, mapping steps, focus return; each kind's pill selectors |
| `DateZoomEditorProvider.tsx`, `useDateZoomEditor.ts`, `dateZoomControls.ts` | The date zoom editor: named zooms and the default zoom, their draft, Apply, switching, mapping; every write to the date zoom config from the bar; pure config helpers |
| `ControlsStrip.tsx`, `useControlCounts.ts`, `useHasControlsToggle.ts` | The strip's start (the "Controls" toggle, the default zoom, each with a divider while something follows) and its collapsed line (counts per kind); the toggle shows when there is something to collapse, not behind the narrow drawer, and not while editing with the floating edit bar |
| `DateZoomPills.tsx`, `useDateZoomBar.ts` | Named zoom pills (in the order, sections, drag and selection) and the default zoom button, at the strip's start (inert with the bar while tiles are chosen); each anchors its popover |
| `DateZoomControlPopover.tsx`, `DefaultZoomPopover.tsx`, `GrainSelect.tsx`, `ControlPopoverParts.tsx`, `dateZoomGrains.ts`, `DateZoomGrainsMenu.tsx` | The date zoom popovers by props (draft held by the editor), the grain select, the "..." menu's grains |
| `DateZoomMappingRow.tsx`, `DateZoomTileOverlay.tsx`, `DateZoomTilesBar.tsx`, `useDateZoomMapping.ts` | Choosing a zoom's tiles: the row, a card per tile, the floating bar |
| `sectionVersionChanges.ts` | Section rows for the version comparison page |
| `DashboardHeaderGuard.tsx` | Wraps the shipped header; inert while an editor's filter is edited |
| `useEditorDismiss.ts` | Escape handling while a filter is edited |
| `DropdownClass.tsx`, `railContractClasses.ts` | Embed class contract on the editor popover and portalled lists |
| `requirements.ts`, `fieldLabels.ts` | Requirement rules, count copy |

## Invariants

Each one has broken before or would break silently.

- **One filled button.** While a filter is edited the editor's Apply (the
  mapping row's in mapping) is the only filled button on screen: the inert
  header draws Save changes as an outline, and the selection bar never uses
  `filled`. The one exception is the field bar's Undo right after "Add a
  field", or its Filter right after a tile card's pick (a design decision).
- **No state reset in an effect.** Open/closed, mapping, highlighted field,
  pending switch, undo and selection are all derived on render. The one
  exception is the mode-change effect in the provider (browser Back, a typed
  URL, an embed's `isEditMode`), which closes the edit as Apply does.
- **The provider is the only writer.** The editor writes the edited rule with
  `updateFilter` and any other rule with `updateOtherFilters`, never the
  dashboard's `setDashboardFilters` directly. Those land in the provider's
  draft; only Apply takes it to the dashboard, once, so tiles rerun only then.
  A section move is the one write that reaches the dashboard at once.
- **Callbacks are stable.** Provider callbacks read state from the `latest`
  ref and write through the `write*` helpers; a new callback does the same.
  Per-tile, per-pill and page-wide readers use `useControlsSidebarSelector`
  with a selector that returns a stable value, never `useControlsSidebar()`.
- **Memoised tiles.** `TileOverlay` reads no context and is memoised with
  `areTilePropsEqual`: pass primitives and stable references, never the rule
  or a per-render object, or every tile re-renders on every edit.
- **Fields loading is not "offers nothing".** While
  `filterableFieldsByTileUuid` is `undefined`, nothing writes tile mappings
  (`isTileFieldKnown`); actions are disabled, not hidden.
- **"Changed" compares rules as saved** (`isFilterRuleDirty`,
  `withoutDefaultTileTargets`), but never normalises away a `false` tile
  exclusion or the presence of `tileTargets`: shipped code reads both.
- **A viewer never saves filters.** Outside edit mode a viewer's own filters
  go to the temporary filters, their tile choices included (only their own
  filters can be mapped, `canChooseTiles`); a saved filter's Apply goes through the
  shipped `updateDimensionDashboardFilter` / `updateMetricDashboardFilter`,
  the view-mode override the URL carries.
- **Overlays never stop events.** No `stopPropagation` on an overlay: Mantine
  closes lists on a `mousedown` that reaches `document`, and the editor's
  click outside listens on `pointerdown` there. A caller that locks
  siblings (`usePortalTargets(..., lockSiblings)`) must portal an overlay
  into every target it gets.
- **Focus return depends on DOM markers.** Keep `data-controls-pill` on each
  pill and `[data-filter-actions] > button[data-dashboard-filter-control]`
  on "Add filter", and `data-controls-apply` on Apply.
- **Escape does one thing per press.** Anything owning its own Escape marks
  itself `data-own-escape`; open lists are detected by `hasOpenLayer`.
- **Embeds.** The editor goes through `contractClasses` and `DropdownClass`
  (the embed class contract: `ld-dashboard-filter-rail` and
  `ld-dashboard-filter-dropdown` on the popover, `ld-dashboard-filter`,
  `ld-dashboard-add-filter`, `ld-dashboard-filter-dropdown` and
  `ld-dashboard-add-filter-dropdown` on lists); keep them on the equivalent
  element. An embed editor's Save sends the loaded
  `dashboard.config` and the store's rules, so sections survive. The embed
  resolves the flag for the JWT's organisation
  (`FeatureFlagService.getForAccount`).
- **Saved section keys survive every rewrite**: `sectionId` is carried in
  `applyDimensionOverrides` / `applyMetricOverrides`, `adoptPlaceholder` and
  the emptied placeholder. See `docs/sections.md`.
- **`data-tour-*` anchors** on the bar are the shipped bar's; keep them.
  The shipped Default zoom button's are on `DefaultZoomButton`, its menu's
  `zoom-option` on `GrainSelect`'s options.
- **One editor at a time, three providers.** Filter, parameter and date
  zoom editors each capture a click on another kind's pill or "Add"
  (`[data-controls-pill]`, `[data-parameter-pill]`, `[data-date-zoom-pill]`,
  `[data-default-date-zoom]`)
  and each lists the others' pills in its `useEditorDismiss` selector, so a
  switch asks on unapplied changes instead of discarding them. The lists
  come from `getOtherPillsSelector` (`controlKinds.ts`): a new kind joins
  `PILL_SELECTORS` there.
- **The date zoom config has one writer on the bar**, the date zoom editor:
  Apply, a section move, an Alt+arrow move without sections and the X
  write the dashboard draft
  (`setDateZoomConfig`); Save is the only save. Writes read the config from
  the store at call time (`selectCurrentDateZoomConfig`), so several in one
  tick (a selection's section move) all land.

## Dashboard files (as code)

New control kinds (date zoom next) follow these rules:

1. Every control in a dashboard file is identified by `slug` only. Download
   derives it from the control's name; upload matches it to the saved control
   to keep the saved id. Ids and uuids never appear in the file.
2. Section membership is `sectionSlug` on the control. No maps on `config`,
   no `sectionId`.
3. Order and line breaks live only in `controlOrder`, as
   `{ kind, slug, newLine }`. No per-kind order fields, no per-control or
   per-section line flags.
4. Tiles are referenced by tile slug.

## Strings

Viewers and embeds see the editor, tile cards, field bar and tab counts, so
their copy lives in `DEFAULT_UI_STRINGS` (`controls.*`,
`filters.tileCard.*`, `filters.fieldBar.*`, or a shipped key that fits),
read with `useUiStrings`; counts go through `formatTileCount` /
`formatFieldCount` in `fieldLabels.ts`. Add every new key to both locale
bundles in `packages/sdk-test-app/public/locales/`. Copy only an editor sees
(Settings, the name input, link prompts, section controls, the "..." menu,
tips) stays literal; "Applies to", "Choose tiles" and the mapping row are
viewers' too. Date zoom copy is under `controls.dateZoom.*`; the pill's
"is" is `parameters.is`, "Default zoom" and "None" the shipped `dateZoom.*`.
See `src/components/common/Filters/AGENTS.md`.

## Styling and motion

- Animate `opacity` and `transform` only: other properties run once per tile.
  A shadow that must appear sits on its own layer and fades.
- Only this moves: the popover arrives (fade and 4px, CSS on mount), the
  "Add a field" and "..." menus pop with the theme's dropdown transition
  (`MENU_TRANSITION`, closing at once), the mapping row fades in over the filter row, the field
  bar slides up for each new chip selection (keyed on the field; never on a
  tab switch), tile rings
  fade, Save's enabled state eases. Nothing on hover or press.
- No React state, effects, refs, timers or context for motion. Closing is
  immediate. The one exception: `FieldTilesBar` remembers the field it was
  drawn for, since a tab switch remounts the bar in another grid.
- Motion values come from the theme's global variables (`--ld-motion-*` in
  `theme/cssVariablesResolver.ts`): the dropdown pace for the popover and
  tile rings, Mantine's 250ms for the cross-fade, the bar's slide and Save.
  Every stylesheet switches its motion off under
  `prefers-reduced-motion: reduce`, the menus' inline transition included
  (`.menu`).
- No new `:has()` selectors.
- Nothing changes width or reflows when the editor opens, a field row is
  hovered or a drag starts: a locked pill's lock always shows (an unlocked
  pill has none), tab counts reserve their widest fraction. Keep any new
  piece to that.

## Pill looks (`isPlain`)

Every flag-on pill is the default white pill; only these change it, all in
`ActiveFilters/Filter.module.css` under `.plain`:

- Not in effect (no value, or it reaches no tile): text and icons muted,
  the standard border, "is any value". In effect (`data-in-effect`): the value bold.
- Open (`data-open`, the filter in the editor): a 1.5px
  ink border, the extra 0.5px inset so the box keeps its size; a temporary
  (dashed) pill keeps its 1px dashed border, with no inset.
- Not saved for everyone (`data-temporary`: a viewer's own filter, or an
  editor's filter not in the saved dashboard, or a temporary pill): dashed.
  "Only you see this filter" (`controls.onlyYouSeeFilter`) or "Not saved
  yet" is the first line of the tooltip the pill already has: the select
  hint, else the tables tooltip (`tablesTooltipNote`).
- Picked (edit mode): blue fill and a check, the only blue.
- A date zoom pill reads "Revenue zoom is Week" (`IconCalendarSearch`, the
  kind's icon, grey): dashed until saved, the ink ring while open, eye-off
  when hidden from viewers (by itself or with every date zoom), an X in
  edit mode. The default zoom is no pill: a quiet button at the strip's start
  reading "Default zoom Month" or "None" (the grain bold while in effect),
  eye-off when hidden from viewers, never dragged or picked.
- Required with no value: a muted asterisk on the left, before the field
  icon, with the requirement's tooltip (the pill is described by it); none
  once it has a value, nor on a locked pill (no viewer can set it). A
  parameter pill takes the same cues: the asterisk when a tile it sets has
  no value, dashed until saved (the store's `savedParameterControlIds`),
  the select hint; hidden from viewers is its eye-off icon, never muted. Locked
  and "changed since save" have no other cue; Save in the header is the one
  unsaved signal. An inner part with its own tooltip carries
  `data-own-tooltip` (or is a button), so the pill's tooltip waits on it.

Apply in the editor is disabled for an editor's filter that reaches no tile
or is locked and required with no value, and for a viewer's required filter
they cleared (one still off as saved applies unchanged, as with the flag off).

## Tests

Each component has a sibling `*.test.tsx` / `*.test.ts` here; the embed's are
in `ee/features/embed/EmbedDashboard/components/*.test.tsx`, and
`utils/dashboardConfig.test.ts` pins saved config. Run one file at a time:

```bash
pnpm -F frontend test src/features/dashboardControls/ControlsSidebarProvider.test.tsx
```
