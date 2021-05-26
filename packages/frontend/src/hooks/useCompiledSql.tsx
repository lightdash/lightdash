import {useExploreConfig} from "./useExploreConfig";
import {lightdashApi} from "../api";
import {ApiCompiledQueryResults, MetricQuery} from "common";
import {useQuery} from "react-query";

const getCompiledQuery = async (tableId: string, query: MetricQuery) => {
    return await lightdashApi<ApiCompiledQueryResults>({
        url: `/tables/${tableId}/compileQuery`,
        method: 'POST',
        body: JSON.stringify(query)
    })
}

export const useCompliedSql = () => {
    const {
        activeTableName: tableId,
        activeDimensions: dimensions,
        activeMetrics: metrics,
        sortFields: sorts,
        activeFilters: filters,
        resultsRowLimit: limit,
    } = useExploreConfig()
    const metricQuery = {
        dimensions: Array.from(dimensions),
        metrics: Array.from(metrics),
        sorts,
        filters,
        limit: limit || 500
    }
    const queryKey = ['compiledQuery', tableId, metricQuery]
    const query = useQuery({
        enabled: tableId !== undefined,
        queryKey,
        queryFn: () => getCompiledQuery(tableId || '', metricQuery)
    })
    return query
}