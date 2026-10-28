# Dashboard controls

The filter rail, bar and tile overlays that replace the dashboard filter bar
and popover. A _control_ is a filter control on the bar; it narrows data
through fields. User-facing copy says _tile_, never _chart_.

- **Flag**: `FeatureFlags.DashboardControls` (`dashboard-controls`), read with
  `useServerFeatureFlag`. Flag off, the dashboard behaves exactly as before.
- **Saved data keeps today's shape**: `DashboardFilterRule` (plus
  `sectionId`) and `DashboardConfig`. Expose only what a dashboard can
  already save; never add a field the shipped app cannot read.

## Topic docs

Read the matching file before changing that area:

- [`docs/provider.md`](docs/provider.md): read when changing
  `ControlsSidebarProvider`, an edit's lifecycle (open, switch, Apply,
  Cancel, mode change), "changed"/dirty rules, undo or focus return.
- [`docs/editor.md`](docs/editor.md): read when changing the rail's content,
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
  through `DashboardHeaderGuard`; `PageSpinner` until the flag's
  `isInitialLoading` ends, so `Page` is never swapped for
  `ControlsSidebarPage` (that remounts the grid).
- `features/dashboardTabs/index.tsx`: `ControlsBar` instead of
  `DashboardFiltersBar`; `ControlSidebar` first in the grid row with
  `CONTROLS_RAIL_LAYOUT`; `hasQuietActions` on each `DraggableTab`.
- `ee/features/embed/EmbedDashboard/components/EmbedDashboard.tsx`:
  `isEmbedFilterRailEnabled` (flag on, and not an embed editor in edit mode)
  turns on `isControlsEnabled` for the grid, header and filter bar, and
  renders `TileOverlays`, `TabCounts` and `FieldTilesBar`. A dashboard with
  no tiles has no grid, so its header gets `isControlsEnabled={false}`.

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
  `isLockSpaceReserved`, `areActionsHidden`, `leadingIcon`;
  `Filter`: `openLeadingIcon`.
- `FilterConfiguration/FilterFieldSelect`: `defaultOpened`, `withLabel`,
  `placeholder`, `withinPortal`.
- `FilterConfiguration/utils`: `getFilterRuleWithRequired` takes
  `savedDefaultRule` (only the rail passes it).
- Embed: `EmbedDashboardFilterBar` and `EmbedDashboardHeader` take
  `isControlsEnabled`.

Pure moves out of shipped files, now shared by both sides:
`ActiveFilters/` (`FilterRuleLabel`, `FilterPillSkeletons`,
`TemporaryFilters`, `UnresolvedFilter`, `FilterPillButton`,
`useFilterTabPlacement`, `filterLabels`, `filterLock`, `filterOrder`),
`FilterConfiguration/` (`FilterValueSection`, `SqlColumnSelect`, and in
`utils` the rule helpers such as `getFilterRuleWithDisabledState`,
`isLockedRequiredMissingValue`, `getFilterRuleFilterType`,
`getRequiredGroupMemberUpdates`), and the embed's `EmbedResetFiltersButton`.
Fix behaviour in the shared piece, once, never in a copy.

## Map

| File | Owns |
| --- | --- |
| `ControlsSidebarProvider.tsx`, `useControlsSidebar.ts`, `sidebarState.ts` | The edit state, every write to filters, focus return; pure state helpers |
| `ControlsSidebarPage.tsx` | Drop-in for `Page`: the provider plus overlays, tab counts, link prompts, field bar |
| `ControlsBar.tsx` | The shipped bar with its openings; picks flat or `SectionedFilters` |
| `AddControl.tsx`, `FilterBarMenu.tsx` | "Add filter" and the editor's "..." menu (viewers setting, "Filter rules"); `InertWhileEditing` |
| `FilterPills.tsx`, `FilterPill.tsx`, `ViewerSavedPills.tsx`, `TemporaryFilterPills.tsx` | Bar pills: editor pills, a viewer's saved pills (shipped `Filter`), temporary pills |
| `ChangedDot.tsx`, `EditBadge.tsx` | "Changed" dot on pills and capsules; "Editing" badge on the edited pill |
| `SettledFilterFields.tsx` | Keeps the last fields while tiles reload, so the bar does not flash a first load |
| `ControlSidebar.tsx`, `EditorShell.tsx`, `useRailTop.ts`, `useRailIntoView.ts` | The rail: placement, sticky offset, scroll into view below `sm` |
| `FilterSettings.tsx`, `FilterValueSettings.tsx`, `ViewerControls.tsx` | Rail body: value, "Tiles", "Rules" (lock, required) |
| `FieldsAndTiles.tsx`, `FieldRow.tsx`, `fieldCandidates.ts` | The filter's fields list and field search |
| `peers.ts` | Multi-field model on the saved shape, scopes, counts |
| `FieldTilesBar.tsx`, `useFieldTileActions.ts`, `useBarHost.ts` | Floating field bar; the one place a field's counts and actions are computed |
| `TileOverlay.tsx`, `LazySelect.tsx`, `tileProps.ts`, `tileSelector.ts` | Per-tile veil and card |
| `TabCounts.tsx`, `usePortalTargets.ts`, `useTileHover.ts`, `useScrollToHighlightedTile.ts` | Tab counts, portal targets and sibling locking, pill hover marks, scroll to tile |
| `LinkPrompts.tsx`, `linkCandidates.ts` | Link prompts on tiles added while editing |
| `SectionedFilters.tsx`, `SectionMenu.tsx`, `SectionNameInput.tsx`, `sections.ts` | Sections bar, drag and drop, naming; pure section helpers |
| `SelectionBar.tsx`, `SelectionActions.tsx`, `barSelection.ts` | Multi-select on the sectioned bar |
| `SectionsTip.tsx`, `useSectionsTip.ts` | The one-time sections tip |
| `DashboardHeaderGuard.tsx` | Shipped header made inert while an editor's filter is edited |
| `useEditorDismiss.ts` | Escape handling while a filter is edited |
| `DropdownClass.tsx`, `railContractClasses.ts` | Embed class contract on the rail and portalled lists |
| `requirements.ts`, `railSummaries.ts`, `fieldLabels.ts` | Requirement rules, disclosure summaries, count copy |

