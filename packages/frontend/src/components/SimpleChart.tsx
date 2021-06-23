import EChartsReact from "echarts-for-react";
import React from "react";
import {friendlyName} from "common";
import {ChartConfig} from "../hooks/useChartConfig";
import {NonIdealState} from "@blueprintjs/core";

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
            // eslint-disable-next-line
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
            // eslint-disable-next-line
            const nope: never = chartType
    }
}
type SimpleChartProps = {
    chartType: ChartType,
    chartConfig: ChartConfig,
}
export const SimpleChart = ({chartType, chartConfig}: SimpleChartProps) => {
    if(chartConfig.plotData === undefined)
        return <EmptyChart/>
    const xlabel = friendlyName(chartConfig.seriesLayout.xDimension)
    const ylabel = chartConfig.seriesLayout.groupDimension && friendlyName(chartConfig.seriesLayout.yMetrics[0])
    const xType = 'category'
    const yType = 'value'

    const flipX = flipXFromChartType(chartType)
    const xAxis = {
        type: flipX ? yType : xType,
        name: flipX ? ylabel: xlabel,
    }
    const yAxis = {
        type: flipX ? xType : yType,
        name: flipX ? xlabel: ylabel,
    }

    const legend = {
        show: (chartConfig.metricOptions.length + chartConfig.dimensionOptions.length) > 2,
    }

    const series = chartConfig.series.map(() => ({type: echartType(chartType)})).slice(0, 10) // not more than 10 lines
    const options = {
        xAxis,
        yAxis,
        series,
        legend,
        dataset: {
            id: 'lightdashResults',
            source: chartConfig.plotData,
            dimensions: chartConfig.eChartDimensions,
        },
        tooltip: {
            show: true,
            trigger: 'item',
        },
    }
    return <div style={{padding: 10}}>
        <EChartsReact option={options} notMerge={true}/>
    </div>
}

const EmptyChart = () => (
    <div style={{padding: '50px 0'}}>
        <NonIdealState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon='chart'
        />
    </div>
)
