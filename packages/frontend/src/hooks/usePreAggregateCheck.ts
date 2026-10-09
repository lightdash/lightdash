import {
    type ApiError,
    type ApiPreAggregateCheckResponse,
    type MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import { convertDateFilters } from '../utils/dateFilter';

const checkPreAggregate = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    exploreName: string,
    metricQuery: MetricQuery,
    usePreAggregateCache: boolean,
) =>
    lightdashApi<ApiPreAggregateCheckResponse['results']>({
        url: `/projects/${projectUuid}/explores/${exploreName}/preAggregateCheck`,
        method: 'POST',
        body: JSON.stringify({
            ...metricQuery,
            filters: convertDateFilters(metricQuery.filters),
            usePreAggregateCache,
        }),
    });

export const usePreAggregateCheck = ({
    projectUuid,
    exploreName,
    metricQuery,
    usePreAggregateCache,
    enabled,
}: {
    projectUuid: string | undefined;
    exploreName: string | undefined;
    metricQuery: MetricQuery | undefined;
    usePreAggregateCache: boolean;
    enabled: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    return useQuery<ApiPreAggregateCheckResponse['results'], ApiError>({
        queryKey: [
            'preAggregateCheck',
            projectUuid,
            exploreName,
            metricQuery,
            usePreAggregateCache,
        ],
        queryFn: () =>
            checkPreAggregate(
                lightdashApi,
                projectUuid!,
                exploreName!,
                metricQuery!,
                usePreAggregateCache,
            ),
        keepPreviousData: true,
        enabled: enabled && !!projectUuid && !!exploreName && !!metricQuery,
    });
};
