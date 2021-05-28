import {buildQuery} from "../queryBuilder";
import {runQuery} from "../api";
import {useExploreConfig} from "./useExploreConfig";
import {useExplores} from "./useExplores";

export const useSqlQuery = () => {
    const {
        setIsTableDataLoading,
        setTableData,
        activeFields,
        activeDimensions,
        activeMetrics,
        sortFields,
        activeTableName,
        activeFilters,
        setError,
        resultsRowLimit
    } = useExploreConfig()
    const exploreResults = useExplores()
    const activeExplore = (exploreResults.data || []).find(e => e.name === activeTableName)
    const renderedSql: string | undefined = activeExplore && activeFields.size > 0
        ? buildQuery({
            explore: activeExplore,
            dimensions: Array.from(activeDimensions),
            metrics: Array.from(activeMetrics),
            filters: activeFilters,
            sorts: sortFields,
            limit: resultsRowLimit || 500,
        })
        : undefined
    const refresh = () => {
        setIsTableDataLoading(true)
        setTableData(null)
        if (renderedSql !== undefined)
            runQuery(renderedSql)
                .then(response => {
                    if (response.status === 'error') {
                        setTableData(null)
                        setError({title: 'Error running SQL query', text: response.error.data.databaseResponse})
                    }
                    else
                        setTableData(response.results)
                    setIsTableDataLoading(false)
                })
    }
    return { refresh, renderedSql }
}