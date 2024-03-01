import {
    ApiCompiledQueryResults,
    ApiError,
    Explore,
    MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

const getCustomCompiledQuery = async (
    projectUuid: string,
    explore: Explore,
    metricQuery: MetricQuery,
) => {
    const timezoneFixQuery = {
        ...metricQuery,
        filters: convertDateFilters(metricQuery.filters),
    };

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/explores/compileCustomQuery`,
        method: 'POST',
        body: JSON.stringify({
            explore: explore,
            metricQuery: timezoneFixQuery,
        }),
    });
};

export const useCustomCompiledSql = (
    projectUuid: string,
    explore: Explore | undefined,
    metricQuery: MetricQuery,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey: [projectUuid, 'customCompiledQuery', explore, metricQuery],
        queryFn: () =>
            getCustomCompiledQuery(projectUuid, explore!, metricQuery),
        onError: (result) => {
            setErrorResponse(result);
        },

        enabled: !!explore,
    });
};
