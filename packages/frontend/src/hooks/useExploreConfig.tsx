import React, {useEffect, useMemo, useState} from 'react';
import {useHistory, useLocation, useParams} from "react-router-dom";
import {fieldId, FilterGroup, SortField} from "common";

type SidebarPanel = 'base' | 'explores'

type ContextProps = {
    activeTableName: string | undefined,
    setActiveTableName: (tableName: string) => void,
    activeFields: Set<string>,
    toggleActiveField: (fieldName: string) => void,
    sidebarPanel: SidebarPanel,
    setSidebarPanel: (panelName: SidebarPanel) => void,
    sortFields: SortField[],
    setSortFields: (sortFields: SortField[]) => void,
    toggleSortField: (fieldId: string) => void,
    tableData: {[col: string]: any}[],
    setTableData: (data: {[col: string]: any}[]) => void,
    isTableDataLoading: boolean,
    setIsTableDataLoading: (val: boolean) => void,
    activeFilters: FilterGroup[],
    setActiveFilters: (filters: FilterGroup[]) => void,
}
const context = React.createContext<ContextProps>({
    activeTableName: undefined,
    setActiveTableName: () => {},
    activeFields: new Set<string>(),
    toggleActiveField: () => {},
    sidebarPanel: 'base',
    setSidebarPanel: () => {},
    sortFields: [],
    setSortFields: () => {},
    toggleSortField: () => {},
    tableData: [],
    setTableData: () => {},
    isTableDataLoading: false,
    setIsTableDataLoading: () => {},
    activeFilters: [],
    setActiveFilters: () => {},
});

export const ExploreConfigContext: React.FC = ({ children }) => {
    const searchParams = new URLSearchParams(useLocation().search)
    const pathParams = useParams<{tableId: string | undefined}>()
    const history = useHistory()

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
    const fieldSearchParam = searchParams.get('fields')
    const activeFields = new Set<string>(fieldSearchParam === null ? [] : fieldSearchParam.split(','))
    const setActiveFields = (fields: Set<string>) => {
        const newParams = new URLSearchParams(searchParams)
        if (fields.size === 0)
            newParams.delete('fields')
        else
            newParams.set('fields', Array.from(fields).join(','))
        history.replace({
            pathname: history.location.pathname,
            search: newParams.toString(),
        })
    }
    const toggleActiveField = (field: string) => {
        const newFields = new Set(activeFields)
        if (!newFields.delete(field))
            newFields.add(field)
        setActiveFields(newFields)
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
    const sortFields: SortField[] = sortSearchParam === null ? [] : JSON.parse(sortSearchParam)
    const setSortFields = (sortFields: SortField[]) => {
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

    const [tableData, setTableData] = useState<{[col: string]: any}[]>([])
    const [isTableDataLoading, setIsTableDataLoading] = useState(false)


    // Remove sorts if out of date
    useEffect(() => {
        if (sortFields.some(sf => !activeFields.has(sf.fieldId)))
            setSortFields([])
    }, [sortFields, setSortFields])


    const contextValue = {
        activeTableName,
        setActiveTableName,
        activeFields,
        toggleActiveField,
        sidebarPanel,
        setSidebarPanel,
        sortFields,
        setSortFields,
        toggleSortField,
        tableData,
        setTableData,
        isTableDataLoading,
        setIsTableDataLoading,
        activeFilters,
        setActiveFilters,
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
        toggleActiveField,
        sidebarPanel,
        setSidebarPanel,
        sortFields,
        setSortFields,
        toggleSortField,
        tableData,
        setTableData,
        isTableDataLoading,
        setIsTableDataLoading,
        activeFilters,
        setActiveFilters,
    } = React.useContext(context)

    return {
        activeTableName,
        setActiveTableName,
        activeFields,
        toggleActiveField,
        sidebarPanel,
        setSidebarPanel,
        sortFields: useMemo(() => sortFields, [sortFields]),
        setSortFields: useMemo(() => setSortFields, [setSortFields]),
        toggleSortField: useMemo(() => toggleSortField, [toggleSortField]),
        tableData: useMemo(() => tableData, [tableData]),
        setTableData,
        isTableDataLoading,
        setIsTableDataLoading,
        activeFilters,
        setActiveFilters,
    }
}