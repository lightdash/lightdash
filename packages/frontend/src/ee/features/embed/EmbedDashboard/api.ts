import type {
    ApiChartAndResults,
    Dashboard,
    DashboardFilters,
    DateGranularity,
    InteractivityOptions,
    SortField,
} from '@lightdash/common';
import { lightdashApi } from '../../../../api';

export const postEmbedDashboard = (projectUuid: string) => {
    return lightdashApi<Dashboard & InteractivityOptions>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        body: undefined,
    });
};

export const postEmbedChartAndResults = (
    projectUuid: string,
    tileUuid: string,
    dashboardFilters: DashboardFilters,
    dateZoomGranularity: DateGranularity | undefined,
    dashboardSorts: SortField[],
) => {
    return lightdashApi<ApiChartAndResults>({
        url: `/embed/${projectUuid}/chart-and-results`,
        method: 'POST',
        body: JSON.stringify({
            tileUuid,
            dashboardFilters,
            dateZoomGranularity,
            dashboardSorts,
        }),
    });
};
