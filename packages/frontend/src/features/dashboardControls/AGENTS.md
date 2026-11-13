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
  `ControlsEditorProvider`, an edit's lifecycle (the draft, open, switch,
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

- `pages/Dashboard.tsx`: `ControlsEditorPage` instead of `Page`; the header
  through `DashboardHeaderGuard`; `PageSpinner` until the flag's
  `isInitialLoading` ends, so `Page` is never swapped for
  `ControlsEditorPage` (that remounts the grid).
- `features/dashboardTabs/index.tsx`: `ControlsBar` instead of
  `DashboardFiltersBar`; `hasQuietActions` on each `DraggableTab`. The
  shipped Hide is unchanged; the collapsed `DashboardFiltersBarSummary`
  also counts the named zooms the user sees (`dateZoomsCount`).
- `components/common/Dashboard/DashboardHeader.tsx`: the indigo "Editing"
  badge before the name in edit mode, for users who can manage the dashboard;
  the `save` class, outlined by `DashboardHeader.module.css` under the guard's
  `[data-dashboard-header-guard][inert]`.
- `ee/features/embed/EmbedDashboard/components/EmbedDashboard.tsx`: the
  flag turns on `isControlsEnabled` for the header and filter bar, viewers
  and an editor in edit mode alike, and renders the tile overlays, tab
  counts and tile bars of all three kinds (they act only in mapping; no
  `LinkPrompts`). A dashboard with no tiles has no grid, so a viewer's
  header gets `isControlsEnabled={false}`; an editor in edit mode keeps the
  bar, so an open edit outlives the last tile. For an editor in edit mode
  it also: wraps the toolbar in `EmbedToolbarGuard` (inert while a control
  is edited; it carries `data-dashboard-header-guard` and Save the header's
  `save` class, so the header's rule draws Save as an outline), sets the
  store's edit mode and clears the runtime zoom pick and a viewer's named
  zoom picks (for good, as the app's Edit drops them), builds Save with
  `buildEmbedDashboardUpdate`, counts control drafts in "changed", and
  resets them on Cancel and on leaving edit mode (a host's switch), and
  settles them after a save (`useControlDraftResets`).
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
  `withDateZoomControls` (the controls bar passes `false` for both: no
  funnel, sliders or calendar circles; on the right, Default zoom alone,
  without the named zooms, "Add date zoom" or the eye, which are pills and
  "..." items on the bar), and `defaultZoom` (replaces the shipped Default
  zoom on the right and drops the rule before it: the controls bar passes
  `DefaultZoomButton` in edit mode and a quiet `DateZoom` in view mode).
- `dateZoom/DateZoom`: `withControls` (`false`: Default zoom alone, no
  named zoom pills or "Add date zoom"; the embed's bar passes it too) and
  `isQuiet` (the controls bar's viewer button, drawn as
  `DefaultZoomButton`; default `false`: the bordered pill).
- `DashboardFiltersBarSummary`: `dateZoomsCount` (default 0: no count) and
  `isControlsBar` (the controls bar's summary: no funnel, "Show controls",
  "Default zoom Week").
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
  `isControlsEnabled`; with it the filter bar sits in `MappingSwap`, and
  named zooms the viewer sees count towards Hide and the summary, as
  filters and parameters do (Default zoom stays out, on the right). With
  `isEditMode` too it is the app's editor bar: always `SectionedFilters`,
  `DefaultZoomButton` in the shipped Default zoom's place.
- `SectionedFilters`: `editorActions` (default `AddControl`; the embed
  passes one with its class contract). `AddControl`: `withParameters` and
  `withDateZooms` (default `true`; the embed passes what its token shows,
  so an editor cannot add a control the bar hides). `FilterBarMenu`:
  `withDateZooms` (default `true`: both date zoom items; `AddControl`
  passes its own, so a token without date zoom lists neither).
- `DashboardProvider`: `isEditModeExternal` (default `false`: the route
  sets the parameters store's edit mode). The embed page passes it and
  `EmbedDashboard` dispatches the mode; without it the provider's effect,
  which runs after its children's, would undo that on mount. With it the
  date zoom sync reads the mode from the store too: no saved default over
  an editor's edit mode, and it applies again on the way out.

Pure moves out of shipped files, now shared by both sides:
`features/dateZoom/hooks.ts` (`useGranularityData`,
`useEligibleDateZoomTiles`, out of `DateZoomControlConfig`),
`DateZoomControlMenuItems` (a named zoom's grains and "Reset to default",
out of `DateZoomControlPills`),
`ActiveFilters/` (`FilterRuleLabel`, `FilterPillSkeletons`,
`TemporaryFilters`, `UnresolvedFilter`, `FilterPillButton`,
`useFilterTabPlacement`, `filterLabels`, `filterLock`, `filterOrder`),
`FilterConfiguration/` (`FilterValueSection` and its
`ClearToAnyValueButton`, `SqlColumnSelect`, and in
`utils` the rule helpers such as `getFilterRuleWithDisabledState`,
`isLockedRequiredMissingValue`, `getFilterRuleFilterType`,
`getRequiredGroupMemberUpdates`, `getDimensionFiltersToSave`, and
`getTileFieldOptions`, the Tiles tab's per-tile options),
`components/common/FieldSelect/fieldSelectLabel.ts` (`getFieldSelectLabel`), the embed's `EmbedResetFiltersButton`, `Dashboard/DashboardPerformanceWarning`, and `useControlDraftResets` (`resetControlDrafts`, the control part of the page's Cancel).
Fix behaviour in the shared piece, once, never in a copy.

## Map

| File | Owns |
| --- | --- |
| `ControlsEditorProvider.tsx`, `useControlsEditor.ts`, `editorState.ts` | The edit state, every write to filters, focus return; pure state helpers |
| `ControlsEditorPage.tsx` | Drop-in for `Page`: the provider plus tile overlays, tab counts, link prompts, field bar |
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
| `FieldTilesBar.tsx`, `useFieldTileActions.ts`, `FloatingBar.tsx`, `useBarHost.ts` | Floating field bar; the one place a field's counts and actions are computed; `FloatingBar` is the edit toolbar's `ActionBar`, shared by every floating bar here |
| `TileOverlay.tsx`, `LazySelect.tsx`, `tileProps.ts`, `tileSelector.ts`, `TileCard.tsx`, `useTabTileTargets.ts` | Per-tile veil and card; every kind's veil, card frame, Move question, tab tiles and ring highlight |
| `TabCounts.tsx`, `usePortalTargets.ts`, `useTileHover.ts`, `useScrollToHighlightedTile.ts` | Tab counts, portal targets and sibling locking, pill hover marks, scroll to tile |
| `LinkPrompts.tsx`, `linkCandidates.ts` | Link prompts on tiles added while editing |
| `SectionedFilters.tsx`, `SectionMenu.tsx`, `SectionNameInput.tsx`, `sections.ts`, `nameFocus.ts` | Sections bar, drag and drop, naming (focus after naming, shared with the editor's name); pure section helpers |
| `controlOrder.ts` | Pure bar order and section line helpers, free of dnd-kit: the store and `utils/dashboardConfig.ts` import them |
| `SelectionBar.tsx`, `SelectionActions.tsx`, `barSelection.ts` | Multi-select on the sectioned bar |
| `useEditorSession.ts`, `EditorFocusReturn.tsx`, `controlKinds.ts` | The parameter and date zoom editors' shared session: the pending question, open, Apply, Cancel, Escape, a press outside, another kind's pill, mode change, mapping steps, focus return; each kind's pill selectors |
| `DateZoomEditorProvider.tsx`, `useDateZoomEditor.ts`, `dateZoomControls.ts` | The date zoom editor: named zooms and the default zoom, their draft, Apply, switching, mapping; every write to the date zoom config from the bar; pure config helpers |
| `DateZoomPills.tsx`, `useDateZoomBar.ts` | Named zoom pills (in the order, sections, drag and selection); an editor's anchors its popover, a viewer's opens the shipped menu. `DefaultZoomButton`: an editor's Default zoom on the bar's right, anchoring its popover; viewers get the shipped one with `isQuiet` |
| `DateZoomControlPopover.tsx`, `DefaultZoomPopover.tsx`, `GrainSelect.tsx`, `ControlPopoverParts.tsx`, `dateZoomGrains.ts`, `DateZoomGrainsMenu.tsx` | The date zoom popovers by props (draft held by the editor), the grain select, the "..." menu's grains |
| `DateZoomMappingRow.tsx`, `DateZoomTileOverlay.tsx`, `DateZoomTilesBar.tsx`, `useDateZoomMapping.ts` | Choosing a zoom's tiles: the row, a card per tile, the floating bar |
| `sectionVersionChanges.ts` | Section rows for the version comparison page |
| `DashboardHeaderGuard.tsx` | Wraps the shipped header; inert while an editor's filter is edited |
| `useControlDraftResets.ts` | The control drafts back to a saved config: the page's and the embed's Cancel, the embed's settle after a save |
| `useEditorDismiss.ts` | Escape handling while a filter is edited |
| `DropdownClass.tsx`, `controlContractClasses.ts` | Embed class contract on the editor popover and portalled lists |
| `requirements.ts`, `fieldLabels.ts` | Requirement rules, count copy |

## Invariants

Each one has broken before or would break silently.

- **One filled button.** While a filter is edited the editor's Apply (the
  mapping row's in mapping) is the only filled button on screen: the inert
  header (the embed's inert toolbar too) draws Save as an outline, and the
  selection bar never uses `filled`. The one exception is the field bar's Undo right after "Add a
  field", or its Filter right after a tile card's pick (a design decision).
- **No state reset in an effect.** Open/closed, mapping, highlighted field,
  pending switch, undo and selection are all derived on render. The
  exceptions are mode-change effects: the provider's (browser Back, a typed
  URL, an embed's `isEditMode`), which closes the edit as Apply does, and
  `EmbedDashboard`'s, which have no route to follow: the store's edit mode
  and zoom pick, the seeded date zoom visibility, and the control drafts
  dropped on leaving edit mode.
- **The provider is the only writer.** The editor writes the edited rule with
  `updateFilter` and any other rule with `updateOtherFilters`, never the
  dashboard's `setDashboardFilters` directly. Those land in the provider's
  draft; only Apply takes it to the dashboard, once, so tiles rerun only then.
  A section move is the one write that reaches the dashboard at once.
- **Callbacks are stable.** Provider callbacks read state from the `latest`
  ref and write through the `write*` helpers; a new callback does the same.
  Per-tile, per-pill and page-wide readers use `useControlsEditorSelector`
  with a selector that returns a stable value, never `useControlsEditor()`.
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
  (the embed class contract: `ld-dashboard-control-editor` and
  `ld-dashboard-filter-dropdown` on the popover, `ld-dashboard-filter`,
  `ld-dashboard-add-filter`, `ld-dashboard-filter-dropdown` and
  `ld-dashboard-add-filter-dropdown` on lists); keep them on the equivalent
  element. An embed editor's Save is `buildEmbedDashboardUpdate`
  (`embedDashboardSave.ts`): flag off, the loaded `dashboard.config` and
  the store's rules; flag on, the app's save helpers
  spread over the loaded config. Either way the saved rules the token keeps
  out of the store (`applyEmbedFilterInteractivity`) go back into the save
  from the loaded dashboard (`keepHiddenFilters`): all of them under `none`,
  the dimension rules outside `allowedFilters` under `some`. Keys the embed's store is never seeded
  with are sent as loaded, never from a store default: `pinnedParameters`,
  `parameterOrder`, and `isDateZoomDisabled` unless the token allows date
  zoom, where an editor's edit mode seeds it from the saved config, tiles
  or none (and puts it back to `false` on the way out: an embed viewer's
  date zoom follows the token). A kind the token does not allow (date
  zoom, parameters) has no control on the bar, so `getEmbedControlDrafts`
  reads it as saved: its drafts never enable Save and its keys (and
  `parameters`) are sent as loaded, list order included; hidden filter
  rules keep their loaded order too. A section holding a member of such a
  kind has no remove item (`SectionedFilters` passes `onRemove: null` to
  `SectionMenu`), so the member is never stranded. A host turning `isEditMode` off without
  Cancel drops the control drafts (what an open editor applies on the way
  out included) but keeps filter rule drafts, as before the controls. The embed resolves the flag for the JWT's
  organisation (`FeatureFlagService.getForAccount`). A language map's
  control names (`sections.names`, `parameterControls.labels`,
  `dateZooms.names`, each keyed by source name) are applied to the config
  that seeds the store for viewing only (`translatedConfig` in
  `EmbedDashboard`): an editor in edit mode is seeded with, and saves, the
  source names.
- **Saved section keys survive every rewrite**: `sectionId` is carried in
  `applyDimensionOverrides` / `applyMetricOverrides`, `adoptPlaceholder` and
  the emptied placeholder. See `docs/sections.md`.
- **`data-tour-*` anchors** on the bar are the shipped bar's; keep them.
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

Date zoom files keep `uuid`/`controlUuid` required both ways; `slug` and
`controlSlug` are optional extras that only resolve `controlOrder` refs.

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
  edit mode; a viewer's opens the shipped menu. The default zoom is no
  pill: it stays on the bar's right, with no rule before it, one quiet
  button in both modes reading "Default zoom Month", or "Default zoom"
  alone with no grain (the grain bold while in effect). An editor's is
  eye-off when hidden from viewers and opens a popover with the grain only
  (grains and their lock stay in "..."); a viewer's is the shipped
  `DateZoom` with `isQuiet`, opening the shipped menu.
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
pnpm -F frontend test src/features/dashboardControls/ControlsEditorProvider.test.tsx
```
