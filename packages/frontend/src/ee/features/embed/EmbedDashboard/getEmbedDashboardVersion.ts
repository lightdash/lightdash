import {
    type Dashboard,
    type DashboardFilters,
    type DashboardParameters,
    type DashboardVersionedFields,
} from '@lightdash/common';
import { combineDashboardFilters } from '../../../../features/dashboard/store';
import {
    restoreFilterLabelOverrides,
    type DashboardFilterLabelOverrides,
} from './filterLabelOverrides';

/** The embedded dashboard as it is now: unsaved edits, added filters and current parameters */
export const getEmbedDashboardVersion = ({
    dashboard,
    tiles,
    tabs,
    filters,
    temporaryFilters,
    parameters,
    isAddFilterDisabled,
    filterLabelOverrides,
}: {
    dashboard: Pick<Dashboard, 'filters' | 'config'>;
    tiles: Dashboard['tiles'];
    tabs: Dashboard['tabs'];
    filters: DashboardFilters;
    temporaryFilters: DashboardFilters;
    parameters: DashboardParameters;
    isAddFilterDisabled: boolean;
    filterLabelOverrides: DashboardFilterLabelOverrides;
}): DashboardVersionedFields => ({
    tiles,
    tabs,
    filters: restoreFilterLabelOverrides(
        combineDashboardFilters(filters, temporaryFilters),
        dashboard.filters,
        filterLabelOverrides,
    ),
    parameters,
    // Embeds never seed the date zoom flag in the store, so keep the saved one
    config: {
        ...dashboard.config,
        isDateZoomDisabled: dashboard.config?.isDateZoomDisabled ?? false,
        isAddFilterDisabled,
    },
});
