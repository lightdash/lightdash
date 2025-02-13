import type {
    ApiChartAndResults,
    Dashboard,
    DashboardFilters,
    DateGranularity,
    InteractivityOptions,
} from '@lightdash/common';
import { lightdashApi } from '../../../../api';

export const postEmbedDashboard = (projectUuid: string, embedToken: string) => {
    return lightdashApi<Dashboard & InteractivityOptions>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken!,
        },
        body: undefined,
    });
};

export const postEmbedChartAndResults = (
    projectUuid: string,
    embedToken: string,
    tileUuid: string,
    dashboardFilters: DashboardFilters,
    dateZoomGranularity: DateGranularity | undefined,
) => {
    return lightdashApi<ApiChartAndResults>({
        url: `/embed/${projectUuid}/chart-and-results`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken!,
        },
        body: JSON.stringify({
            tileUuid,
            dashboardFilters,
            dateZoomGranularity,
        }),
    });
};
