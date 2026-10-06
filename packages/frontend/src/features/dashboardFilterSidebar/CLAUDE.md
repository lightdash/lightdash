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

Lost on apply, cancel or reload; saving them needs a per-filter field list.

- A field listed while it sits on 0 charts.
- A waiting field (picked, not yet placed on a chart).
- Not implemented: a chart added later does not pick up a peer field for its
  explore.
