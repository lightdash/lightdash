import {Dimension, Explore, fieldId, friendlyName, getDimensions, getMetrics} from "common";
import React from "react";
import useActiveFields from "./hooks/useActiveFields";

const formatDate = (date: string | Date) => new Date(date).toISOString().slice(0, 10)
const formatTimestamp = (datetime: string | Date) => new Date(datetime).toISOString()
const formatNumber = (v: number) => `${v}`
const formatString = (v: string) => `${v}`
const formatBoolean = (v: boolean | string) => `${v}` in ['True', 'true', 'yes', 'Yes', '1', 'T'] ? 'Yes' : 'No'

const formatWrapper = (formatter: (value: any) => string) => {
    return ({ value }: any) => {
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
    switch(dimensionType) {
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

export const useColumns = (activeExplore: Explore | undefined) => {
    const { activeFields } = useActiveFields()
    const dimensions = (activeExplore ? getDimensions(activeExplore) : []).filter(d => activeFields.has(fieldId(d)))
    const metrics = (activeExplore ? getMetrics(activeExplore) : []).filter(m => activeFields.has(fieldId(m)))
    const dimColumns = dimensions.map( dim => ({
        Header: <span>{friendlyName(dim.table)} <b>{friendlyName(dim.name)}</b></span>,
        accessor: fieldId(dim),
        Cell: getDimensionFormatter(dim),
        isDimension: true,
        dimensionType: dim.type,
    }))
    const metricColumns = metrics.map(m => ({
        Header: <span>{friendlyName(m.table)} <b>{friendlyName(m.name)}</b></span>,
        accessor: fieldId(m),
        Cell: getMetricFormatter(),
        isDimension: false,
    }))
    return [...dimColumns, ...metricColumns]
}
