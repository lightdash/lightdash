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
  through `DashboardHeaderGuard`; in edit mode `bandScope` on the header and
  tabs wrapper (the band's 44px `--dashboard-header-height`); `PageSpinner` until the flag's
  `isInitialLoading` ends, so `Page` is never swapped for
  `ControlsSidebarPage` (that remounts the grid).
- `features/dashboardTabs/index.tsx`: `ControlsBar` instead of
  `DashboardFiltersBar`; `hasQuietActions` on each `DraggableTab`; the tabs' stuck detector offset
  from `getTabsStickyOffset` (`editBand.ts`, the band's height in edit mode).
- `ee/features/embed/EmbedDashboard/components/EmbedDashboard.tsx`:
  `isEmbedFilterRailEnabled` (flag on, and not an embed editor in edit mode)
  turns on `isControlsEnabled` for the header and filter bar, and
  renders `TabCounts` and `FieldTilesBar` (`TileOverlays` waits for mapping). A dashboard with
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
- `FilterConfiguration/utils`: `getFilterRuleWithRequired` takes
  `savedDefaultRule` (only the editor passes it).
- Embed: `EmbedDashboardFilterBar` and `EmbedDashboardHeader` take
  `isControlsEnabled`.

Pure moves out of shipped files, now shared by both sides:
`ActiveFilters/` (`FilterRuleLabel`, `FilterPillSkeletons`,
`TemporaryFilters`, `UnresolvedFilter`, `FilterPillButton`,
`useFilterTabPlacement`, `filterLabels`, `filterLock`, `filterOrder`),
`FilterConfiguration/` (`FilterValueSection`, `SqlColumnSelect`, and in
`utils` the rule helpers such as `getFilterRuleWithDisabledState`,
`isLockedRequiredMissingValue`, `getFilterRuleFilterType`,
`getRequiredGroupMemberUpdates`, `getDimensionFiltersToSave`), the embed's `EmbedResetFiltersButton`, and `Dashboard/DashboardPerformanceWarning`.
Fix behaviour in the shared piece, once, never in a copy.

## Map

| File | Owns |
| --- | --- |
| `ControlsSidebarProvider.tsx`, `useControlsSidebar.ts`, `sidebarState.ts` | The edit state, every write to filters, focus return; pure state helpers |
| `ControlsSidebarPage.tsx` | Drop-in for `Page`: the provider plus tab counts, link prompts, field bar |
| `ControlsBar.tsx` | The shipped bar with its openings; picks flat or `SectionedFilters` |
| `AddControl.tsx`, `FilterBarMenu.tsx` | "Add filter" and the editor's "..." menu (viewers setting, "Filter rules"); `InertWhileEditing` |
| `FilterPills.tsx`, `FilterPill.tsx`, `TemporaryFilterPills.tsx` | Bar pills: an editor's, a viewer's saved and own pills (each anchors the editor), an editor's temporary pills (shipped) |
| `SettledFilterFields.tsx` | Keeps the last fields while tiles reload, so the bar does not flash a first load |
| `FilterEditor.tsx` | `EditorPopover`, under a pill or "Add filter": the prompt, the body, Cancel and Apply |
| `FilterSettings.tsx`, `FilterValueSettings.tsx`, `ViewerControls.tsx` | Popover body: value, "Applies to", the Settings view (name, section, required, lock) |
| `FieldsAndTiles.tsx`, `FieldRow.tsx`, `fieldCandidates.ts` | The filter's fields list and field search |
| `peers.ts` | Multi-field model on the saved shape, scopes, counts |
| `FieldTilesBar.tsx`, `useFieldTileActions.ts`, `useBarHost.ts` | Floating field bar; the one place a field's counts and actions are computed |
| `TileOverlay.tsx`, `LazySelect.tsx`, `tileProps.ts`, `tileSelector.ts` | Per-tile veil and card |
| `TabCounts.tsx`, `usePortalTargets.ts`, `useTileHover.ts`, `useScrollToHighlightedTile.ts` | Tab counts, portal targets and sibling locking, pill hover marks, scroll to tile |
| `LinkPrompts.tsx`, `linkCandidates.ts` | Link prompts on tiles added while editing |
| `SectionedFilters.tsx`, `SectionMenu.tsx`, `SectionNameInput.tsx`, `sections.ts` | Sections bar, drag and drop, naming; pure section helpers |
| `SelectionBar.tsx`, `SelectionActions.tsx`, `barSelection.ts` | Multi-select on the sectioned bar |
| `sectionVersionChanges.ts` | Section rows for the version comparison page |
| `DashboardHeaderGuard.tsx` | Edit mode band (Editing, name; Add tile, Save dashboard, Cancel, "...") in place of the header; inert while an editor's filter is edited |
| `useEditorDismiss.ts` | Escape handling while a filter is edited |
| `DropdownClass.tsx`, `railContractClasses.ts` | Embed class contract on the editor popover and portalled lists |
| `requirements.ts`, `fieldLabels.ts` | Requirement rules, count copy |

## Invariants

Each one has broken before or would break silently.

- **One filled button.** While a filter is edited the editor's Apply is the only
  filled button on screen: the inert band draws Save dashboard as an outline, and the
  field bar, selection bar and follow-ups never use `filled`.
- **No state reset in an effect.** Open/closed, highlighted field, pending
  switch, undo, follow-ups and selection are all derived on render. The one
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
  go to the temporary filters; a saved filter's Apply goes through the
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
(Settings, "Applies to", link prompts, section controls, tips) stays literal.
See `src/components/common/Filters/AGENTS.md`.

## Styling and motion

- Animate `opacity` and `transform` only: other properties run once per tile.
  A shadow that must appear sits on its own layer and fades.
- No React state, effects, refs, timers or context for motion; a replay is a
  `key` on a small leaf. Closing is immediate.
- Motion values are declared once per stylesheet as `--controls-*` custom
  properties on its root class; every stylesheet switches them off under
  `prefers-reduced-motion: reduce`.
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
