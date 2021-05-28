import {Dimension, fieldId, friendlyName, getDimensions, getMetrics, SortField} from "common";
import {useExplores} from "./useExplores";
import {useExploreConfig} from "./useExploreConfig";
import React, {useMemo} from "react";

const formatDate = (date: string | Date) => new Date(date).toISOString().slice(0, 10)
const formatTimestamp = (datetime: string | Date) => new Date(datetime).toISOString()
const formatNumber = (v: number) => `${v}`
const formatString = (v: string) => `${v}`
const formatBoolean = (v: boolean | string) => `${v}` in ['True', 'true', 'yes', 'Yes', '1', 'T'] ? 'Yes' : 'No'
const formatWrapper = (formatter: (value: any) => string) => {
    return ({value}: any) => {
        if (value === null)
            return '∅'
        else if (value === undefined)
            return '-'
        else
            return formatter(value)
    }
}
const getDimensionFormatter = (d: Dimension) => {
    const dimensionType = d.type
    switch (dimensionType) {
        case "string":
            return formatWrapper(formatString)
        case "number":
            return formatWrapper(formatNumber)
        case "boolean":
            return formatWrapper(formatBoolean)
        case "date":
            return formatWrapper(formatDate)
        case "timestamp":
            return formatWrapper(formatTimestamp)
        default:
            const nope: never = dimensionType
            throw Error(`Dimension formatter is not implemented for dimension type ${dimensionType}`)
    }
}
const getMetricFormatter = () => {
    return formatWrapper(formatNumber)
}
const getSortByProps = (fieldId: string, sortFields: SortField[], toggleSortField: (fieldId: string) => void) => {
    const getSortByToggleProps = () => ({
        style: {
            cursor: 'pointer',
        },
        title: 'Toggle SortBy',
        onClick: (e: MouseEvent) => toggleSortField(fieldId),
    })

    const sortedIndex = sortFields.findIndex(sf => fieldId === sf.fieldId)
    return {
        getSortByToggleProps,
        sortedIndex,
        isSorted: sortedIndex !== -1,
        isSortedDesc: sortedIndex === -1 ? undefined : sortFields[sortedIndex].descending,
        isMultiSort: sortFields.length > 1,
    }
}
export const useColumns = () => {
    const exploresResults = useExplores()
    const {activeFields, activeTableName, sortFields, toggleSortField} = useExploreConfig()
    const activeExplore = (exploresResults.data || []).find(e => e.name === activeTableName)
    const dimensions = (activeExplore ? getDimensions(activeExplore) : []).filter(d => activeFields.has(fieldId(d)))
    const metrics = (activeExplore ? getMetrics(activeExplore) : []).filter(m => activeFields.has(fieldId(m)))
    const dimColumns = dimensions.map(dim => ({
        Header: <span>{friendlyName(dim.table)} <b>{friendlyName(dim.name)}</b></span>,
        accessor: fieldId(dim),
        Cell: getDimensionFormatter(dim),
        isDimension: true,
        dimensionType: dim.type,
        ...getSortByProps(fieldId(dim), sortFields, toggleSortField),
    }))
    const metricColumns = metrics.map(m => ({
        Header: <span>{friendlyName(m.table)} <b>{friendlyName(m.name)}</b></span>,
        accessor: fieldId(m),
        Cell: getMetricFormatter(),
        isDimension: false,
        ...getSortByProps(fieldId(m), sortFields, toggleSortField),
    }))
    const result = useMemo(() => [...dimColumns, ...metricColumns], [activeFields, activeTableName, sortFields, exploresResults.status])
    return result
}