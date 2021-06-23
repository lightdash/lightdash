import React, {Dispatch, SetStateAction, useEffect, useState} from 'react';
import {ApiError, ApiQueryResults, friendlyName} from "common";
import {UseQueryResult} from "react-query";


const pivot = (values: { [key: string]: any }[], indexKey: string, pivotKey: string, metricKey: string) => {
    return Object.values(values.reduce((acc, value) => {
        acc[value[indexKey]] = acc[value[indexKey]] || {[indexKey]: value[indexKey]}
        acc[value[indexKey]][value[pivotKey]] = value[metricKey]
        return acc
    }, {}))
}

type ChartConfigBase = {
    setXDimension: (x: string) => void,
    toggleYMetric: (y: string) => void,
    setGroupDimension: (g: string | undefined) => void,
    dimensionOptions: string[],
    metricOptions: string[],
    eChartDimensions: {name: string, displayName: string}[],
    series: string[],
}
export type ChartConfig = ChartConfigBase & ({
    seriesLayout: ValidSeriesLayout,
    plotData: {[col: string]: any}[],
} | {
    seriesLayout: SeriesLayout,
    plotData: undefined,
})

type ValidSeriesLayout = {
    xDimension: string,
    yMetrics: string[],
    groupDimension: string | undefined,
}
type SeriesLayout = Partial<ValidSeriesLayout>

const defaultLayout = (queryResults: UseQueryResult<ApiQueryResults, ApiError>): SeriesLayout => {
    if (queryResults.data) {
        const xDimension = queryResults.data.metricQuery.dimensions[0]
        const groupDimension = queryResults.data.metricQuery.dimensions.length > 1 ? queryResults.data.metricQuery.dimensions[1] : undefined
        const yMetrics = groupDimension === undefined ? queryResults.data.metricQuery.metrics : queryResults.data.metricQuery.metrics.slice(0, 1)
        return {
            xDimension,
            yMetrics,
            groupDimension,
        } as ValidSeriesLayout
    }
    return {
        xDimension: undefined,
        yMetrics: undefined,
        groupDimension: undefined,
    }
}

const isValidSeriesLayout = (seriesLayout: SeriesLayout): seriesLayout is ValidSeriesLayout => {
    return !!seriesLayout.xDimension && !!seriesLayout.yMetrics && seriesLayout.yMetrics.length > 0;
}

export const useChartConfig = (queryResults: UseQueryResult<ApiQueryResults, ApiError>): ChartConfig => {
    const [seriesLayout, setSeriesLayout] = useState<SeriesLayout>(defaultLayout(queryResults))
    const dimensionOptions = queryResults.data?.metricQuery.dimensions || []
    const metricOptions = queryResults.data?.metricQuery.metrics || []

    useEffect(() => {
        if (queryResults.data) {
            setSeriesLayout(defaultLayout(queryResults))
        }
    }, [queryResults.data])

    const setXDimension = (xDimension: string) => {
        if (queryResults.data)
            setSeriesLayout(layout => {
                const groupDimension = xDimension === layout.groupDimension ? dimensionOptions.find(d => d !== xDimension) : layout.groupDimension
                return {...layout, xDimension, groupDimension}
            })
    }

    const setGroupDimension = (groupDimension: string | undefined) => {
        if (queryResults.data)
            setSeriesLayout(layout => {
                const yMetrics = groupDimension && layout.yMetrics && layout.yMetrics.length > 1 ? [layout.yMetrics[0]] : layout.yMetrics
                const xDimension = groupDimension === layout.xDimension ? dimensionOptions.find(d => d !== groupDimension) : layout.xDimension
                return {groupDimension, yMetrics, xDimension}
            })
    }

    const toggleYMetric = (yMetric: string) => {
        if (queryResults.data)
            setSeriesLayout(layout => {
                if (!layout.yMetrics)
                    return {...layout, yMetrics: [yMetric]}
                const idx = layout.yMetrics.findIndex(m => m === yMetric)
                if (idx === -1)
                    return {...layout, yMetrics: [...layout.yMetrics, yMetric]}
                if (layout.yMetrics.length === 1)
                    return layout
                return {...layout, yMetrics: [...layout.yMetrics.slice(0, idx), ...layout.yMetrics.slice(idx + 1)]}
            })
    }

    if (queryResults.data && isValidSeriesLayout(seriesLayout)){
        const plotData = seriesLayout.groupDimension
            ? pivot(queryResults.data.rows, seriesLayout.xDimension, seriesLayout.groupDimension, seriesLayout.yMetrics[0])
            : queryResults.data.rows
        const groupDimension = seriesLayout.groupDimension
        const series = groupDimension
            ? Array.from(new Set(queryResults.data.rows.map(r => r[groupDimension])))
            : seriesLayout.yMetrics
        return {
            setXDimension,
            setGroupDimension,
            toggleYMetric,
            seriesLayout,
            plotData,
            eChartDimensions: [
                {name: seriesLayout.xDimension, displayName: friendlyName(seriesLayout.xDimension)},
                ...series.map(s => ({name: s, displayName: seriesLayout.groupDimension ? s : friendlyName(s)}))
            ],
            metricOptions,
            dimensionOptions,
            series,
        }
    }
    return {
        setXDimension,
        setGroupDimension,
        toggleYMetric,
        seriesLayout,
        plotData: undefined,
        eChartDimensions: [],
        metricOptions,
        dimensionOptions,
        series: [],
    }
}