## Invariants

Each one has broken before or would break silently.

- **One filled button.** While a filter is edited the rail's Apply is the only
  filled button on screen: the header guard draws Save as default, and the
  field bar, selection bar and follow-ups never use `filled`.
- **No state reset in an effect.** Open/closed, highlighted field, pending
  switch, undo, follow-ups and selection are all derived on render. The one
  exception is the mode-change effect in the provider (browser Back, a typed
  URL, an embed's `isEditMode`), which closes the edit as Apply does.
- **The provider is the only writer.** The editor writes the edited rule with
  `updateFilter` and any other rule with `updateOtherFilters`, never the
  dashboard's `setDashboardFilters` directly; Cancel can only undo what it
  recorded.
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
- **A viewer never writes saved filters.** Outside edit mode every write goes
  to the temporary filters, so the URL carries it; a viewer's saved pills
  stay the shipped popover.
- **Overlays never stop events.** No `stopPropagation` on an overlay: Mantine
  closes lists on a `mousedown` that reaches `document`. A caller that locks
  siblings (`usePortalTargets(..., lockSiblings)`) must portal an overlay
  into every target it gets.
- **Focus return depends on DOM markers.** Keep `data-controls-pill` on each
  pill and `[data-filter-actions] > button[data-dashboard-filter-control]`
  on "Add filter", and `data-controls-apply` on Apply.
- **Escape does one thing per press.** Anything owning its own Escape marks
  itself `data-own-escape`; open lists are detected by `hasOpenLayer`.
- **Embeds.** The rail goes through `contractClasses` and `DropdownClass`
  (the embed class contract: `ld-dashboard-filter-rail`,
  `ld-dashboard-filter`, `ld-dashboard-add-filter`,
  `ld-dashboard-filter-dropdown`, `ld-dashboard-add-filter-dropdown`); keep
  them on the equivalent element. An embed editor's Save sends the loaded
  `dashboard.config` and the store's rules, so sections survive. The embed
  resolves the flag for the JWT's organisation
  (`FeatureFlagService.getForAccount`).
- **Saved section keys survive every rewrite**: `sectionId` is carried in
  `applyDimensionOverrides` / `applyMetricOverrides`, `adoptPlaceholder` and
  the emptied placeholder; `buildDashboardConfig` carries
  `parameterSections` forward. See `docs/sections.md`.
- **`data-tour-*` anchors** on the bar are the shipped bar's; keep them.

## Strings

Viewers and embeds see the rail, tile cards, field bar and tab counts, so
their copy lives in `DEFAULT_UI_STRINGS` (`filters.rail.*`,
`filters.tileCard.*`, `filters.fieldBar.*`, or a shipped key that fits),
read with `useUiStrings`; counts go through `formatTileCount` /
`formatFieldCount` in `fieldLabels.ts`. Add every new key to both locale
bundles in `packages/sdk-test-app/public/locales/`. Copy only an editor sees
(label input, "Rules", link prompts, section controls, tips) stays literal.
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
- Nothing changes width or reflows when the rail opens, a field row is
  hovered or a drag starts: pills reserve their lock slot, tab counts reserve
  their widest fraction. Keep any new piece to that.

## Tests

Each component has a sibling `*.test.tsx` / `*.test.ts` here; the embed's are
in `ee/features/embed/EmbedDashboard/components/*.test.tsx`, and
`utils/dashboardConfig.test.ts` pins saved config. Run one file at a time:

```bash
pnpm -F frontend test src/features/dashboardControls/ControlsSidebarProvider.test.tsx
```
