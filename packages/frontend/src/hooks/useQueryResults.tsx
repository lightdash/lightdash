import {ApiQueryResults, MetricQuery} from "common";
import {lightdashApi} from "../api";
import {useExploreConfig} from "./useExploreConfig";
import {useQuery} from "react-query";

const getQueryResults = async (tableId: string, query: MetricQuery) => {
    return await lightdashApi<ApiQueryResults>({
        url: `/tables/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify(query)
    })
}
export const useQueryResults = () => {
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
    const queryKey = ['queryResults', tableId, metricQuery]
    const query = useQuery({
        queryKey,
        queryFn: () => getQueryResults(tableId || '', metricQuery),
        enabled: false,  // don't run automatically
        keepPreviousData: true, // changing the query won't update results until fetch
    })
    return query
}