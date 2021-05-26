import React, {useEffect, useMemo, useState} from 'react';
import {useHistory, useLocation, useParams} from "react-router-dom";
import { FilterGroup, SortField} from "common";

type SidebarPanel = 'base' | 'explores'

type ContextProps = {
    activeTableName: string | undefined,
    setActiveTableName: (tableName: string) => void,
    activeFields: Set<string>,
    activeDimensions: Set<string>,
    activeMetrics: Set<string>,
    validQuery: boolean,
    toggleActiveField: (fieldName: string, isDimension: boolean) => void,
    sidebarPanel: SidebarPanel,
    setSidebarPanel: (panelName: SidebarPanel) => void,
    sortFields: SortField[],
    setSortFields: (sortFields: SortField[]) => void,
    toggleSortField: (fieldId: string) => void,
    activeFilters: FilterGroup[],
    setActiveFilters: (filters: FilterGroup[]) => void,
    error: {title: string, text: string} | undefined,
    setError: (errors: {title: string, text: string}) => void,
    resultsRowLimit: number | undefined,
    setResultsRowLimit: (limit: string | undefined) => void,
}
const context = React.createContext<ContextProps>({
    activeTableName: undefined,
    setActiveTableName: () => {},
    activeFields: new Set<string>(),
    activeDimensions: new Set<string>(),
    activeMetrics: new Set<string>(),
    validQuery: false,
    toggleActiveField: () => {},
    sidebarPanel: 'base',
    setSidebarPanel: () => {},
    sortFields: [],
    setSortFields: () => {},
    toggleSortField: () => {},
    activeFilters: [],
    setActiveFilters: () => {},
    error: undefined,
    setError: () => {},
    resultsRowLimit: 500,
    setResultsRowLimit: () => {},
});

