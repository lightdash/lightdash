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
    type PropsWithChildren,
    type RefObject,
} from 'react';
import { Provider } from 'react-redux';
import { resolveMergeColumnOrder } from '../../features/mergeQuery/utils/resolveMergeColumnOrder';
import {
    buildInitialVisualizationState,
    cartesianIntentActions,
    createVisualizationStore,
    VisualizationStoreContext,
    type VisualizationStore,
} from '../../features/visualization/store';
import { useChartColorMappings } from '../../hooks/useChartColorConfig/useChartColorConfig';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useStableCallback } from '../../hooks/useStableCallback';
import { type EChartsReact } from '../EChartsReactWrapper';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import {
    ConfigContext,
    LayoutContext,
    ServicesContext,
    StateContext,
    type EmbeddedDashboardInteractivity,
    type SavedChartReference,
    type VisualizationConfigValue,
    type VisualizationLayout,
    type VisualizationServices,
    type VisualizationState,
} from './context';
import { type VisualizationConfig } from './types';
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

// The editor's config is the store's; the provider's `chartConfig` prop only
// seeds it. Custom and data app viz editors own no chart config of their own,
// so they keep the prop.
const editedChartConfig = (
    visualizationConfig: VisualizationConfig,
): ChartConfig | null => {
    switch (visualizationConfig.chartType) {
        case ChartType.CARTESIAN:
        case ChartType.PIE:
        case ChartType.FUNNEL:
        case ChartType.BIG_NUMBER:
        case ChartType.TREEMAP:
        case ChartType.GAUGE:
        case ChartType.MAP:
        case ChartType.TABLE:
        case ChartType.SANKEY:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            } as ChartConfig;
        case ChartType.CUSTOM:
        case ChartType.DATA_APP_VIZ:
            return null;
        default:
            return assertUnreachable(visualizationConfig, 'Unknown chart type');
    }
};

type VisualizationConfigProviderProps = PropsWithChildren<{
    visualizationConfig: VisualizationConfig;
    propChartConfig: ChartConfig;
    itemsMap: ItemsMap | undefined;
    colorPalette: string[];
    colorMappings: ReturnType<typeof useChartColorMappings>['colorMappings'];
    nullColor: string;
    computedSeries: Series[] | undefined;
    isCalculateSeriesColorEnabled: boolean;
}>;

