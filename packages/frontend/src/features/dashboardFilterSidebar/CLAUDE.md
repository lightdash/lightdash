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
- Edit mode renders `AddFilter` (shipped add button wiring) and `FilterPills`
  (click opens the sidebar). View mode keeps the shipped `DashboardFilters`.
- Pill drag-to-reorder is not carried over.

## Flag-gated lines in shipped files

- `features/dashboardTabs/index.tsx`: `FilterBar` instead of `DashboardFiltersBar`.
- `pages/Dashboard.tsx`: `FilterSidebarPage` instead of `Page` for the main page.

## Session-only settings

None yet.