export const ExploreConfigContext: React.FC = ({ children }) => {
    const { search } = useLocation()
    const searchParams = useMemo(() => (
        new URLSearchParams(search)
    ), [search])
    const pathParams = useParams<{tableId: string | undefined}>()
    const history = useHistory()

    // Global error state
    const [error, setError] = useState<{title: string, text: string} | undefined>()

    // Currently active table
    const activeTableName = pathParams.tableId
    const setActiveTableName = (tableName: string) => {
        const newParams = new URLSearchParams(searchParams)
        newParams.set('sidebar', 'explores')
        if (tableName !== activeTableName) {
            newParams.delete('fields')
            newParams.delete('sort')
        }
        history.push({
            pathname: `/tables/${tableName}`,
            search: newParams.toString(),
        })
    }

    // Currently active fields
    const dimensionSearchParam = searchParams.get('dimensions')
    const activeDimensions = useMemo(() => (
        new Set<string>(dimensionSearchParam === null ? [] : dimensionSearchParam.split(','))
    ), [dimensionSearchParam])

    const metricSearchParam = searchParams.get('metrics')
    const activeMetrics = useMemo(() => (
        new Set<string>(metricSearchParam === null ? [] : metricSearchParam.split(','))
    ), [metricSearchParam])

    const activeFields = useMemo(() => (
        new Set<string>([...activeDimensions, ...activeMetrics])
    ), [activeDimensions, activeMetrics])

    const validQuery = activeFields.size > 0

    const setActiveDimensions = (dimensions: Set<string>) => {
        const newParams = new URLSearchParams(searchParams)
        if (dimensions.size === 0)
            newParams.delete('dimensions')
        else
            newParams.set('dimensions', Array.from(dimensions).join(','))
        history.replace({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }

    const setActiveMetrics = (metrics: Set<string>) => {
        const newParams = new URLSearchParams(searchParams)
        if (metrics.size === 0)
            newParams.delete('metrics')
        else
            newParams.set('metrics', Array.from(metrics).join(','))
        history.replace({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }

    const toggleActiveField = (fieldId: string, isDimension: boolean) => {
        if (isDimension) {
            const newDimensions = new Set(activeDimensions)
            if (!newDimensions.delete(fieldId))
                newDimensions.add(fieldId)
            setActiveDimensions(newDimensions)
        }
        else {
            const newMetrics = new Set(activeMetrics)
            if (!newMetrics.delete(fieldId))
                newMetrics.add(fieldId)
            setActiveMetrics(newMetrics)
        }
    }

    // Sidebar state
    const sidebarPanel: SidebarPanel = (searchParams.get('sidebar') || 'base') === 'explores' ? 'explores' : 'base'
    const setSidebarPanel = (panelName: SidebarPanel) => {
        const newParams = new URLSearchParams(searchParams)
        newParams.set('sidebar', panelName)
        history.push({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }

    // Active sorts
    const sortSearchParam = searchParams.get('sort')
    const sortFields: SortField[] = useMemo(() => (
        sortSearchParam === null ? [] : JSON.parse(sortSearchParam)
    ), [sortSearchParam])

    const setSortFields = useMemo(() => (
        (sortFields: SortField[]) => {
            // Can't sort a field that's not active
            sortFields.filter(sf => activeFields.has(sf.fieldId))
            const newParams = new URLSearchParams(searchParams)
            if (sortFields.length === 0)
                newParams.delete('sort')
            else
                newParams.set('sort', JSON.stringify(sortFields))
            history.replace({
                pathname: history.location.pathname,
                search: newParams.toString(),
            })
        }
    ), [activeFields, searchParams, history])
    // First lets try single sort
    const toggleSortField = (fieldId: string) => {
        const prevState = sortFields.find(sf => sf.fieldId === fieldId)
        if (prevState === undefined)
            setSortFields([{fieldId, descending: false}])
        else if (!prevState.descending)
            setSortFields([{fieldId, descending: true}])
        else
            setSortFields([])
    }


    // Active filters applied to the table
    const filterSearchParam = searchParams.get('filters')
    const activeFilters: FilterGroup[] = filterSearchParam === null ? [] : JSON.parse(filterSearchParam)
    const setActiveFilters = (activeFilters: FilterGroup[]) => {
        const newParams = new URLSearchParams(searchParams)
        if (activeFilters.length === 0)
            newParams.delete('filters')
        else
            newParams.set('filters', JSON.stringify(activeFilters))
        history.replace({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }

    // Row limit
    const limitSearchParam = searchParams.get('limit')
    const resultsRowLimit = limitSearchParam && !isNaN(parseInt(limitSearchParam)) ? parseInt(limitSearchParam) : 500
    const setResultsRowLimit = (rowLimit: string | undefined) => {
        const newParams = new URLSearchParams(searchParams)
        if (rowLimit === undefined)
            newParams.delete('limit')
        else
            newParams.set('limit', `${rowLimit}`)
        history.replace({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }

    // Remove sorts if out of date
    useEffect(() => {
        if (sortFields.some(sf => !activeFields.has(sf.fieldId)))
            setSortFields([])
    }, [sortFields, setSortFields, activeFields])


    const contextValue = {
        activeTableName,
        setActiveTableName,
        activeFields,
        activeDimensions,
        activeMetrics,
        validQuery,
        toggleActiveField,
        sidebarPanel,
        setSidebarPanel,
        sortFields,
        setSortFields,
        toggleSortField,
        activeFilters,
        setActiveFilters,
        error,
        setError,
        resultsRowLimit,
        setResultsRowLimit,
    }

    return (
        <context.Provider value={contextValue}>{children}</context.Provider>
    )
}

export const useExploreConfig = () => {
    const {
        activeTableName,
        setActiveTableName,
        activeFields,
        activeDimensions,
        activeMetrics,
        validQuery,
        toggleActiveField,
        sidebarPanel,
        setSidebarPanel,
        sortFields,
        setSortFields,
        toggleSortField,
        activeFilters,
        setActiveFilters,
        error,
        setError,
        resultsRowLimit,
        setResultsRowLimit,
    } = React.useContext(context)

    return {
        activeTableName,
        setActiveTableName,
        activeFields,
        activeDimensions,
        activeMetrics,
        validQuery,
        toggleActiveField,
        sidebarPanel,
        setSidebarPanel,
        sortFields: useMemo(() => sortFields, [sortFields]),
        setSortFields: useMemo(() => setSortFields, [setSortFields]),
        toggleSortField: useMemo(() => toggleSortField, [toggleSortField]),
        activeFilters,
        setActiveFilters,
        error,
        setError,
        resultsRowLimit,
        setResultsRowLimit,
    }
}