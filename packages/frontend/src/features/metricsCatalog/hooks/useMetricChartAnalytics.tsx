import {
    type ApiCatalogAnalyticsResults,
    type ApiError,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const getMetricChartAnalytics = async (
    lightdashApi: LightdashApi,
    {
        projectUuid,
        table,
        field,
    }: {
        projectUuid: string;
        table: string;
        field: string;
    },
) => {
    return lightdashApi<ApiCatalogAnalyticsResults>({
        url: `/projects/${projectUuid}/dataCatalog/${table}/analytics/${field}`,
        method: 'GET',
        body: undefined,
    });
};

export const useMetricChartAnalytics = ({
    projectUuid,
    table,
    field,
}: {
    projectUuid?: string;
    table?: string;
    field?: string;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiCatalogAnalyticsResults, ApiError>({
        queryKey: ['metric-chart-analytics', projectUuid, table, field],
        queryFn: () =>
            getMetricChartAnalytics(lightdashApi, {
                projectUuid: projectUuid!,
                table: table!,
                field: field!,
            }),
        enabled: !!projectUuid && !!table && !!field,
    });
};
