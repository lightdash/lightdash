import {
    assertUnreachable,
    ChartType,
    FeatureFlags,
    isDimension,
    type ApiErrorDetail,
    type ChartConfig,
    type DashboardFilters,
    type ItemsMap,
    type MetricQuery,
    type PivotValue,
    type Series,
    type TableCalculationMetadata,
} from '@lightdash/common';
import type EChartsReact from 'echarts-for-react';
import isEqual from 'lodash/isEqual';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import { type SeriesLike } from '../../hooks/useChartColorConfig/types';
import { useChartColorConfig } from '../../hooks/useChartColorConfig/useChartColorConfig';
import {
    calculateSeriesLikeIdentifier,
    isGroupedSeries,
} from '../../hooks/useChartColorConfig/utils';
import { useFeatureFlagEnabled } from '../../hooks/useFeatureFlagEnabled';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { type EchartSeriesClickEvent } from '../SimpleChart';
import VisualizationBigNumberConfig from './VisualizationBigNumberConfig';
import VisualizationCartesianConfig from './VisualizationConfigCartesian';
import VisualizationConfigFunnel from './VisualizationConfigFunnel';
import VisualizationPieConfig from './VisualizationConfigPie';
import VisualizationTableConfig from './VisualizationConfigTable';
import VisualizationCustomConfig from './VisualizationCustomConfig';
import Context from './context';
import { type useVisualizationContext } from './useVisualizationContext';

export type VisualizationProviderProps = {
    minimal?: boolean;
    chartConfig: ChartConfig;
    initialPivotDimensions: string[] | undefined;
    resultsData: InfiniteQueryResults & {
        metricQuery?: MetricQuery;
        fields?: ItemsMap;
    };
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onChartConfigChange?: (value: ChartConfig) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
    pivotTableMaxColumnLimit: number;
    savedChartUuid?: string;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    colorPalette: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
    setEchartsRef?: (ref: RefObject<EChartsReact | null>) => void;
    computedSeries?: Series[];
    apiErrorDetail?: ApiErrorDetail | null;
};

const VisualizationProvider: FC<
    React.PropsWithChildren<VisualizationProviderProps>
