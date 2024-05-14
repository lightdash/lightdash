import { type PivotReference } from '@lightdash/common';
import { IconChartBarOff } from '@tabler/icons-react';
import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import useEchartsCartesianConfig, {
    isLineSeriesOption,
} from '../../hooks/echarts/useEchartsCartesianConfig';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
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

type LegendClickEvent = {
    selected: {
        [name: string]: boolean;
    };
};

export const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconChartBarOff}
        />
    </div>
);

export const LoadingChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="Loading chart"
            loading
            className="loading_chart"
        />
    </div>
);

const isSeriesClickEvent = (e: EchartClickEvent): e is EchartSeriesClickEvent =>
    e.componentType === 'series';

type SimpleChartProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const SimpleChart: FC<SimpleChartProps> = memo((props) => {
    const { chartRef, isLoading, onSeriesContextMenu } =
        useVisualizationContext();

    const [selectedLegends, setSelectedLegends] = useState({});
    const [selectedLegendsUpdated, setSelectedLegendsUpdated] = useState({});

    const onLegendChange = useCallback((params: LegendClickEvent) => {
        setSelectedLegends(params.selected);
    }, []);

    useEffect(() => {
        setSelectedLegendsUpdated(selectedLegends);
    }, [selectedLegends]);

    const eChartsOptions = useEchartsCartesianConfig(
        selectedLegendsUpdated,
        props.isInDashboard,
    );

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
                    const series = (eChartsOptions?.series || [])[
                        e.seriesIndex
                    ];
                    if (series && series.encode) {
                        onSeriesContextMenu(e, eChartsOptions?.series || []);
                    }
                }
            }
        },
        [onSeriesContextMenu, eChartsOptions],
    );

    const opts = useMemo<Opts>(() => ({ renderer: 'svg' }), []);

    const handleOnMouseOver = useCallback(
        (params: any) => {
            const eCharts = chartRef.current?.getEchartsInstance();

            if (eCharts) {
                // TODO: move to own util function
                let setTooltipItemTrigger = true;
                // Tooltip trigger 'item' does not work when symbol is not shown; reference: https://github.com/apache/echarts/issues/14563
                const series = eCharts.getOption().series;

                const isGrouped = (series as any[]).some(
                    (serie) => serie.pivotReference !== undefined,
                );
                if (Array.isArray(series) && !isGrouped) return null;

                if (
                    Array.isArray(series) &&
                    isLineSeriesOption(series[params.seriesIndex])
                ) {
                    setTooltipItemTrigger =
                        !!series[params.seriesIndex].showSymbol;
                }

                if (
                    setTooltipItemTrigger &&
                    eChartsOptions?.tooltip.formatter
                ) {
                    eCharts.setOption(
                        {
                            tooltip: {
                                trigger: 'item',
                                formatter: (param: any) => {
                                    // item param are slightly different to axis params, and they don't contain the axisValueLabel
                                    // so we need to generate it here (and wrap it in an array) and then reuse the formatter used
                                    // on `useEchartsCartesianConfig` to generate the tooltip
                                    if (eChartsOptions.tooltip.formatter) {
                                        const dim =
                                            param.encode?.x &&
                                            Array.isArray(param.encode?.x) &&
                                            param.encode.x.length > 0 &&
                                            param.encode?.x[0] !== undefined
                                                ? param.dimensionNames[
                                                      param.encode?.x[0]
                                                  ]
                                                : '';

                                        const axisValue = param.value[dim];
                                        return (
                                            eChartsOptions.tooltip
                                                .formatter as any
                                        )([
                                            {
                                                ...param,
                                                axisValueLabel: axisValue,
                                            },
                                        ]);
                                    }
                                },
                            },
                        },
                        false,
                        true, // lazy update
                    );
                }
                // Wait for tooltip to change from `axis` to `item` and keep hovered on item highlighted
                setTimeout(() => {
                    eCharts.dispatchAction({
                        type: 'highlight',
                        seriesIndex: params.seriesIndex,
                    });
                }, 100);
            }
        },
        [chartRef, eChartsOptions?.tooltip.formatter],
    );

    const handleOnMouseOut = useCallback(() => {
        const eCharts = chartRef.current?.getEchartsInstance();

        if (eCharts) {
            eCharts.setOption(
                {
                    tooltip: eChartsOptions?.tooltip,
                },
                false,
                true, // lazy update
            );
        }
    }, [chartRef, eChartsOptions?.tooltip]);

    if (isLoading) return <LoadingChart />;
    if (!eChartsOptions) return <EmptyChart />;

    return (
        <EChartsReact
            data-testid={props['data-testid']}
            className={props.className}
            style={
                props.$shouldExpand
                    ? {
                          minHeight: 'inherit',
                          height: '100%',
                          width: '100%',
                      }
                    : {
                          minHeight: 'inherit',
                          // height defaults to 300px
                          width: '100%',
                      }
            }
            ref={chartRef}
            option={eChartsOptions}
            notMerge
            opts={opts}
            onEvents={{
                contextmenu: onChartContextMenu,
                click: onChartContextMenu,
                mouseover: handleOnMouseOver,
                mouseout: handleOnMouseOut,
                legendselectchanged: onLegendChange,
            }}
            {...props}
        />
    );
});

export default SimpleChart;
