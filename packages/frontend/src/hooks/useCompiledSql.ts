import {
    derivePivotConfigurationFromChart,
    FeatureFlags,
    getFieldsFromMetricQuery,
    type ApiCompiledQueryResults,
    type ApiError,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfiguration,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import {
    selectAdditionalMetrics,
    selectChartConfig,
    selectCustomDimensions,
    selectDimensions,
    selectFilters,
    selectMetrics,
    selectParameters,
    selectPivotConfig,
    selectQueryLimit,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    selectTimezone,
    useExplorerSelector,
} from '../features/explorer/store';
import { convertDateFilters } from '../utils/dateFilter';
import { useExplore } from './useExplore';
import { useProjectUuid } from './useProjectUuid';
import useQueryError from './useQueryError';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

const getCompiledQuery = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
    queryParameters?: ParametersValuesMap,
    pivotConfiguration?: PivotConfiguration,
) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
        parameters: queryParameters,
        ...(pivotConfiguration && { pivotConfiguration }),
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
    const projectUuid = useProjectUuid();

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
    const chartConfig = useExplorerSelector(selectChartConfig);
    const pivotConfig = useExplorerSelector(selectPivotConfig);

    const { data: explore } = useExplore(tableId);
    const { data: useSqlPivotResults } = useServerFeatureFlag(
        FeatureFlags.UseSqlPivotResults,
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

    // Derive pivot configuration when SQL pivot results are enabled
    let pivotConfiguration: PivotConfiguration | undefined;
    if (useSqlPivotResults?.enabled && explore) {
        const items = getFieldsFromMetricQuery(metricQuery, explore);
        pivotConfiguration = derivePivotConfigurationFromChart(
            { chartConfig, pivotConfig },
            metricQuery,
            items,
        );
    }

    const queryKey = [
        'compiledQuery',
        tableId,
        metricQuery,
        projectUuid,
        timezone,
        queryParameters,
        pivotConfiguration,
    ];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getCompiledQuery(
                projectUuid!,
                tableId || '',
                metricQuery,
                queryParameters,
                pivotConfiguration,
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
