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

## Parameters (read only)

- `ParameterValuesButton` on the bar calls `openParameters`; `ParameterSidebar` and `ParameterOverlays` show where each chart's parameter value comes from. Nothing is edited.
- `parameterSources.ts` resolves each tile's source and value with the shipped `getDashboardTileParameterSource` and `getDashboardTileParameterOverrides`, using the per-tile chart-saved values the dashboard context exposes as `tileChartSavedParameters`; a referenced key with no value anywhere is `none` ("needs a value").
- `isParametersOpen` is separate from `editing` and is false while a filter is being edited.

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
- Not implemented: a chart added later does not pick up a peer field for its
  explore.

- `FieldPicker` is controlled: the caller owns `chosen` and `kind` (a `FilterType`); `fieldKinds.ts` classifies fields with `getFilterTypeFromItemType` and groups them by explore.
- New-filter flow: Continue calls `addFirstField(chosen[0])` then `listFieldId` for the rest; "Add a field" uses `mode="single"` with `lockedKind`.
- A field has one name everywhere: `getFieldDisplayLabel` in `fieldGrains.ts` names a time grain by its base dimension ("Created", never "Created day").
- The sidebar lands on Interactivity after Continue; the footer's only commit verb is "Apply" and its subject is the label or "This filter".
