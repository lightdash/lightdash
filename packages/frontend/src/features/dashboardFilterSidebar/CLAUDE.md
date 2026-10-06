# Dashboard filter sidebar

A new dashboard filter bar and sidebar, built next to the shipped one in
`features/dashboardFilters`. `FilterBar` replaces `DashboardFiltersBar` at one
seam in `features/dashboardTabs/index.tsx`.

- **Flag**: `FeatureFlags.DashboardFilterSidebar` (`dashboard-filter-sidebar`),
  read with `useServerFeatureFlag`. Frontend only. Flag off means today's bar.
- **Shipped components are imported, not edited.** Import from
  `features/dashboardFilters`, `features/parameters` and `features/dateZoom`.
- Saved data keeps today's `DashboardFilterRule` shape. No new saved fields.

## Session-only settings

None yet.
