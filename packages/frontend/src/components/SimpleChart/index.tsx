import {
    FeatureFlags,
    getFormattedValue,
    isLineSeriesOption,
    type PivotReference,
} from '@lightdash/common';
import { IconChartBarOff } from '@tabler/icons-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useCallback, useEffect, useMemo, useRef, type FC } from 'react';
import useEchartsCartesianConfig from '../../hooks/echarts/useEchartsCartesianConfig';
import { useLegendDoubleClickSelection } from '../../hooks/echarts/useLegendDoubleClickSelection';
import { useClientFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import EChartsReact from '../EChartsReactWrapper';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';

type EchartsBaseClickEvent = {
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

export type EchartsSeriesClickEvent = EchartsBaseClickEvent & {
    componentType: 'series';
    // data can be either:
    // - Object format: { fieldName: value, ... } - for most dataset mode charts
    // - Tuple format: { value: [...] } - for stacked bar charts
    data: Record<string, any> | any[];
    seriesIndex: number;
    dimensionNames: string[];
    // encode maps x/y axes to indices in dimensionNames (e.g., {x: [0], y: [1]})
    encode?: { x?: number[]; y?: number[] };
    pivotReference?: PivotReference;
};

type EchartsClickEvent = EchartsSeriesClickEvent | EchartsBaseClickEvent;

export const EmptyChart = () => (
    <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
        <SuboptimalState
            title="No data available"
            description="Query metrics and dimensions with results."
            icon={IconChartBarOff}
        />
    </div>
);

const isSeriesClickEvent = (
    e: EchartsClickEvent,
): e is EchartsSeriesClickEvent => e.componentType === 'series';

type SimpleChartProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    onScreenshotReady?: () => void;
    onScreenshotError?: () => void;
};

/**
 * Threshold for switching to canvas renderer.
 * When total data points (series × categories) exceeds this,
 * canvas is used instead of SVG to avoid DOM bloat.
 */
const CANVAS_RENDERER_THRESHOLD = 500;

/**
 * CSS variable pattern: var(--some-variable, fallback)
 * Matches CSS var() with an optional fallback value.
 */
const CSS_VAR_REGEX = /^var\((--[^,)]+)(?:,\s*(.+))?\)$/;

/**
 * Resolve a single CSS variable string to its computed value.
 * Falls back to the embedded fallback value if the variable isn't set.
 */
const resolveCssVariable = (value: string): string => {
    const match = value.match(CSS_VAR_REGEX);
    if (!match) return value;

    const [, varName, fallback] = match;
    const computed = getComputedStyle(
        document.documentElement,
    ).getPropertyValue(varName);
    return computed.trim() || fallback?.trim() || value;
};

/**
 * Recursively walk an object and resolve any CSS variable strings.
 * Used when switching to canvas renderer, which can't resolve CSS variables.
 */
const resolveCssVariablesInOptions = <T,>(obj: T): T => {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') {
        return resolveCssVariable(obj) as unknown as T;
    }
    if (Array.isArray(obj)) {
        return obj.map(resolveCssVariablesInOptions) as unknown as T;
    }
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
            obj as Record<string, unknown>,
        )) {
            result[key] = resolveCssVariablesInOptions(value);
        }
        return result as T;
    }
    return obj;
};

