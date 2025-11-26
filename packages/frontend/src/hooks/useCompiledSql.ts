import {
    type ApiCompiledQueryResults,
    type ApiError,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectDimensions,
    selectFilters,
    selectMetrics,
    selectParameters,
    selectPeriodOverPeriod,
    selectQueryLimit,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    selectTimezone,
    useExplorerSelector,
} from '../features/explorer/store';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

const getCompiledQuery = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
    queryParameters?: ParametersValuesMap,
) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
        parameters: queryParameters,
    };

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
};

export const useCompiledSql = (
    queryOptions?: UseQueryOptions<ApiCompiledQueryResults, ApiError>,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    const tableId = useExplorerSelector(selectTableName);
    const dimensions = useExplorerSelector(selectDimensions);
    const metrics = useExplorerSelector(selectMetrics);
    const filters = useExplorerSelector(selectFilters);
    const sorts = useExplorerSelector(selectSorts);
    const limit = useExplorerSelector(selectQueryLimit);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const timezone = useExplorerSelector(selectTimezone);
    const queryParameters = useExplorerSelector(selectParameters);
    const periodOverPeriod = useExplorerSelector(selectPeriodOverPeriod);

    const setErrorResponse = useQueryError();
    const metricQuery: MetricQuery = {
        exploreName: tableId,
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts,
        filters,
        limit: limit || 500,
        tableCalculations,
        additionalMetrics,
        customDimensions,
        timezone: timezone ?? undefined,
        periodOverPeriod,
    };

    const queryKey = [
        'compiledQuery',
        tableId,
        metricQuery,
        projectUuid,
        timezone,
        queryParameters,
        periodOverPeriod,
    ];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getCompiledQuery(
                projectUuid!,
                tableId || '',
                metricQuery,
                queryParameters,
            ),
        onError: (result) => setErrorResponse(result),
        keepPreviousData: true,
        ...queryOptions,
        enabled: (queryOptions?.enabled ?? true) && !!tableId && !!projectUuid,
    });
};

export const useCompiledSqlFromMetricQuery = ({
    tableName,
    projectUuid,
    metricQuery,
}: Partial<{
    tableName: string;
    projectUuid: string;
    metricQuery: MetricQuery;
}>) => {
    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey: ['compiledQuery', tableName, metricQuery, projectUuid],
        queryFn: () => getCompiledQuery(projectUuid!, tableName!, metricQuery!),
        enabled: !!tableName && !!projectUuid && !!metricQuery,
    });
};