> = ({
    minimal = false,
    initialPivotDimensions,
    resultsData,
    isLoading,
    columnOrder,
    pivotTableMaxColumnLimit,
    chartConfig,
    onChartConfigChange,
    onSeriesContextMenu,
    onChartTypeChange,
    onPivotDimensionsChange,
    children,
    savedChartUuid,
    dashboardFilters,
    invalidateCache,
    colorPalette,
    tableCalculationsMetadata,
    setEchartsRef,
    computedSeries,
    apiErrorDetail,
}) => {
    const itemsMap = useMemo(() => {
        return resultsData?.fields;
    }, [resultsData]);

    const chartRef = useRef<EChartsReact | null>(null);
    useEffect(() => {
        if (setEchartsRef)
            setEchartsRef(chartRef as RefObject<EChartsReact | null>);
    }, [chartRef, setEchartsRef]);
    const [lastValidResultsData, setLastValidResultsData] = useState<
        InfiniteQueryResults & { metricQuery?: MetricQuery; fields?: ItemsMap }
    >();

    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        lastValidResultsData?.metricQuery,
    );

    const setChartType = useCallback(
        (value: ChartType) => onChartTypeChange?.(value),
        [onChartTypeChange],
    );

    const { calculateKeyColorAssignment, calculateSeriesColorAssignment } =
        useChartColorConfig({ colorPalette });

    // cartesian config related
    const [stacking, setStacking] = useState<boolean>();
    const [cartesianType, setCartesianType] = useState<CartesianTypeOptions>();
    // --

    // If we don't toggle any fields, (eg: when you `explore from here`) columnOrder on tableConfig might be empty
    // so we initialize it with the fields from resultData
    const defaultColumnOrder = useMemo(() => {
        if (columnOrder.length > 0) {
            return columnOrder;
        } else {
            const metricQuery = resultsData?.metricQuery;
            const metricQueryFields =
                metricQuery !== undefined
                    ? [
                          ...metricQuery.dimensions,
                          ...metricQuery.metrics,
                          ...metricQuery.tableCalculations.map(
                              ({ name }) => name,
                          ),
                      ]
                    : [];
            return metricQueryFields;
        }
    }, [resultsData?.metricQuery, columnOrder]);

    /**
     * Build a local set of fallback colors, used when dealing with ungrouped series.
     *
     * On dashboards, these must be passed in computedSeries prop
     * On charts, these are computed from the chartConfig
     * Colors are pre-calculated per-series, and re-calculated when series change.
     */
    const fallbackColors = useMemo<Record<string, string>>(() => {
        if (!chartConfig?.config || chartConfig.type !== ChartType.CARTESIAN) {
            return {};
        }

        const allSeries =
            computedSeries && computedSeries.length > 0
                ? computedSeries
                : chartConfig.config.eChartsConfig.series;

        const sortedSeriesIdentifiers = (allSeries ?? [])
            .map((series) => calculateSeriesLikeIdentifier(series).join('|'))
            .sort((a, b) => b.localeCompare(a));

        return Object.fromEntries(
            sortedSeriesIdentifiers.map((identifier, i) => {
                return [identifier, colorPalette[i % colorPalette.length]];
            }),
        );
    }, [chartConfig, colorPalette, computedSeries]);

    const handleChartConfigChange = useCallback(
        (newChartConfig: ChartConfig) => {
            if (!onChartConfigChange) return;
            if (isEqual(newChartConfig.config, chartConfig?.config)) return;

            onChartConfigChange(newChartConfig);
        },
        [onChartConfigChange, chartConfig?.config],
    );

    useEffect(() => {
        if (!resultsData) return;
        setLastValidResultsData(resultsData);
    }, [resultsData]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    /**
     * Gets a shared color for a given group name.
     * Used in pie charts
     */
    const getGroupColor = useCallback(
        (groupPrefix: string, identifier: string) => {
            if (itemsMap) {
                const dimension = itemsMap[groupPrefix];
                if (dimension && isDimension(dimension)) {
                    const colors = dimension.colors;
                    if (colors && colors[identifier]) {
                        return colors[identifier];
                    }
                }
            }

            return calculateKeyColorAssignment(groupPrefix, identifier);
        },
        [calculateKeyColorAssignment, itemsMap],
    );

    const isCalculateSeriesColorEnabled = useFeatureFlagEnabled(
        FeatureFlags.CalculateSeriesColor,
    );

    /**
     * Gets a shared color for a given series.
     */
    const getSeriesColor = useCallback(
        (seriesLike: SeriesLike) => {
            if (seriesLike.color) return seriesLike.color;

            // Check if color is stored in metadata
            const serieId = calculateSeriesLikeIdentifier(seriesLike).join('.');
            const metadata =
                chartConfig.type === ChartType.CARTESIAN
                    ? chartConfig.config?.metadata
                    : undefined;
            if (metadata && metadata?.[serieId]?.color) {
                return metadata?.[serieId].color;
            }

            /** Check if color is set in the dimension metadata */

            let pivot: PivotValue | undefined;
            if ('pivotReference' in seriesLike && seriesLike.pivotReference) {
                pivot = seriesLike.pivotReference.pivotValues?.[0];
            } else if (seriesLike.encode && 'yRef' in seriesLike.encode) {
                pivot = seriesLike.encode.yRef.pivotValues?.[0];
            }
            if (itemsMap && pivot) {
                const { field, value } = pivot;
                const dimension = itemsMap[field];
                if (
                    dimension &&
                    isDimension(dimension) &&
                    typeof value === 'string'
                ) {
                    const colors = dimension.colors;
                    if (colors && colors[value]) {
                        return colors[value];
                    }
                }
            }

            /**
             * If this series is grouped, figure out a shared color assignment from the series;
             * otherwise, pick a series color from the palette based on its order.
             */
            return isGroupedSeries(seriesLike) && isCalculateSeriesColorEnabled
                ? calculateSeriesColorAssignment(seriesLike)
                : fallbackColors[
                      // Note: we don't use getSeriesId since we may not be dealing with a Series type here
                      calculateSeriesLikeIdentifier(seriesLike).join('|')
                  ];
        },

        [
            calculateSeriesColorAssignment,
            fallbackColors,
            chartConfig,
            itemsMap,
            isCalculateSeriesColorEnabled,
        ],
    );

    const value: Omit<
        ReturnType<typeof useVisualizationContext>,
        'visualizationConfig'
    > = {
        minimal,
        pivotDimensions: validPivotDimensions,
        chartRef,
        resultsData: lastValidResultsData,
        isLoading,
        apiErrorDetail,
        columnOrder,
        itemsMap,
        setStacking,
        setCartesianType,
        onSeriesContextMenu,
        setChartType,
        setPivotDimensions,
        colorPalette,
        getGroupColor,
        getSeriesColor,
        chartConfig,
    };

    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            return (
                <VisualizationCartesianConfig
                    itemsMap={itemsMap}
                    resultsData={lastValidResultsData}
                    validPivotDimensions={validPivotDimensions}
                    columnOrder={defaultColumnOrder}
                    initialChartConfig={chartConfig.config}
                    stacking={stacking}
                    cartesianType={cartesianType}
                    setPivotDimensions={setPivotDimensions}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationCartesianConfig>
            );
        case ChartType.PIE:
            return (
                <VisualizationPieConfig
                    itemsMap={itemsMap}
                    resultsData={lastValidResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationPieConfig>
            );
        case ChartType.FUNNEL:
            return (
                <VisualizationConfigFunnel
                    itemsMap={itemsMap}
                    resultsData={lastValidResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationConfigFunnel>
            );
        case ChartType.BIG_NUMBER:
            return (
                <VisualizationBigNumberConfig
                    itemsMap={itemsMap}
                    resultsData={lastValidResultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationBigNumberConfig>
            );
        case ChartType.TABLE:
            return (
                <VisualizationTableConfig
                    itemsMap={itemsMap}
                    resultsData={lastValidResultsData}
                    columnOrder={defaultColumnOrder}
                    validPivotDimensions={validPivotDimensions}
                    pivotTableMaxColumnLimit={pivotTableMaxColumnLimit}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    savedChartUuid={savedChartUuid}
                    dashboardFilters={dashboardFilters}
                    invalidateCache={invalidateCache}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationTableConfig>
            );
        case ChartType.CUSTOM:
            return (
                <VisualizationCustomConfig
                    resultsData={lastValidResultsData}
                    itemsMap={itemsMap}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationCustomConfig>
            );
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};

export default VisualizationProvider;
