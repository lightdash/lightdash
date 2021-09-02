import EChartsReact from 'echarts-for-react';
import React, { RefObject, FC } from 'react';
import { friendlyName, DBChartTypes } from 'common';
import { NonIdealState } from '@blueprintjs/core';
import { ChartConfig } from '../hooks/useChartConfig';

const flipXFromChartType = (chartType: DBChartTypes) => {
    switch (chartType) {
        case DBChartTypes.COLUMN:
        case DBChartTypes.LINE:
        case DBChartTypes.SCATTER:
            return false;
        case DBChartTypes.BAR:
            return true;
        default:
            // eslint-disable-next-line
            const nope: never = chartType;
            return undefined;
    }
};
const echartType = (chartType: DBChartTypes) => {
    switch (chartType) {
        case DBChartTypes.LINE:
            return 'line';
        case DBChartTypes.BAR:
            return 'bar';
        case DBChartTypes.COLUMN:
            return 'bar';
        case DBChartTypes.SCATTER:
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
    chartType: DBChartTypes;
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
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: { fontWeight: 'bold' },
    };
    const yAxis = {
        type: flipX ? xType : yType,
        name: flipX ? xlabel : ylabel,
        nameTextStyle: { fontWeight: 'bold' },
    };

    const legend = {
        show:
            chartConfig.metricOptions.length +
                chartConfig.tableCalculationOptions.length +
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
