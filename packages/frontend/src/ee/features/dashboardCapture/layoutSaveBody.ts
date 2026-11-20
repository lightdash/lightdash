import {
    type Dashboard,
    type DashboardTile,
    type UpdateDashboard,
} from '@lightdash/common';

/** Update body for saving a new tile layout; absent fields are left out, not nulled. */
export const buildLayoutSaveBody = (
    dashboard: Dashboard,
    tiles: DashboardTile[],
): UpdateDashboard => ({
    tiles,
    filters: dashboard.filters,
    tabs: dashboard.tabs,
    ...(dashboard.config ? { config: dashboard.config } : {}),
    ...(dashboard.parameters ? { parameters: dashboard.parameters } : {}),
});
