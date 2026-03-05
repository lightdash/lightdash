import {
    type ApiCompiledPreAggregateQueryResults,
    type ApiError,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfiguration,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectDimensions,
    selectFilters,
    selectMetrics,
    selectParameters,
    selectQueryLimit,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    selectTimezone,
    useExplorerSelector,
} from '../features/explorer/store';
import { convertDateFilters } from '../utils/dateFilter';
import { useProjectUuid } from './useProjectUuid';

const getCompiledPreAggregateQuery = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
    preAggregateName: string,
    queryParameters?: ParametersValuesMap,
    pivotConfiguration?: PivotConfiguration,
) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
        parameters: queryParameters,
        ...(pivotConfiguration && { pivotConfiguration }),
        preAggregateName,
    };

    return lightdashApi<ApiCompiledPreAggregateQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/compilePreAggregateQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
};

export const useCompiledPreAggregateSql = ({
    preAggregateName,
    enabled,
}: {
    preAggregateName: string | null;
    enabled: boolean;
}) => {
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
        'compiledPreAggregateQuery',
        tableId,
        metricQuery,
        projectUuid,
        preAggregateName,
        queryParameters,
    ];

    return useQuery<ApiCompiledPreAggregateQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getCompiledPreAggregateQuery(
                projectUuid!,
                tableId || '',
                metricQuery,
                preAggregateName!,
                queryParameters,
            ),
        keepPreviousData: true,
        enabled: enabled && !!tableId && !!projectUuid && !!preAggregateName,
    });
};
