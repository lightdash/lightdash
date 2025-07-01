import type {
    ApiEmbedExecuteAsnycDashboardChartQuery,
    ApiEmbedExecuteAsnycDashboardChartQueryResults,
    ApiEmbedGetAsyncQueryResults,
    Dashboard,
    InteractivityOptions,
} from '@lightdash/common';
import { lightdashApi } from '../../../../api';

export const postEmbedDashboard = (projectUuid: string, embedToken: string) => {
    return lightdashApi<Dashboard & InteractivityOptions>({
        url: `/embed/${projectUuid}/dashboard`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: undefined,
    });
};

export const postEmbedExecuteAsyncDashboardChart = (
    projectUuid: string,
    embedToken: string,
    body: ApiEmbedExecuteAsnycDashboardChartQuery,
) => {
    return lightdashApi<
        ApiEmbedExecuteAsnycDashboardChartQueryResults['results']
    >({
        url: `/embed/${projectUuid}/dashboard-chart`,
        method: 'POST',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: JSON.stringify(body),
    });
};

export const getEmbedAsyncQueryResults = (
    projectUuid: string,
    queryUuid: string,
    embedToken: string,
    page?: number,
    pageSize?: number,
) => {
    const searchParams = new URLSearchParams();
    if (page) {
        searchParams.set('page', page.toString());
    }
    if (pageSize) {
        searchParams.set('pageSize', pageSize.toString());
    }

    const urlQueryParams = searchParams.toString();
    return lightdashApi<ApiEmbedGetAsyncQueryResults['results']>({
        url: `/embed/${projectUuid}/query/${queryUuid}${
            urlQueryParams ? `?${urlQueryParams}` : ''
        }`,
        method: 'GET',
        headers: {
            'Lightdash-Embed-Token': embedToken,
        },
        body: undefined,
    });
};
