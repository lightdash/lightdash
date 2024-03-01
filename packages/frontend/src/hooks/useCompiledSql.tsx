import {
    ApiCompiledQueryResults,
    ApiError,
    MetricQuery,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

const getCompiledQuery = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
};

export const useCompiledSql = (
    projectUuid: string,
    tableId: string,
    metricQuery: MetricQuery,
) => {
    const setErrorResponse = useQueryError();

    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey: [projectUuid, 'compiledQuery', tableId, metricQuery],
        queryFn: () =>
            getCompiledQuery(projectUuid, tableId || '', metricQuery),
        onError: (result) => setErrorResponse(result),

        enabled: !!tableId,
    });
};