const VisualizationConfigProvider: FC<VisualizationConfigProviderProps> = ({
    visualizationConfig,
    propChartConfig,
    itemsMap,
    colorPalette,
    colorMappings,
    nullColor,
    computedSeries,
    isCalculateSeriesColorEnabled,
    children,
}) => {
    // Keyed on the editor's config alone so an owner echoing the config back
    // through the prop does not rebuild the colours
    const edited = useMemo(
        () => editedChartConfig(visualizationConfig),
        [visualizationConfig],
    );
    const chartConfig = edited ?? propChartConfig;
    /**
     * Shared colors for series, resolved by `@lightdash/visualization`. On
     * dashboards the fallback colors must be passed in the computedSeries
     * prop; on charts they are computed from the chartConfig. Colors are
     * pre-calculated per-series, and re-calculated when series change.
     */
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
    const value: VisualizationConfigValue = useMemo(
        () => ({ visualizationConfig, chartConfig, getSeriesColor }),
        [visualizationConfig, chartConfig, getSeriesColor],
    );
    return (
        <ConfigContext.Provider value={value}>
            {children}
        </ConfigContext.Provider>
    );
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

    // echarts-for-react disposes its instance on unmount; disposing here would
    // destroy a live chart whenever setEchartsRef changes identity
    useEffect(() => {
        if (setEchartsRef)
            setEchartsRef(chartRef as RefObject<EChartsReact | null>);
    }, [setEchartsRef]);

    const {
        validPivotDimensions,
        setPivotDimensions: setPivotDimensionsLatest,
    } = usePivotDimensions(
        initialPivotDimensions,
        unsavedMetricQuery ?? resultsData.metricQuery,
        onPivotDimensionsChange,
    );
    // Caller callbacks change identity on unrelated renders; consumers get
    // stable functions that call the latest committed one.
    const setPivotDimensions = useStableCallback(setPivotDimensionsLatest);
    const setChartType = useStableCallback((value: ChartType) =>
        onChartTypeChange?.(value),
    );
    const stableOnSeriesContextMenu = useStableCallback(
        (e: EchartsSeriesClickEvent, series: EChartsSeries[]) =>
            onSeriesContextMenu?.(e, series),
    );
    const hasSeriesContextMenu = onSeriesContextMenu !== undefined;

    const { colorMappings } = useChartColorMappings();
    const theme = useMantineTheme();

    const seedContext = {
        itemsMap,
        hasConfigOwner: onChartConfigChange !== undefined,
    };
    // Editor state for the mounted chart. A chart type switch starts a new
    // store seeded from the new type's config; the cartesian intent the
    // gallery set just before the switch carries over.
    const [stores, setStores] = useState<{
        type: ChartType;
        store: VisualizationStore;
    }>(() => ({
        type: chartConfig.type,
        store: createVisualizationStore(
            buildInitialVisualizationState(chartConfig, seedContext),
        ),
    }));
    let { store } = stores;
    if (stores.type !== chartConfig.type) {
        store = createVisualizationStore(
            buildInitialVisualizationState(
                chartConfig,
                seedContext,
                stores.store.getState().cartesianIntent,
            ),
        );
        setStores({ type: chartConfig.type, store });
    }
    const setStacking = useCallback(
        (value: Parameters<typeof cartesianIntentActions.setStacking>[0]) =>
            store.dispatch(cartesianIntentActions.setStacking(value)),
        [store],
    );
    const setCartesianType = useCallback(
        (
            value: Parameters<
                typeof cartesianIntentActions.setCartesianType
            >[0],
        ) => store.dispatch(cartesianIntentActions.setCartesianType(value)),
        [store],
    );

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

    // Re-emits the editor's config when the owner resets the prop to a config
    // that differs from it, so an edit in progress wins over an external reset.
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

    const nullColor = theme.colors.ldGray[6];
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

    const services: VisualizationServices = useMemo(
        () => ({
            chartRef,
            leafletMapRef,
            setStacking,
            setCartesianType,
            onSeriesContextMenu: hasSeriesContextMenu
                ? stableOnSeriesContextMenu
                : undefined,
            setChartType,
            setPivotDimensions,
            isTouchDevice,
        }),
        [
            setStacking,
            setCartesianType,
            hasSeriesContextMenu,
            stableOnSeriesContextMenu,
            setChartType,
            setPivotDimensions,
            isTouchDevice,
        ],
    );

    const layout: VisualizationLayout = useMemo(
        () => ({ containerWidth, containerHeight }),
        [containerWidth, containerHeight],
    );

    const resolvedTimezone = resultsData.resolvedTimezone;
    const state: VisualizationState = useMemo(
        () => ({
            minimal,
            pivotDimensions: validPivotDimensions,
            initialPivotRows,
            resultsData,
            isLoading,
            apiErrorDetail,
            columnOrder: defaultColumnOrder,
            itemsMap,
            colorPalette,
            getGroupColor,
            parameters,
            unsavedMetricQuery,
            tableCalculationsMetadata,
            dashboardFilters,
            invalidateCache,
            savedChartUuid,
            savedChartReference,
            isDashboard,
            isEditMode,
            embeddedDashboardInteractivity,
            hasExplorerStore,
            resolvedTimezone,
            dateZoom,
        }),
        [
            minimal,
            validPivotDimensions,
            initialPivotRows,
            resultsData,
            isLoading,
            apiErrorDetail,
            defaultColumnOrder,
            itemsMap,
            colorPalette,
            getGroupColor,
            parameters,
            unsavedMetricQuery,
            tableCalculationsMetadata,
            dashboardFilters,
            invalidateCache,
            savedChartUuid,
            savedChartReference,
            isDashboard,
            isEditMode,
            embeddedDashboardInteractivity,
            hasExplorerStore,
            resolvedTimezone,
            dateZoom,
        ],
    );

    // Stable across resizes and echoes so memoised adapters skip them
    const renderState = useCallback(
        ({
            visualizationConfig,
        }: {
            visualizationConfig: VisualizationConfig;
        }) => (
            <VisualizationConfigProvider
                visualizationConfig={visualizationConfig}
                propChartConfig={chartConfig}
                itemsMap={itemsMap}
                colorPalette={colorPalette}
                colorMappings={colorMappings}
                nullColor={nullColor}
                computedSeries={computedSeries}
                isCalculateSeriesColorEnabled={isCalculateSeriesColorEnabled}
            >
                {children}
            </VisualizationConfigProvider>
        ),
        [
            chartConfig,
            itemsMap,
            colorPalette,
            colorMappings,
            nullColor,
            computedSeries,
            isCalculateSeriesColorEnabled,
            children,
        ],
    );

    const renderAdapter = () => {
        switch (chartConfig.type) {
            case ChartType.CARTESIAN:
                return (
                    <VisualizationCartesianConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationCartesianConfig>
                );
            case ChartType.PIE:
                return (
                    <VisualizationPieConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationPieConfig>
                );
            case ChartType.FUNNEL:
                return (
                    <VisualizationConfigFunnel
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationConfigFunnel>
                );
            case ChartType.BIG_NUMBER:
                return (
                    <VisualizationBigNumberConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationBigNumberConfig>
                );
            case ChartType.TREEMAP:
                return (
                    <VisualizationTreemapConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationTreemapConfig>
                );
            case ChartType.GAUGE:
                return (
                    <VisualizationGaugeConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationGaugeConfig>
                );
            case ChartType.MAP:
                return (
                    <VisualizationMapConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationMapConfig>
                );
            case ChartType.TABLE:
                return (
                    <VisualizationTableConfig
                        onChartConfigChange={handleChartConfigChange}
                        onPivotRowsChange={onPivotRowsChange}
                    >
                        {renderState}
                    </VisualizationTableConfig>
                );
            case ChartType.CUSTOM:
                return (
                    <VisualizationCustomConfig
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationCustomConfig>
                );
            case ChartType.SANKEY:
                return (
                    <VisualizationConfigSankey
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationConfigSankey>
                );
            case ChartType.DATA_APP_VIZ:
                return (
                    <VisualizationDataAppVizConfig
                        initialChartConfig={chartConfig.config}
                        onChartConfigChange={handleChartConfigChange}
                    >
                        {renderState}
                    </VisualizationDataAppVizConfig>
                );
            default:
                return assertUnreachable(chartConfig, 'Unknown chart type');
        }
    };

    return (
        <Provider store={store} context={VisualizationStoreContext}>
            <ServicesContext.Provider value={services}>
                <LayoutContext.Provider value={layout}>
                    <StateContext.Provider value={state}>
                        {renderAdapter()}
                    </StateContext.Provider>
                </LayoutContext.Provider>
            </ServicesContext.Provider>
        </Provider>
    );
};

export default VisualizationProvider;
