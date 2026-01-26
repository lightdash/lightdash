import { type ApiMetricsWithAssociatedTimeDimensionResponse } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GetMetricsWithTimeDimensionArgs = {
    projectUuid?: string;
    tableName?: string;
};

const getMetricsWithTimeDimensions = async ({
    projectUuid,
    tableName,
}: UseMetricsWithTimeDimensionArgs) => {
    const params = new URLSearchParams(
        Object.entries({
            ...(tableName ? { tableName } : {}),
        }),
    );
    return lightdashApi<
        ApiMetricsWithAssociatedTimeDimensionResponse['results']
    >({
        url: `/projects/${projectUuid}/dataCatalog/metrics-with-time-dimensions${
            params.toString() ? `?${params.toString()}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

type UseMetricsWithTimeDimensionArgs = GetMetricsWithTimeDimensionArgs & {
    options?: UseQueryOptions<
        ApiMetricsWithAssociatedTimeDimensionResponse['results']
    >;
};

export const useCatalogMetricsWithTimeDimensions = ({
    projectUuid,
    tableName,
    options,
}: UseMetricsWithTimeDimensionArgs) => {
    return useQuery({
        queryKey: [
            projectUuid,
            'catalog',
            'metricsWithTimeDimensions',
            tableName,
        ],
        queryFn: () => getMetricsWithTimeDimensions({ projectUuid, tableName }),
        ...options,
    });
};
