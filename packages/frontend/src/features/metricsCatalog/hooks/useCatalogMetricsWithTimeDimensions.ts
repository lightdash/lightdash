import { type ApiMetricsWithAssociatedTimeDimensionResponse } from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

type GetMetricsWithTimeDimensionArgs = {
    projectUuid?: string;
};

const getMetricsWithTimeDimensions = async ({
    projectUuid,
}: UseMetricsWithTimeDimensionArgs) => {
    return lightdashApi<
        ApiMetricsWithAssociatedTimeDimensionResponse['results']
    >({
        url: `/projects/${projectUuid}/dataCatalog/metrics-with-time-dimensions`,
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
    options,
}: UseMetricsWithTimeDimensionArgs) => {
    return useQuery({
        queryKey: [projectUuid, 'catalog', 'metricsWithTimeDimensions'],
        queryFn: () => getMetricsWithTimeDimensions({ projectUuid }),
        ...options,
    });
};
