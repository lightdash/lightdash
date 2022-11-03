import { NonIdealState, Spinner } from '@blueprintjs/core';
import { PivotReference } from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import { EChartsReactProps, Opts } from 'echarts-for-react/lib/types';
import { FC, memo, useCallback, useEffect, useMemo } from 'react';
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
    pivotReference?: PivotReference;
};

export type EchartSeriesClickEvent = EchartBaseClickEvent & {
    componentType: 'series';
    data: Record<string, any>;
    seriesIndex: number;
    dimensionNames: string[];
    pivotReference?: PivotReference;
};

type EchartClickEvent = EchartSeriesClickEvent | EchartBaseClickEvent;

const EmptyChart = () => (
    <div
        style={{
            padding: '50px 0',
            height: '100%',
            display: 'flex',
            alignContent: 'center',
        }}
    >
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

type SimpleChartProps = Omit<EChartsReactProps, 'option'> & {
    $shouldExpand?: boolean;
};

const SimpleChart: FC<SimpleChartProps> = memo((props) => {
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

    const onEvents = useMemo(
        () => ({
            contextmenu: onChartContextMenu,
            click: onChartContextMenu,
        }),
        [onChartContextMenu],
    );
    const opts = useMemo<Opts>(() => ({ renderer: 'svg' }), []);

    if (isLoading) return <LoadingChart />;
    if (!eChartsOptions) return <EmptyChart />;

    return (
        <EChartsReact
            style={props.$shouldExpand ? { height: '100%' } : {}}
            ref={chartRef}
            option={eChartsOptions}
            notMerge
            opts={opts}
            onEvents={onEvents}
            {...props}
        />
    );
});

export default SimpleChart;
