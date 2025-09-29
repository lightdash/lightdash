import {
    type ApiCompiledQueryResults,
    type ApiError,
    type MetricQuery,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
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
    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const {
        dimensions,
        metrics,
        sorts,
        filters,
        limit,
        tableCalculations,
        additionalMetrics,
        customDimensions,
        timezone,
    } = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery,
    );

    const queryParameters = useExplorerContext(
        (context) => context.state.unsavedChartVersion.parameters || {},
    );

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
    };
    const queryKey = [
        'compiledQuery',
        tableId,
        metricQuery,
        projectUuid,
        timezone,
        queryParameters,
    ];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        enabled: !!tableId,
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
