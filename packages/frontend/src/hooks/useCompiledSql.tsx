import { ApiCompiledQueryResults, ApiError, MetricQuery } from 'common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../api';
import { useExplorer } from '../providers/ExplorerProvider';

const getCompiledQuery = async (tableId: string, query: MetricQuery) =>
    lightdashApi<ApiCompiledQueryResults>({
        url: `/explores/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(query),
    });

export const useCompliedSql = () => {
    const {
        state: {
            tableName: tableId,
            dimensions,
            metrics,
            sorts,
            filters,
            limit,
            selectedTableCalculations,
            tableCalculations,
        },
    } = useExplorer();
    const metricQuery: MetricQuery = {
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts,
        filters,
        limit: limit || 500,
        tableCalculations: tableCalculations.filter(({ name }) =>
            selectedTableCalculations.includes(name),
        ),
    };
    const queryKey = ['compiledQuery', tableId, metricQuery];
    return useQuery<ApiCompiledQueryResults, ApiError>({
        enabled: tableId !== undefined,
        queryKey,
        queryFn: () => getCompiledQuery(tableId || '', metricQuery),
    });
};
