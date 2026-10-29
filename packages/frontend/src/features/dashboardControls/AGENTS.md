# Dashboard controls

The filter editor popover, bar and tile overlays that replace the dashboard
filter bar and popover. A _control_ is a filter control on the bar; it narrows data
through fields. User-facing copy says _tile_, never _chart_.

- **Flag**: `FeatureFlags.DashboardControls` (`dashboard-controls`), read with
  `useServerFeatureFlag`. Flag off, the dashboard behaves exactly as before.
- **Saved data keeps today's shape**: `DashboardFilterRule` (plus
  `sectionId`) and `DashboardConfig`. Expose only what a dashboard can
  already save; never add a field the shipped app cannot read.

## Topic docs

Read the matching file before changing that area:

- [`docs/provider.md`](docs/provider.md): read when changing
  `ControlsSidebarProvider`, an edit's lifecycle (the draft, open, switch,
  Apply, Cancel, mode change), "changed"/dirty rules, undo or focus return.
- [`docs/editor.md`](docs/editor.md): read when changing the editor popover,
  `FilterSettings`, the lock or "Required" rules, Escape handling or the
  label draft.
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
  through `DashboardHeaderGuard`; while the band shows (`isEditBandShown`:
  edit mode and manage access) `bandScope` on the header and
  tabs wrapper (`--dashboard-header-height` set to `--dashboard-edit-band-height`, `DASHBOARD_EDIT_BAND_HEIGHT`); `PageSpinner` until the flag's
  `isInitialLoading` ends, so `Page` is never swapped for
  `ControlsSidebarPage` (that remounts the grid).
