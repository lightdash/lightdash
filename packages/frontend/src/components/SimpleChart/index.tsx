import { NonIdealState, Spinner } from '@blueprintjs/core';
import EChartsReact from 'echarts-for-react';
import React, { FC, useCallback, useEffect } from 'react';
import useEcharts from '../../hooks/echarts/useEcharts';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';

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
    pivotRawValue: any;
};

export type EchartSeriesClickEvent = EchartBaseClickEvent & {
    componentType: 'series';
    data: Record<string, any>;
    seriesIndex: number;
    dimensionNames: string[];
    pivotRawValue: any;
};

type EchartClickEvent = EchartSeriesClickEvent | EchartBaseClickEvent;

const EmptyChart = () => (
    <div style={{ padding: '50px 0' }}>
        <NonIdealState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon="chart"
        />
    </div>
);
export const LoadingChart = () => (
    <div style={{ padding: '50px 0' }}>
        <NonIdealState title="Loading chart" icon={<Spinner />} />
    </div>
);

const isSeriesClickEvent = (e: EchartClickEvent): e is EchartSeriesClickEvent =>
    e.componentType === 'series';

const SimpleChart: FC = () => {
    const { chartRef, isLoading, onSeriesContextMenu } =
        useVisualizationContext();

    const eChartsOptions = useEcharts();
    useEffect(() => {
        const listener = () => {
            const eCharts = chartRef.current?.getEchartsInstance();
            eCharts?.resize();
        };

        window.addEventListener('resize', listener);

        return () => window.removeEventListener('resize', listener);
    });

    const onChartContextMenu = useCallback(
        (e: EchartClickEvent) => {
            if (onSeriesContextMenu) {
                if (e.event.event.defaultPrevented) {
                    return;
                }
                e.event.event.preventDefault();
                if (isSeriesClickEvent(e)) {
                    onSeriesContextMenu(e, eChartsOptions?.series || []);
                }
            }
        },
        [onSeriesContextMenu, eChartsOptions],
    );

    if (isLoading) return <LoadingChart />;
    if (!eChartsOptions) return <EmptyChart />;

    return (
        <div style={{ height: '100%' }}>
            <EChartsReact
                style={{
                    height: '100%',
                    width: '100%',
                }}
                ref={chartRef}
                option={eChartsOptions}
                notMerge
                opts={{ renderer: 'svg' }}
                onEvents={{
                    contextmenu: onChartContextMenu,
                    click: onChartContextMenu,
                }}
            />
        </div>
    );
};

export default SimpleChart;
