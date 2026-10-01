import {
    assertUnreachable,
    ChartType,
    FeatureFlags,
    MERGE_TABLE_NAME,
    type ApiErrorDetail,
    type ChartConfig,
    type DashboardFilters,
    type DateZoom,
    type EChartsSeries,
    type ItemsMap,
    type MergeFieldOrigins,
    type MetricQuery,
    type ParametersValuesMap,
    type Series,
    type StackType,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { createSeriesColorResolver } from '@lightdash/visualization/editor';
import { useMantineTheme } from '@mantine/core';
import type { Map as LeafletMap } from 'leaflet';
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
import { resolveMergeColumnOrder } from '../../features/mergeQuery/utils/resolveMergeColumnOrder';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { useChartColorMappings } from '../../hooks/useChartColorConfig/useChartColorConfig';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { type EChartsReact } from '../EChartsReactWrapper';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import Context, {
    type EmbeddedDashboardInteractivity,
    type SavedChartReference,
} from './context';
import { type useVisualizationContext } from './useVisualizationContext';
import VisualizationBigNumberConfig from './VisualizationBigNumberConfig';
import VisualizationCartesianConfig from './VisualizationConfigCartesian';
import VisualizationConfigFunnel from './VisualizationConfigFunnel';
import VisualizationGaugeConfig from './VisualizationConfigGauge';
import VisualizationMapConfig from './VisualizationConfigMap';
import VisualizationPieConfig from './VisualizationConfigPie';
import VisualizationConfigSankey from './VisualizationConfigSankey';
import VisualizationTableConfig from './VisualizationConfigTable';
import VisualizationTreemapConfig from './VisualizationConfigTreemap';
import VisualizationCustomConfig from './VisualizationCustomConfig';
import VisualizationDataAppVizConfig from './VisualizationDataAppVizConfig';

export type VisualizationProviderProps = {
    minimal?: boolean;
    chartConfig: ChartConfig;
    initialPivotDimensions: string[] | undefined;
    initialPivotRows?: string[];
    unsavedMetricQuery?: MetricQuery;
    resultsData: InfiniteQueryResults & {
        metricQuery?: MetricQuery;
        fields?: ItemsMap;
        resolvedTimezone?: string;
        /** Where each field came from when the results are a merge. */
        fieldOrigins?: MergeFieldOrigins;
    };
    parameters?: ParametersValuesMap;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (
        e: EchartsSeriesClickEvent,
        series: EChartsSeries[],
    ) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onChartConfigChange?: (value: ChartConfig) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
    onPivotRowsChange?: (value: string[] | undefined) => void;
    savedChartUuid?: string;
    savedChartReference?: SavedChartReference;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    colorPalette: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
    setEchartsRef?: (ref: RefObject<EChartsReact | null> | undefined) => void;
    computedSeries?: Series[];
    apiErrorDetail?: ApiErrorDetail | null;
    containerWidth?: number;
    containerHeight?: number;
    isDashboard?: boolean;
    isEditMode?: boolean;
    embeddedDashboardInteractivity?: EmbeddedDashboardInteractivity;
    hasExplorerStore?: boolean;
    dateZoom?: DateZoom;
};

const VisualizationProvider: FC<
    React.PropsWithChildren<VisualizationProviderProps>
> = ({
    minimal = false,
    initialPivotDimensions,
    initialPivotRows,
    resultsData,
    isLoading,
    columnOrder,
    chartConfig,
    onChartConfigChange,
    onSeriesContextMenu,
    onChartTypeChange,
    onPivotDimensionsChange,
    onPivotRowsChange,
    children,
    savedChartUuid,
    savedChartReference,
    dashboardFilters,
    invalidateCache,
    colorPalette,
    tableCalculationsMetadata,
    setEchartsRef,
    computedSeries,
    apiErrorDetail,
    parameters,
    unsavedMetricQuery,
    containerWidth,
    containerHeight,
    isDashboard,
    isEditMode,
    embeddedDashboardInteractivity,
    hasExplorerStore = true,
    dateZoom,
}) => {
    const itemsMap = useMemo(() => {
        return resultsData?.fields;
    }, [resultsData]);

    const chartRef = useRef<EChartsReact | null>(null);
    const leafletMapRef = useRef<LeafletMap | null>(null);

    useEffect(() => {
        if (setEchartsRef)
            setEchartsRef(chartRef as RefObject<EChartsReact | null>);

        // Cleanup: dispose ECharts instance and clear parent reference on unmount
        return () => {
            // Dispose the ECharts instance to free up canvas memory
            if (chartRef.current) {
                const echartsInstance = chartRef.current.getEchartsInstance();
                if (echartsInstance && !echartsInstance.isDisposed()) {
                    echartsInstance.dispose();
                }
                chartRef.current = null;
            }
        };
    }, [setEchartsRef]);

    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        unsavedMetricQuery ?? resultsData.metricQuery,
        onPivotDimensionsChange,
    );

    const setChartType = useCallback(
        (value: ChartType) => onChartTypeChange?.(value),
        [onChartTypeChange],
    );

    const { colorMappings } = useChartColorMappings();
    const theme = useMantineTheme();

    // cartesian config related
    const [stacking, setStacking] = useState<boolean | StackType>();
    const [cartesianType, setCartesianType] = useState<CartesianTypeOptions>();
    // --

    // If we don't toggle any fields, (eg: when you `explore from here`) columnOrder on tableConfig might be empty
    // so we initialize it with the fields from resultData
    const defaultColumnOrder = useMemo(() => {
        const metricQuery = resultsData?.metricQuery;
        const metricQueryFields =
            metricQuery !== undefined
                ? [
                      ...metricQuery.dimensions,
                      ...metricQuery.metrics,
                      ...metricQuery.tableCalculations.map(({ name }) => name),
                  ]
                : [];
        // A merged result is keyed by merged ids, which a chart saved before it was merged does not carry
        if (metricQuery?.exploreName === MERGE_TABLE_NAME) {
            return resolveMergeColumnOrder(metricQueryFields, columnOrder);
        }
        return columnOrder.length > 0 ? columnOrder : metricQueryFields;
    }, [resultsData?.metricQuery, columnOrder]);

    const handleChartConfigChange = useCallback(
        (newChartConfig: ChartConfig) => {
            if (!onChartConfigChange) return;
            if (isEqual(newChartConfig.config, chartConfig?.config)) return;

            onChartConfigChange(newChartConfig);
        },
        [onChartConfigChange, chartConfig?.config],
    );

    const { data: calculateSeriesColorFlag } = useServerFeatureFlag(
        FeatureFlags.CalculateSeriesColor,
    );
    const isCalculateSeriesColorEnabled =
        calculateSeriesColorFlag?.enabled ?? false;

    /**
     * Shared colors for series and group values, resolved by
     * `@lightdash/visualization`. On dashboards the fallback colors must be
     * passed in the computedSeries prop; on charts they are computed from the
     * chartConfig. Colors are pre-calculated per-series, and re-calculated
     * when series change.
     */
    const nullColor = theme.colors.ldGray[6];
    const { getSeriesColor } = useMemo(
        () =>
            createSeriesColorResolver({
                colorPalette,
                colorMappings,
                nullColor,
                chartConfig,
                itemsMap,
                computedSeries,
                calculateSeriesColor: isCalculateSeriesColorEnabled,
            }),
        [
            colorPalette,
            colorMappings,
            nullColor,
            chartConfig,
            itemsMap,
            computedSeries,
            isCalculateSeriesColorEnabled,
        ],
    );
    // Group colors do not depend on the chart config, so they keep their
    // identity while it is edited.
    const { getGroupColor } = useMemo(
        () =>
            createSeriesColorResolver({
                colorPalette,
                colorMappings,
                nullColor,
                chartConfig: undefined,
                itemsMap,
            }),
        [colorPalette, colorMappings, nullColor, itemsMap],
    );

    // Detect if the device supports touch events
    // This helps us avoid appendTo: 'body' on touch devices where drag-to-scroll
    // causes tooltip positioning issues.
    // Related: https://github.com/apache/echarts/issues/12776
    const isTouchDevice = useMemo(() => {
        return (
            'ontouchstart' in window ||
            navigator.maxTouchPoints > 0 ||
            // @ts-ignore - msMaxTouchPoints is for older IE
            navigator.msMaxTouchPoints > 0
        );
    }, []);

    const value: Omit<
        ReturnType<typeof useVisualizationContext>,
        'visualizationConfig'
    > = {
        minimal,
        pivotDimensions: validPivotDimensions,
        chartRef,
        leafletMapRef,
        resultsData,
        isLoading,
        apiErrorDetail,
        columnOrder: defaultColumnOrder,
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
        savedChartUuid,
        savedChartReference,
        parameters,
        containerWidth,
        containerHeight,
        isDashboard,
        isEditMode,
        embeddedDashboardInteractivity,
        hasExplorerStore,
        isTouchDevice,
        resolvedTimezone: resultsData.resolvedTimezone,
        dateZoom,
    };

    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            return (
                <VisualizationCartesianConfig
                    itemsMap={itemsMap}
                    resultsData={resultsData}
                    validPivotDimensions={validPivotDimensions}
                    columnOrder={defaultColumnOrder}
                    initialChartConfig={chartConfig.config}
                    stacking={stacking}
                    cartesianType={cartesianType}
                    setPivotDimensions={setPivotDimensions}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                    parameters={parameters}
                    unsavedMetricQuery={unsavedMetricQuery}
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
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                    parameters={parameters}
                    unsavedMetricQuery={unsavedMetricQuery}
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
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                    parameters={parameters}
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
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                    parameters={parameters}
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
        case ChartType.TREEMAP:
            return (
                <VisualizationTreemapConfig
                    itemsMap={itemsMap}
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    parameters={parameters}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationTreemapConfig>
            );
        case ChartType.GAUGE:
            return (
                <VisualizationGaugeConfig
                    itemsMap={itemsMap}
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    parameters={parameters}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationGaugeConfig>
            );
        case ChartType.MAP:
            return (
                <VisualizationMapConfig
                    itemsMap={itemsMap}
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    parameters={parameters}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationMapConfig>
            );
        case ChartType.TABLE:
            return (
                <VisualizationTableConfig
                    itemsMap={itemsMap}
                    resultsData={resultsData}
                    columnOrder={defaultColumnOrder}
                    validPivotDimensions={validPivotDimensions}
                    initialPivotRows={initialPivotRows}
                    onPivotRowsChange={onPivotRowsChange}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    savedChartUuid={savedChartUuid}
                    dashboardFilters={dashboardFilters}
                    invalidateCache={invalidateCache}
                    parameters={parameters}
                    dateZoom={dateZoom}
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
                    resultsData={resultsData}
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
        case ChartType.SANKEY:
            return (
                <VisualizationConfigSankey
                    itemsMap={itemsMap}
                    resultsData={resultsData}
                    initialChartConfig={chartConfig.config}
                    onChartConfigChange={handleChartConfigChange}
                    colorPalette={colorPalette}
                    tableCalculationsMetadata={tableCalculationsMetadata}
                    parameters={parameters}
                >
                    {({ visualizationConfig }) => (
                        <Context.Provider
                            value={{ ...value, visualizationConfig }}
                        >
                            {children}
                        </Context.Provider>
                    )}
                </VisualizationConfigSankey>
            );
        case ChartType.DATA_APP_VIZ:
            return (
                <VisualizationDataAppVizConfig
                    itemsMap={itemsMap}
                    resultsData={resultsData}
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
                </VisualizationDataAppVizConfig>
            );
        default:
            return assertUnreachable(chartConfig, 'Unknown chart type');
    }
};

export default VisualizationProvider;
