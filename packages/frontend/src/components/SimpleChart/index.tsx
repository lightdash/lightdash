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
        case DBChartTypes.TABLE:
        case DBChartTypes.BIG_NUMBER:
            return undefined;
        default: {
            const nope: never = chartType;
            return undefined;
        }
    }
};

type EchartBaseClickEvent = {
    // The component name clicked,
    // component type, could be 'series'、'markLine'、'markPoint'、'timeLine', etc..
    componentType: string;
    // series type, could be 'line'、'bar'、'pie', etc.. Works when componentType is 'series'.
    seriesType: string;
    // the index in option.series. Works when componentType is 'series'.
    seriesIndex: number;
    // series name, works when componentType is 'series'.
    seriesName: string;
    // name of data (categories).
    name: string;
    // the index in 'data' array.
    dataIndex: number;
    // incoming raw data item
    data: Object;
    // charts like 'sankey' and 'graph' included nodeData and edgeData as the same time.
    // dataType can be 'node' or 'edge', indicates whether the current click is on node or edge.
    // most of charts have one kind of data, the dataType is meaningless
    dataType: string;
    // incoming data value
    value: number | Array<any>;
    // color of the shape, works when componentType is 'series'.
    color: string;
    event: { event: MouseEvent };
};

export type EchartSeriesClickEvent = EchartBaseClickEvent & {
    componentType: 'series';
    data: Record<string, any>;
    seriesIndex: number;
    dimensionNames: string[];
};

type EchartClickEvent = EchartSeriesClickEvent | EchartBaseClickEvent;

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
        case DBChartTypes.TABLE:
        case DBChartTypes.BIG_NUMBER:
            return undefined;
        default: {
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
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    chartConfig: ChartConfig;
    isLoading: boolean;
    tableName: string | undefined;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
};
const SimpleChart: FC<SimpleChartProps> = ({
    chartRef,
    chartType,
    chartConfig,
    isLoading,
    tableName,
    onSeriesContextMenu = () => {},
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
    const xAxisType = flipX ? yType : xType;
    const xAxis = {
        type: xAxisType,
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
            tooltip: [DBChartTypes.COLUMN, DBChartTypes.BAR].includes(chartType)
                ? [seriesDimension]
                : [chartConfig.seriesLayout.xDimension, seriesDimension],
            seriesName: seriesDimension,
        },
    }));
    const commonTooltip = {
        show: true,
        confine: true,
    };
    const tooltip = [DBChartTypes.COLUMN, DBChartTypes.BAR].includes(chartType)
        ? {
              ...commonTooltip,
              trigger: 'axis',
              axisPointer: { type: 'shadow', label: { show: true } },
          }
        : { ...commonTooltip, trigger: 'item' };
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
        tooltip,
    };

    const isSeriesClickEvent = (
        e: EchartClickEvent,
    ): e is EchartSeriesClickEvent => e.componentType === 'series';

    const onChartContextMenu = (e: EchartClickEvent) => {
        if (e.event.event.defaultPrevented) {
            return;
        }
        e.event.event.preventDefault();
        if (isSeriesClickEvent(e)) {
            onSeriesContextMenu(e);
        }
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
                onEvents={{
                    contextmenu: onChartContextMenu,
                }}
            />
        </div>
    );
};

export default SimpleChart;
