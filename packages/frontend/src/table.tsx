import {Dimension, fieldId, friendlyName, Measure} from "common";
import React from "react";

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

const getMeasureFormatter = () => {
    return formatWrapper(formatNumber)
}

export const buildColumns = (dimensions: Dimension[], measures: Measure[]) => {
    const dimColumns = dimensions.map( dim => ({
        Header: <span>{friendlyName(dim.table)} <b>{friendlyName(dim.name)}</b></span>,
        accessor: fieldId(dim),
        Cell: getDimensionFormatter(dim),
        isDimension: true,
        dimensionType: dim.type,
    }))
    const measureColumns = measures.map(m => ({
        Header: <span>{friendlyName(m.table)} <b>{friendlyName(m.name)}</b></span>,
        accessor: fieldId(m),
        Cell: getMeasureFormatter(),
        isDimension: false,
    }))
    return [...dimColumns, ...measureColumns]
}
