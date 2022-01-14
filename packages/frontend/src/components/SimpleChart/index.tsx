import { NonIdealState, Spinner } from '@blueprintjs/core';
import {
    DBChartTypes,
    DimensionType,
    findFieldByIdInExplore,
    friendlyName,
    getFieldLabel,
} from 'common';
import EChartsReact from 'echarts-for-react';
import React, { FC, RefObject, useEffect } from 'react';
import { ChartConfig } from '../../hooks/useChartConfig';
import { useExplore } from '../../hooks/useExplore';

const flipXFromChartType = (chartType: DBChartTypes) => {
    switch (chartType) {
        case DBChartTypes.COLUMN:
        case DBChartTypes.LINE:
        case DBChartTypes.SCATTER:
            return false;
        case DBChartTypes.BAR:
            return true;
        default: {
            const nope: never = chartType;
            return undefined;
        }
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
        default: {
            const nope: never = chartType;
            return undefined;
        }
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
const LoadingChart = () => (
    <div style={{ padding: '50px 0' }}>
        <NonIdealState title="Loading chart" icon={<Spinner />} />
    </div>
);

const axisTypeFromDimensionType = (
    dimensionType: DimensionType | undefined,
) => {
    switch (dimensionType) {
        case DimensionType.DATE:
        case DimensionType.TIMESTAMP:
            return 'time';
        default:
            return 'category';
    }
};

type SimpleChartProps = {
    isLoading: boolean;
    tableName: string | undefined;
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    chartConfig: ChartConfig;
};
const SimpleChart: FC<SimpleChartProps> = ({
    isLoading,
    tableName,
    chartRef,
    chartType,
    chartConfig,
}) => {
    useEffect(() => {
        const listener = () => {
            const eCharts = chartRef.current?.getEchartsInstance();
            eCharts?.resize();
        };

        window.addEventListener('resize', listener);

        return () => window.removeEventListener('resize', listener);
    });

    const activeExplore = useExplore(tableName);
    if (isLoading || !activeExplore.data) return <LoadingChart />;
    if (chartConfig.plotData === undefined) return <EmptyChart />;
    const xDimensionField = findFieldByIdInExplore(
        activeExplore.data,
        chartConfig.seriesLayout.xDimension,
    );
    const xlabel = xDimensionField
        ? getFieldLabel(xDimensionField)
        : friendlyName(chartConfig.seriesLayout.xDimension);
    let ylabel: string | undefined;
    if (
        chartConfig.seriesLayout.groupDimension &&
        chartConfig.seriesLayout.yMetrics.length === 1
    ) {
        const yDimensionField = findFieldByIdInExplore(
            activeExplore.data,
            chartConfig.seriesLayout.yMetrics[0],
        );
        ylabel = yDimensionField
            ? getFieldLabel(yDimensionField)
            : friendlyName(chartConfig.seriesLayout.yMetrics[0]);
    }

    const xType = axisTypeFromDimensionType(chartConfig.xDimensionType);
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
        type: flipX ? 'category' : yType,
        name: flipX ? xlabel : ylabel,
        nameTextStyle: { fontWeight: 'bold', align: 'left' },
        nameLocation: 'end',
    };

    const legend = {
        show:
            chartConfig.metricOptions.length +
                chartConfig.tableCalculationOptions.length +
                chartConfig.dimensionOptions.length >
            2,
    };

    const series = chartConfig.series.map((seriesDimension) => ({
        type: echartType(chartType),
        connectNulls: true,
        encode: {
            x: flipX ? seriesDimension : chartConfig.seriesLayout.xDimension,
            y: flipX ? chartConfig.seriesLayout.xDimension : seriesDimension,
            tooltip: [chartConfig.seriesLayout.xDimension, seriesDimension],
            seriesName: seriesDimension,
        },
    }));
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
            confine: true,
        },
    };

    return (
        <div style={{ padding: 10, height: '100%' }}>
            <EChartsReact
                style={{
                    height: '100%',
                    width: '100%',
                }}
                ref={chartRef}
                option={options}
                notMerge
                opts={{ renderer: 'svg' }}
            />
        </div>
    );
};

export default SimpleChart;