- `features/dashboardTabs/index.tsx`: `ControlsBar` instead of
  `DashboardFiltersBar`; `hasQuietActions` on each `DraggableTab`; the tabs' stuck detector offset
  from `getTabsStickyOffset` (`editBand.ts`, the band's height while it shows).
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
  `filtersAlign`.
- `AddFilterButton`: `editModeAction`.
- `FilterRequirements/FilterRequirementsButton`: `renderTarget` (must take a
  ref; the popover anchors on it).
- `FilterRequirements/RequiredFilterCard`: `onChangeOtherFilterRule`,
  `disabledReason`, `isListInPortal`, `withCard`.
- `ActiveFilters/FilterPillButton`: `removeLabel`, `fieldIconOverride`,
  `isLockSpaceReserved`, `areActionsHidden`, `dragHandle` (drag from the
  grip only), `isPlain` (the
  pill looks below; `Filter` and `TemporaryFilters` pass it through, and
  `FilterRuleLabel` takes `isValueBold`).
- `FilterConfiguration/FilterFieldSelect`: `defaultOpened`, `withLabel`,
  `placeholder`, `withinPortal`.
- `FilterConfiguration/FilterValueSection`: `withDefaultValueSwitch` and
  `withRequiredSaveNote` (the editor passes `false` for both: edit mode edits
  the default, and Save keeps a required filter's value), and
  `isListClosedOnPick` (the editor passes `true`: an open value list would
  cover its Apply). It reaches the string inputs as `popoverProps.closeListOnPick`
  and `MultiSelectCombobox` as `closeOnOptionSubmit`.
- `FilterConfiguration/utils`: `getFilterRuleWithRequired` takes
  `savedDefaultRule` (only the editor passes it).
- Embed: `EmbedDashboardFilterBar` and `EmbedDashboardHeader` take
  `isControlsEnabled`; with it the filter bar sits in `MappingSwap`.

Pure moves out of shipped files, now shared by both sides:
`ActiveFilters/` (`FilterRuleLabel`, `FilterPillSkeletons`,
`TemporaryFilters`, `UnresolvedFilter`, `FilterPillButton`,
`useFilterTabPlacement`, `filterLabels`, `filterLock`, `filterOrder`),
`FilterConfiguration/` (`FilterValueSection`, `SqlColumnSelect`, and in
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
| `MappingRow.tsx` | Mapping: the open pill, title and counts, field chips, "Add a field", Cancel and Apply |
| `AddControl.tsx`, `FilterBarMenu.tsx` | "Add filter" and the editor's "..." menu ("Hide for viewers" / "Show for viewers", named for the action as the shipped pin item; "Filter rules"); `InertWhileEditing` |
| `FilterPills.tsx`, `FilterPill.tsx`, `TemporaryFilterPills.tsx` | Bar pills: an editor's, a viewer's saved and own pills (each anchors the editor), an editor's temporary pills (shipped) |
| `SettledFilterFields.tsx` | Keeps the last fields while tiles reload, so the bar does not flash a first load |
| `FilterEditor.tsx` | `EditorPopover`, under a pill or "Add filter": the prompt, the body, Cancel and Apply |
| `FilterSettings.tsx`, `FilterValueSettings.tsx`, `ViewerControls.tsx` | Popover body: name, value, "Applies to", the Settings view (section, required, lock) |
| `FieldsAndTiles.tsx`, `fieldCandidates.ts` | A new filter's field search; field candidates for "Add a field" and the cards |
| `peers.ts` | Multi-field model on the saved shape, scopes, counts |
| `FieldTilesBar.tsx`, `useFieldTileActions.ts`, `useBarHost.ts` | Floating field bar; the one place a field's counts and actions are computed |
| `TileOverlay.tsx`, `LazySelect.tsx`, `tileProps.ts`, `tileSelector.ts` | Per-tile veil and card |
| `TabCounts.tsx`, `usePortalTargets.ts`, `useTileHover.ts`, `useScrollToHighlightedTile.ts` | Tab counts, portal targets and sibling locking, pill hover marks, scroll to tile |
| `LinkPrompts.tsx`, `linkCandidates.ts` | Link prompts on tiles added while editing |
| `SectionedFilters.tsx`, `SectionMenu.tsx`, `SectionNameInput.tsx`, `sections.ts`, `nameFocus.ts` | Sections bar, drag and drop, naming (focus after naming, shared with the editor's name); pure section helpers |
| `SelectionBar.tsx`, `SelectionActions.tsx`, `barSelection.ts` | Multi-select on the sectioned bar |
| `sectionVersionChanges.ts` | Section rows for the version comparison page |
| `DashboardHeaderGuard.tsx` | Edit mode band (Editing, name; Add tile, Save dashboard, Cancel, "...") in place of the header for users who can manage the dashboard (`useDashboardManageAccess`, else the shipped header); inert while an editor's filter is edited |
| `useEditorDismiss.ts` | Escape handling while a filter is edited |
| `DropdownClass.tsx`, `railContractClasses.ts` | Embed class contract on the editor popover and portalled lists |
| `requirements.ts`, `fieldLabels.ts` | Requirement rules, count copy |

## Invariants

Each one has broken before or would break silently.

- **One filled button.** While a filter is edited the editor's Apply (the
  mapping row's in mapping) is the only filled button on screen: the inert
  band draws Save dashboard as an outline, and the selection bar never uses
  `filled`. The one exception is the field bar's Undo right after "Add a
  field" (a design decision).
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
  the emptied placeholder; `buildDashboardConfig` carries
  `parameterSections` forward. See `docs/sections.md`.
- **`data-tour-*` anchors** on the bar are the shipped bar's; keep them.

## Strings

Viewers and embeds see the editor, tile cards, field bar and tab counts, so
their copy lives in `DEFAULT_UI_STRINGS` (`filters.rail.*`,
`filters.tileCard.*`, `filters.fieldBar.*`, or a shipped key that fits),
read with `useUiStrings`; counts go through `formatTileCount` /
`formatFieldCount` in `fieldLabels.ts`. Add every new key to both locale
bundles in `packages/sdk-test-app/public/locales/`. Copy only an editor sees
(Settings, the name input, link prompts, section controls, the "..." menu,
tips) stays literal; "Applies to", "Choose tiles" and the mapping row are
viewers' too.
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

- Not in effect (no value, or it reaches no tile): text, icons and border
  muted, "is any value". In effect (`data-in-effect`): the value bold.
- Open (`data-open`, the filter in the editor): a 1.5px
  ink border, the extra 0.5px inset so the box keeps its size.
- Not saved for everyone (`data-temporary`: a viewer's own filter, or an
  editor's filter not in the saved dashboard): dashed.
- Picked (edit mode): blue fill and a check, the only blue.
- Required, locked and "changed since save" have no cue; Save in the band is
  the one unsaved signal.

Apply in the editor is disabled for an editor's required filter with no value
and for a filter that reaches no tile.

## Tests

Each component has a sibling `*.test.tsx` / `*.test.ts` here; the embed's are
in `ee/features/embed/EmbedDashboard/components/*.test.tsx`, and
`utils/dashboardConfig.test.ts` pins saved config. Run one file at a time:

```bash
pnpm -F frontend test src/features/dashboardControls/ControlsSidebarProvider.test.tsx
```

The flag-on flow end to end is `packages/e2e/tests/app/dashboardControls.spec.ts`.
It turns the flag on per page by fulfilling the flag request (the flag gates
only the frontend), so the flag-off dashboard specs keep running beside it.
It selects by the DOM markers above, `DEFAULT_UI_STRINGS` names and
`data-testid="controls-mapping-row"`; keep them when you rename copy.
