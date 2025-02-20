import {
    type ApiCompiledQueryResults,
    type ApiError,
    type MetricQuery,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { difference } from 'lodash';
import { useMemo } from 'react';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

const getCompiledQuery = async (
    projectUuid: string,
    tableId: string,
    query: MetricQuery,
    subtotalGroupings: string[],
) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };

    return lightdashApi<ApiCompiledQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify({
            ...timezoneFixQuery,
            subtotalGroupings,
        }),
    });
};

export const useCompiledSql = (
    queryOptions?: UseQueryOptions<ApiCompiledQueryResults, ApiError>,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const tableId = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const columnOrder = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableConfig.columnOrder,
    );
    const pivotColumns = useExplorerContext(
        (context) => context.state.unsavedChartVersion.pivotConfig?.columns,
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

    // TODO: subtotals: de-duplicate with ExplorerProvider
    const subtotalGroupings = useMemo(
        () => difference(columnOrder, [...metrics, ...(pivotColumns ?? [])]),
        [columnOrder, metrics, pivotColumns],
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
    ];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        enabled: tableId !== undefined,
        queryKey,
        queryFn: () =>
            getCompiledQuery(
                projectUuid!,
                tableId || '',
                metricQuery,
                subtotalGroupings,
            ),
        onError: (result) => setErrorResponse(result),
        ...queryOptions,
    });
};
