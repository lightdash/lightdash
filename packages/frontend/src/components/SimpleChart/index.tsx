import {
    getFormattedValue,
    CartesianSeriesType,
    type PivotReference,
} from '@lightdash/common';
import { IconChartBarOff } from '@tabler/icons-react';
import { format as echartsFormat } from 'echarts';
import {
    type EChartsInstance,
    type EChartsReactProps,
    type Opts,
} from 'echarts-for-react/lib/types';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import useEchartsCartesianConfig from '../../hooks/echarts/useEchartsCartesianConfig';
import {
    getDisabledLegendEntries,
    useLegendDoubleClickSelection,
    type LegendSelection,
} from '../../hooks/echarts/useLegendDoubleClickSelection';
import LoadingChart from '../common/LoadingChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import EChartsReact from '../EChartsReactWrapper';
import { isCartesianVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { SERIES_FOCUS_ACTION } from './chartSeriesFocus';
import {
    CHART_POINTER_OPTIONS,
    createChartTooltipController,
} from './chartTooltipController';

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
    // Full dataset row for the clicked item, resolved via dataIndex before the
    // event is forwarded. Stacked bar series carry sparse [x, y] tuples, so
    // this is the only way consumers can see the row's remaining columns.
    datasetRow?: Record<string, unknown>;
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

// How far past the plot area a pointer still counts as hovering the axis
const AXIS_LABEL_HOVER_BAND_PX = 40;

type GridRect = { x: number; y: number; width: number; height: number };

const isDimensionAxis = (axis: { type?: string } | undefined): boolean =>
    axis?.type === 'category' || axis?.type === 'time';

// Point inside the plot area that a pointer over the dimension axis labels maps
// to, or null when the pointer isn't over them
const getPlotPointForAxisHover = (
    eCharts: EChartsInstance,
    x: number,
    y: number,
): { x: number; y: number } | null => {
    const grid: GridRect | undefined = eCharts
        .getModel?.()
        ?.getComponent?.('grid', 0)
        ?.coordinateSystem?.getRect?.();
    if (!grid) return null;

    const isUnderXAxis =
        x >= grid.x &&
        x <= grid.x + grid.width &&
        y > grid.y + grid.height &&
        y <= grid.y + grid.height + AXIS_LABEL_HOVER_BAND_PX;
    const isBesideYAxis =
        y >= grid.y &&
        y <= grid.y + grid.height &&
        x < grid.x &&
        x >= grid.x - AXIS_LABEL_HOVER_BAND_PX;
    // getOption() clones the whole option, so only read it when it matters
    if (!isUnderXAxis && !isBesideYAxis) return null;

    const { xAxis, yAxis } = eCharts.getOption() as {
        xAxis?: { type?: string }[];
        yAxis?: { type?: string }[];
    };

    if (isUnderXAxis && isDimensionAxis(xAxis?.[0])) {
        return { x, y: grid.y + grid.height / 2 };
    }
    if (isBesideYAxis && isDimensionAxis(yAxis?.[0])) {
        return { x: grid.x + grid.width / 2, y };
    }

    return null;
};

const SimpleChart: FC<SimpleChartProps> = memo(
    ({ onScreenshotReady, onScreenshotError, ...props }) => {
        const {
            chartRef,
            isLoading,
            onSeriesContextMenu,
            itemsMap,
            resultsData,
            resolvedTimezone,
            visualizationConfig,
            isEditMode,
        } = useVisualizationContext();

        const cartesianChartConfig = isCartesianVisualizationConfig(
            visualizationConfig,
        )
            ? visualizationConfig.chartConfig
            : undefined;

        const persistLegendSelection = useCallback(
            (selected: LegendSelection) => {
                if (!isEditMode || !cartesianChartConfig) return;
                const { selected: previousSelected, ...legend } =
                    cartesianChartConfig.dirtyEchartsConfig?.legend ?? {};
                const disabledEntries = getDisabledLegendEntries(selected);
                if (!disabledEntries && !previousSelected) return;
                cartesianChartConfig.setLegend(
                    disabledEntries
                        ? { ...legend, selected: disabledEntries }
                        : legend,
                );
            },
            [isEditMode, cartesianChartConfig],
        );

        const { selectedLegends, onLegendChange } =
            useLegendDoubleClickSelection(
                cartesianChartConfig?.dirtyEchartsConfig?.legend?.selected,
                persistLegendSelection,
            );
        // Measured canvas width so outside legends can size their labels
        const [chartWidth, setChartWidth] = useState<number | null>(null);
        const eChartsOptions = useEchartsCartesianConfig(
            selectedLegends,
            props.isInDashboard,
            chartWidth,
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
            const observer = new ResizeObserver((entries) => {
                const width = entries[0]?.contentRect.width;
                if (width !== undefined) setChartWidth(Math.round(width));
                resizeChart();
            });
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
                            // Stacked bar series carry sparse [x, y] tuples,
                            // so resolve the full dataset row via dataIndex
                            // for consumers that need the remaining columns
                            const datasetRow =
                                eChartsOptions?.dataset?.source?.[e.dataIndex];
                            onSeriesContextMenu(
                                { ...e, datasetRow },
                                eChartsOptions?.series || [],
                            );
                        }
                    }
                }
            },
            [onSeriesContextMenu, eChartsOptions],
        );

        const opts = useMemo<Opts>(() => {
            const baseOpts: Opts = {
                renderer: 'svg',
                ...CHART_POINTER_OPTIONS,
                // Retain the larger native touch target on coarse pointers.
                ...(window.matchMedia('(pointer: coarse)').matches
                    ? { pointerSize: 44 }
                    : {}),
            };

            if (!eChartsOptions) {
                return baseOpts;
            }
            const seriesCount = eChartsOptions.series?.length ?? 0;
            const datasetRows = eChartsOptions.dataset?.source?.length ?? 0;
            const totalDataPoints = seriesCount * datasetRows;

            if (totalDataPoints > CANVAS_RENDERER_THRESHOLD) {
                return { ...baseOpts, renderer: 'canvas' };
            }
            return baseOpts;
        }, [eChartsOptions]);

        // When using canvas renderer, resolve CSS variables to computed values
        // since canvas doesn't have DOM access to resolve var(--...) strings.
        const resolvedEChartsOptions = useMemo(() => {
            if (!eChartsOptions || opts.renderer !== 'canvas') {
                return eChartsOptions;
            }
            return resolveCssVariablesInOptions(eChartsOptions);
        }, [eChartsOptions, opts.renderer]);

        // Keep native axis/legend tooltips and local emphasis. Narrow segment tips
        // before paint. A short grace period bridges gaps without rebuilding options.
        useEffect(() => {
            const eCharts = chartRef.current?.getEchartsInstance();
            if (!eCharts || !resolvedEChartsOptions) return;

            const zRender = eCharts.getZr();
            let focusedSeries: number | null = null;
            const controller = createChartTooltipController<any>({
                dispatchAction: (action) => eCharts.dispatchAction(action),
                focusItem: (item) => {
                    const nextSeries = item?.seriesIndex ?? null;
                    if (nextSeries === focusedSeries || eCharts.isDisposed())
                        return;
                    focusedSeries = nextSeries;
                    eCharts.dispatchAction({
                        type: SERIES_FOCUS_ACTION,
                        seriesIndex: nextSeries,
                    });
                },
                containsPoint: ({ x, y }) =>
                    eCharts.containPixel({ gridIndex: 0 }, [x, y]),
                projectAxisPoint: ({ x, y }) =>
                    getPlotPointForAxisHover(eCharts, x, y),
                formatItem: (param) => {
                    // Item events lack the axis header. Preserve the same
                    // formatting used by the full-category tooltip.
                    let axisValueLabel = param.name;
                    if (
                        param.value !== null &&
                        typeof param.value === 'object' &&
                        !Array.isArray(param.value)
                    ) {
                        const dimensionIndex = param.encode?.x?.[0];
                        const dim =
                            dimensionIndex !== undefined
                                ? param.dimensionNames[dimensionIndex]
                                : '';
                        const axisValue = param.value[dim];
                        axisValueLabel = itemsMap
                            ? getFormattedValue(
                                  axisValue,
                                  dim,
                                  itemsMap,
                                  true,
                                  undefined,
                                  undefined,
                                  resolvedTimezone,
                              )
                            : axisValue;
                    }
                    return (resolvedEChartsOptions.tooltip.formatter as any)([
                        {
                            ...param,
                            axisValueLabel,
                            marker: echartsFormat.getTooltipMarker(param.color),
                        },
                    ]);
                },
            });
            const onMouseOver = (params: any) => {
                const series = resolvedEChartsOptions.series ?? [];
                const hoveredSeries = series[params.seriesIndex];
                // Single-series charts and lines without symbols keep the
                // category tooltip. Reference lines also keep their native tip.
                if (
                    params.componentType === 'series' &&
                    series.length > 1 &&
                    hoveredSeries &&
                    (hoveredSeries.type !== CartesianSeriesType.LINE ||
                        hoveredSeries.showSymbol)
                ) {
                    controller.setItem(params);
                }
            };
            const onMouseOut = () => controller.setItem(null);
            const onMouseMove = ({
                offsetX,
                offsetY,
            }: {
                offsetX: number;
                offsetY: number;
            }) => controller.move({ x: offsetX, y: offsetY });

            eCharts.on('mouseover', onMouseOver);
            eCharts.on('mouseout', onMouseOut);
            zRender.on('mousemove', onMouseMove);
            zRender.on('globalout', controller.leave);
            return () => {
                controller.dispose();
                if (!eCharts.isDisposed()) {
                    eCharts.off('mouseover', onMouseOver);
                    eCharts.off('mouseout', onMouseOut);
                    zRender.off('mousemove', onMouseMove);
                    zRender.off('globalout', controller.leave);
                }
            };
        }, [chartRef, resolvedEChartsOptions, itemsMap, resolvedTimezone]);

        // Memoize onEvents to prevent echarts-for-react from disposing and
        // re-creating the entire ECharts instance on every render. The library
        // deep-compares onEvents via fast-deep-equal, which always returns false
        // for function values, triggering a full dispose+init cycle.
        const onEvents = useMemo(
            () => ({
                contextmenu: onChartContextMenu,
                click: onChartContextMenu,
                legendselectchanged: onLegendChange,
            }),
            [onChartContextMenu, onLegendChange],
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
