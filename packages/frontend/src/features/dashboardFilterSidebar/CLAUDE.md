# Dashboard filter sidebar

A new dashboard filter bar and sidebar, built next to the shipped one in
`features/dashboardFilters`. `FilterBar` replaces `DashboardFiltersBar` at one
seam in `features/dashboardTabs/index.tsx`.

- **Flag**: `FeatureFlags.DashboardFilterSidebar` (`dashboard-filter-sidebar`),
  read with `useServerFeatureFlag`. Frontend only. Flag off means today's bar.
- **Shipped components are imported, not edited.** Import from
  `features/dashboardFilters`, `features/parameters` and `features/dateZoom`.
- Saved data keeps today's `DashboardFilterRule` shape. No new saved fields.

## Sidebar

- `EditorShell` is the one chrome for `FilterSidebar` and `ParameterSidebar`: header (Back for drafts, title, reach line, More actions menu, Cancel), an `aboveTabs` slot for the label, tabs with counts, body, right-aligned footer. Add chrome there, not in either sidebar.

- `FilterSidebarPage` is a drop-in for `components/common/Page/Page`. It wraps
  the page in `FilterSidebarProvider` and always passes `FilterSidebar` as the
  left `sidebar`, toggling only `isSidebarOpen`, so the dashboard grid never
  remounts when the sidebar opens or closes.
- `FilterSidebarProvider` / `useFilterSidebar` hold which filter is being
  edited. `open` snapshots `dashboardFilters` and `haveFiltersChanged`;
  `updateFilter` writes to the dashboard context so charts preview live;
  `cancel` restores the snapshot; `apply` keeps the edits. Saving to the server
  stays with the dashboard Save button. Pure helpers live in `sidebarState.ts`.
- Edit mode renders `AddFilter` (an "Add" button calling `openNew`) and
  `FilterPills` (click opens the sidebar, hover X removes). View mode keeps the
  shipped `DashboardFilters`.
- `openNew` opens with no field; `addFirstField` appends a draft rule (no
  value, empty label) so it previews; `cancel` drops it with the snapshot.

## Parameters (controls)

- A `ParameterControl` (`parameterControls.ts`) overrides N dashboard parameters of one kind (`ParameterKind`: string, number or date; never boolean). "Add" lists free parameters next to fields in `FieldPicker`; clicking one calls `addControl` with a fresh uuid, an empty label, the key's kind, that one key and empty `tileTargets`.
- Saved: only the values, written through the dashboard's parameter values (`getControlValue` reads the first key). A dashboard saved today loads one control per saved value (`getControlsFromSavedValues`).
- Session-only until a saved shape exists: the control itself (id, label, which keys it groups), its chart targeting (`tileTargets[tileUuid]` holds the key that sets the chart, or `false` to skip it; a missing entry falls back to the first key the chart references), hidden tabs (`hiddenTabUuids`) and placement (`bar` or `more`). The sidebar marks these "Not saved".
- The control's "Parameters and charts" tab is the same card as a filter's: one `FieldRow` per key with `getKeyCount`, All / None / Remove through `applyKeyToAll`, `clearKeyFromAll` and `removeKey`; the tile overlay offers "+ Use {key}" / "Switch to {key}" through `setControlTileKey`. Counts come from `getControlCount`, `getControlTabCounts` and `getControlTabCountsForKey`.
- `getFreeParameterKeys` lists the keys of a kind referenced by a tile and not yet taken by a control; `getControlTileKey` and `doesControlApplyToTile` resolve targeting from `tileParameterReferences`.
- `parameterSources.ts` resolves each tile's source and value with the shipped `getDashboardTileParameterSource` and `getDashboardTileParameterOverrides`, using `tileChartSavedParameters`; a referenced key with no value anywhere is `none` ("needs a value").

## Peer fields on today's saved shape

- The first field is the rule's `target`.
- A peer field on a tile is `tileTargets[tileUuid] = { fieldId, tableName }`.
- A tile left out is `tileTargets[tileUuid] = false`.
- A chart uses exactly one field of the filter.
- Helpers live in `peers.ts`.
- Pill drag-to-reorder is not carried over.

## Flag-gated lines in shipped files

- `features/dashboardTabs/index.tsx`: `FilterBar` instead of `DashboardFiltersBar`.
- `pages/Dashboard.tsx`: `FilterSidebarPage` instead of `Page` for the main page.

## Session-only settings

Lost on reload, marked "Not saved". What saving each would need:

- Field listed at 0 charts: a per-filter field list.
- Waiting field (picked, not yet placed): the same per-filter field list.
- Hide per tab: `hiddenTabUuids` on the rule, enforced like `lockedTabUuids`.
- Picker: a picker type on the rule, plus the calendar presets.
- Operators allowed: an allowed-operators list on the rule.
- Filter boundaries: a bounding rule (allowed values or date range) on the rule.
- Placement (bar or More): saved bar sections with a filter order.
- Unplaced filters (kind first, or fields cleared): a rule with an empty
  `target` and no `tileTargets`, kept in `unplacedFilters` and shown as a
  "Not saved" pill until `addFirstField` gives it a field; saving one would
  need a rule that is allowed to have no target.
- Link prompts: tiles present when editing starts are snapshotted; a tile added
  later whose explore has a peer field of a filter, or another field of the same
  kind, shows a card asking to link it (`LinkPrompts.tsx`, `getLinkCandidates` in `linkCandidates.ts`).
  An exact match on the filter's own field still links on its own. Skipped
  prompts live in a session list; Link writes `tileTargets` on the rule.

- `FieldPicker` is single pick: one click on a kind tile calls `onPickKind`, on a field `onPickField`, on a parameter `onPickParameter`; search alone narrows the list. `fieldKinds.ts` classifies fields with `getFilterTypeFromItemType` and groups them by explore. "Add a field" passes `lockedKind` and no `onPickKind`.
- New-filter flow: a kind tile calls `openKind`, which creates an unplaced rule (empty `target`, held in `unplacedFilters`) and lands on Interactivity; a field calls `addFirstField`, which also places an unplaced rule keeping its id, label and settings; a parameter calls `addControl` with one key.
- A field has one name everywhere: `getFieldDisplayLabel` in `fieldGrains.ts` names a time grain by its base dimension ("Created", never "Created day").
- The sidebar lands on Interactivity after one pick; the footer's only commit verb is "Apply" and its subject is the label or "This filter".
