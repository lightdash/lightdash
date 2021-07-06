import EChartsReact from 'echarts-for-react';
import React, { RefObject, FC } from 'react';
import { friendlyName } from 'common';
import { NonIdealState } from '@blueprintjs/core';
import { ChartConfig } from '../hooks/useChartConfig';

export type ChartType = 'line' | 'column' | 'bar' | 'scatter';
const flipXFromChartType = (chartType: ChartType) => {
    switch (chartType) {
        case 'column':
            return false;
        case 'bar':
            return true;
        case 'line':
            return false;
        case 'scatter':
            return false;
        default:
            // eslint-disable-next-line
            const nope: never = chartType;
            return undefined;
    }
};
const echartType = (chartType: ChartType) => {
    switch (chartType) {
        case 'line':
            return 'line';
        case 'bar':
            return 'bar';
        case 'column':
            return 'bar';
        case 'scatter':
            return 'scatter';
        default:
            // eslint-disable-next-line
            const nope: never = chartType;
            return undefined;
    }
};

const EmptyChart = () => (
    <div style={{ padding: '50px 0' }}>
        <NonIdealState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon="chart"
        />
    </div>
);

type SimpleChartProps = {
    chartRef: RefObject<EChartsReact>;
    chartType: ChartType;
    chartConfig: ChartConfig;
};
export const SimpleChart: FC<SimpleChartProps> = ({
    chartRef,
    chartType,
    chartConfig,
}) => {
    if (chartConfig.plotData === undefined) return <EmptyChart />;
    const xlabel = friendlyName(chartConfig.seriesLayout.xDimension);
    const ylabel =
        chartConfig.seriesLayout.groupDimension &&
        friendlyName(chartConfig.seriesLayout.yMetrics[0]);
    const xType = 'category';
    const yType = 'value';

    const flipX = flipXFromChartType(chartType);
    const xAxis = {
        type: flipX ? yType : xType,
        name: flipX ? ylabel : xlabel,
    };
    const yAxis = {
        type: flipX ? xType : yType,
        name: flipX ? xlabel : ylabel,
    };

    const legend = {
        show:
            chartConfig.metricOptions.length +
                chartConfig.dimensionOptions.length >
            2,
    };

    const series = chartConfig.series
        .map(() => ({ type: echartType(chartType) }))
        .slice(0, 10); // not more than 10 lines
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
    };
    return (
        <div style={{ padding: 10 }}>
            <EChartsReact
                ref={chartRef}
                option={options}
                notMerge
                opts={{ renderer: 'svg' }}
            />
        </div>
    );
};
