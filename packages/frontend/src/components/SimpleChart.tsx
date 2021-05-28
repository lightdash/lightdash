import {useExploreConfig} from "../hooks/useExploreConfig";
import EChartsReact from "echarts-for-react";
import React from "react";
import {Dimension, FieldId, friendlyName, Metric} from "common";

const echartMap: {[key in Dimension['type'] | Metric['type']]: string} = {
    'date': 'time',
    'string': 'ordinal',
    'timestamp': 'time',
    'boolean': 'ordinal',
    'number': 'number',
    'max': 'number',
    'min': 'number',
    'count': 'number',
    'count_distinct': 'number',
    'sum': 'number',
    'average': 'number',
}

const pivot = (values: { [key: string]: any }[], indexKey: string, pivotKey: string, metricKey: string) => {
    return Object.values(values.reduce((acc, value) => {
        acc[value[indexKey]] = acc[value[indexKey]] || {[indexKey]: value[indexKey]}
        acc[value[indexKey]][value[pivotKey]] = value[metricKey]
        return acc
    }, {}))
}
const defaultEchartDimensions = (results: { [key: string]: any }[], dimensions: FieldId[], metrics: FieldId[]) => {
    if (metrics.length === 0)
        return undefined
    switch (dimensions.length) {
        case 0:
            return undefined
        case 1:
            // With just one dimension: create a series per metric
            return {
                data: results,
                echartDimensions: [...dimensions, ...metrics].map(field => ({
                    name: field,
                    displayName: friendlyName(field)
                }))
            }
        case 2:
            // Two dimensions: pivot on the second dimension and only use the first metric
            const indexKey = dimensions[0]
            const pivotKey = dimensions[1]
            const metricKey = metrics[0]
            const data = pivot(results, indexKey, pivotKey, metricKey)
            const seriesNames = [...new Set(results.map(r => r[pivotKey]))]
            return {
                data: data,
                echartDimensions: [
                    {
                        name: indexKey,
                        displayName: friendlyName(dimensions[0]),
                    },
                    ...seriesNames.map(name => ({name: name, displayName: name}))
                ]
            }
        default:
            // Otherwise we only plot the first dimension and a series per metric
            const [first, ...rest] = dimensions
            return {
                data: results,
                echartDimensions: [
                    {
                        name: first,
                        displayName: friendlyName(first),
                    },
                    ...metrics.map(field => ({name: field, displayName: friendlyName(field)}))
                ]
            }
    }
}
export type ChartType = 'line' | 'column' | 'bar' | 'scatter'
const flipXFromChartType = (chartType: ChartType) => {
    switch (chartType) {
        case "column":
            return false
        case "bar":
            return true
        case "line":
            return false
        case "scatter":
            return false
        default:
            const nope: never = chartType
    }
}
const echartType = (chartType: ChartType) => {
    switch (chartType) {
        case "line":
            return 'line'
        case "bar":
            return 'bar'
        case "column":
            return 'bar'
        case "scatter":
            return 'scatter'
        default:
            const nope: never = chartType
    }
}
type SimpleChartProps = {
    chartType: ChartType,
}
export const SimpleChart = ({chartType}: SimpleChartProps) => {
    // Different behaviour depending on dimensions
    const {activeDimensions, activeMetrics, tableData} = useExploreConfig()
    const plotData = defaultEchartDimensions(tableData, Array.from(activeDimensions), Array.from(activeMetrics))
    if (!plotData)
        return <span>Can't plot</span>
    const flipX = flipXFromChartType(chartType)
    const [xdim, ...ydims] = plotData.echartDimensions
    const options = {
        dataset: {
            id: 'lightdashResults',
            source: plotData.data,
            dimensions: plotData.echartDimensions,
        },
        xAxis: {
            type: flipX ? 'value' : 'category',
            name: flipX ? ydims[0].displayName : xdim.displayName,
        },
        tooltip: {
            show: true,
            trigger: 'item',
        },
        yAxis: {
            type: flipX ? 'category' : 'value',
            name: flipX ? xdim.displayName : ydims[0].displayName,
        },
        series: ydims.map(d => ({type: echartType(chartType)})),
        legend: {
            show: ydims.length > 1 ? true : false,
        }
    }
    return <div style={{padding: 10}}>
        <EChartsReact option={options} notMerge={true}/>
    </div>
}