const SimpleChart: FC<SimpleChartProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const {
            chartRef,
            isLoading,
            onSeriesContextMenu,
            itemsMap,
            resultsData,
        } = useVisualizationContext();

        const isLargeChartPerformanceEnabled = useClientFeatureFlag(
            FeatureFlags.LargeChartPerformance,
        );

        const { selectedLegends, onLegendChange } =
            useLegendDoubleClickSelection();
        const eChartsOptions = useEchartsCartesianConfig(
            selectedLegends,
            props.isInDashboard,
        );

        const hasSignaledScreenshotReady = useRef(false);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current || !onScreenshotReady)
                return;

            const isReadyWithData =
                !isLoading &&
                eChartsOptions &&
                resultsData?.hasFetchedAllRows !== false;

            // Also signal ready when chart is empty (no options but not loading/error)
            const isReadyEmpty =
                !isLoading && !eChartsOptions && !resultsData?.error;

            if (isReadyWithData || isReadyEmpty) {
                onScreenshotReady();
                hasSignaledScreenshotReady.current = true;
            }
        }, [
            isLoading,
            eChartsOptions,
            resultsData?.hasFetchedAllRows,
            resultsData?.error,
            onScreenshotReady,
        ]);

        useEffect(() => {
            if (hasSignaledScreenshotReady.current || !onScreenshotError)
                return;

            if (resultsData?.error) {
                onScreenshotError();
                hasSignaledScreenshotReady.current = true;
            }
        }, [resultsData?.error, onScreenshotError]);

        useEffect(() => {
            // Load all the rows
            resultsData?.setFetchAll(true);
        }, [resultsData]);

        useEffect(() => {
            const eCharts = chartRef.current?.getEchartsInstance();
            const dom = eCharts?.getDom();
            if (!eCharts || !dom) return;

            let rafId: number | null = null;
            const resizeChart = () => {
                if (rafId !== null) return;
                rafId = requestAnimationFrame(() => {
                    eCharts.resize();
                    rafId = null;
                });
            };

            // Observe container size changes (e.g., collapsible card expand/collapse)
            const observer = new ResizeObserver(resizeChart);
            observer.observe(dom);

            // Also listen for window resize events
            window.addEventListener('resize', resizeChart);

            return () => {
                window.removeEventListener('resize', resizeChart);
                observer.disconnect();
                if (rafId !== null) cancelAnimationFrame(rafId);
            };
        }, [chartRef, eChartsOptions]);

        const onChartContextMenu = useCallback(
            (e: EchartsClickEvent) => {
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
                            onSeriesContextMenu(
                                e,
                                eChartsOptions?.series || [],
                            );
                        }
                    }
                }
            },
            [onSeriesContextMenu, eChartsOptions],
        );

        const opts = useMemo<Opts>(() => {
            const baseOpts: Opts & { useCoarsePointer?: boolean } = {
                renderer: 'svg',
                // Reduce mouseover hit-testing overhead on dashboard tiles
                ...(props.isInDashboard && { useCoarsePointer: true }),
            };

            if (!isLargeChartPerformanceEnabled || !eChartsOptions) {
                return baseOpts;
            }
            const seriesCount = eChartsOptions.series?.length ?? 0;
            const datasetRows = eChartsOptions.dataset?.source?.length ?? 0;
            const totalDataPoints = seriesCount * datasetRows;

            if (totalDataPoints > CANVAS_RENDERER_THRESHOLD) {
                return { ...baseOpts, renderer: 'canvas' };
            }
            return baseOpts;
        }, [
            isLargeChartPerformanceEnabled,
            eChartsOptions,
            props.isInDashboard,
        ]);

        // When using canvas renderer, resolve CSS variables to computed values
        // since canvas doesn't have DOM access to resolve var(--...) strings.
        const resolvedEChartsOptions = useMemo(() => {
            if (!eChartsOptions || opts.renderer !== 'canvas') {
                return eChartsOptions;
            }
            return resolveCssVariablesInOptions(eChartsOptions);
        }, [eChartsOptions, opts.renderer]);

        // Track whether we're currently in item-tooltip mode to avoid
        // redundant setOption calls that cause flickering in mixed charts.
        const isItemTooltipActive = useRef(false);
        const mouseOverTimer = useRef<
            ReturnType<typeof setTimeout> | undefined
        >(undefined);

        const handleOnMouseOver = useCallback(
            (params: any) => {
                const eCharts = chartRef.current?.getEchartsInstance();

                if (eCharts) {
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
                        // Clear any pending mouseOut reset to prevent race conditions
                        // when moving between series elements quickly
                        if (mouseOverTimer.current) {
                            clearTimeout(mouseOverTimer.current);
                            mouseOverTimer.current = undefined;
                        }

                        if (!isItemTooltipActive.current) {
                            isItemTooltipActive.current = true;
                            eCharts.setOption(
                                {
                                    tooltip: {
                                        trigger: 'item',
                                        formatter: (param: any) => {
                                            // item param are slightly different to axis params, and they don't contain the axisValueLabel
                                            // so we need to generate it here (and wrap it in an array) and then reuse the formatter used
                                            // on `useEchartsCartesianConfig` to generate the tooltip
                                            if (
                                                eChartsOptions.tooltip.formatter
                                            ) {
                                                // When using tuple mode (array values) for stacked bars
                                                // param.value is an array like ["Dr. Wilson", 3]
                                                // param.name contains the category header
                                                if (
                                                    Array.isArray(param.value)
                                                ) {
                                                    return (
                                                        eChartsOptions.tooltip
                                                            .formatter as any
                                                    )([
                                                        {
                                                            ...param,
                                                            axisValueLabel:
                                                                param.name,
                                                        },
                                                    ]);
                                                }

                                                // When using primitive values (non-object)
                                                if (
                                                    typeof param.value !==
                                                        'object' ||
                                                    param.value === null
                                                ) {
                                                    return (
                                                        eChartsOptions.tooltip
                                                            .formatter as any
                                                    )([
                                                        {
                                                            ...param,
                                                            axisValueLabel:
                                                                param.name,
                                                        },
                                                    ]);
                                                }

                                                // When using dataset mode with object values (100% stacked)
                                                // param.value is an object with dimension keys
                                                const dim =
                                                    param.encode?.x?.[0] !==
                                                    undefined
                                                        ? param.dimensionNames[
                                                              param.encode?.x[0]
                                                          ]
                                                        : '';

                                                const axisValue =
                                                    param.value[dim];
                                                const formattedValue = itemsMap
                                                    ? getFormattedValue(
                                                          axisValue,
                                                          dim,
                                                          itemsMap,
                                                          true,
                                                      )
                                                    : axisValue;

                                                return (
                                                    eChartsOptions.tooltip
                                                        .formatter as any
                                                )([
                                                    {
                                                        ...param,
                                                        axisValueLabel:
                                                            formattedValue,
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
            [chartRef, eChartsOptions?.tooltip, itemsMap],
        );

        const handleOnMouseOut = useCallback(() => {
            // Debounce the reset to prevent rapid axis<->item tooltip flicker
            // when moving between adjacent series elements in mixed charts
            if (mouseOverTimer.current) {
                clearTimeout(mouseOverTimer.current);
            }
            mouseOverTimer.current = setTimeout(() => {
                const eCharts = chartRef.current?.getEchartsInstance();
                if (eCharts) {
                    isItemTooltipActive.current = false;
                    const tooltipOptions =
                        resolvedEChartsOptions?.tooltip ??
                        eChartsOptions?.tooltip;
                    eCharts.setOption(
                        {
                            tooltip: tooltipOptions,
                        },
                        false,
                        true, // lazy update
                    );
                }
            }, 50);
        }, [
            chartRef,
            eChartsOptions?.tooltip,
            resolvedEChartsOptions?.tooltip,
        ]);

        // Memoize onEvents to prevent echarts-for-react from disposing and
        // re-creating the entire ECharts instance on every render. The library
        // deep-compares onEvents via fast-deep-equal, which always returns false
        // for function values, triggering a full dispose+init cycle.
        const onEvents = useMemo(
            () => ({
                contextmenu: onChartContextMenu,
                click: onChartContextMenu,
                mouseover: handleOnMouseOver,
                mouseout: handleOnMouseOut,
                legendselectchanged: onLegendChange,
            }),
            [
                onChartContextMenu,
                handleOnMouseOver,
                handleOnMouseOut,
                onLegendChange,
            ],
        );

        if (resultsData?.error) return <EmptyChart />;
        if (isLoading) return <LoadingChart />;
        if (!eChartsOptions) return <EmptyChart />;

        return (
            <EChartsReact
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
                option={resolvedEChartsOptions ?? eChartsOptions}
                notMerge
                lazyUpdate={props.isInDashboard}
                opts={opts}
                onEvents={onEvents}
                {...props}
            />
        );
    },
);

export default SimpleChart;
