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
import {
    createSeriesColorResolver,
    getPendingFieldIds,
} from '@lightdash/visualization/editor';
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
    isFirstCustomSpec,
    tableCalculationsRenamed,
    VisualizationStoreContext,
    type CartesianIntentState,
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

// The store's config is the edited one; custom and data app viz still expose the prop here
const editedChartConfig = (
    visualizationConfig: VisualizationConfig,
): ChartConfig | null => {
    switch (visualizationConfig.chartType) {
        case ChartType.CARTESIAN:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.PIE:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.FUNNEL:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.BIG_NUMBER:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.TREEMAP:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.GAUGE:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.MAP:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.TABLE:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
        case ChartType.SANKEY:
            return {
                type: visualizationConfig.chartType,
                config: visualizationConfig.chartConfig.validConfig,
            };
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
    // Dashboards pass fallback colours in computedSeries; charts compute them from chartConfig
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
    const setPivotRows = useStableCallback((value: string[] | undefined) =>
        onPivotRowsChange?.(value),
    );
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

    const hasConfigOwner = onChartConfigChange !== undefined;
    const seedContext = { itemsMap, hasConfigOwner };
    // A type switch, a first custom spec, or a new prop with no owner to keep edits starts a new store
    const [stores, setStores] = useState<{
        chartConfig: ChartConfig;
        store: VisualizationStore;
    }>(() => ({
        chartConfig,
        store: createVisualizationStore(
            buildInitialVisualizationState(chartConfig, seedContext),
        ),
    }));
    let { store } = stores;
    if (
        stores.chartConfig.type !== chartConfig.type ||
        isFirstCustomSpec(stores.store.getState(), chartConfig) ||
        (!hasConfigOwner &&
            stores.chartConfig !== chartConfig &&
            !isEqual(stores.chartConfig.config, chartConfig.config))
    ) {
        store = createVisualizationStore(
            buildInitialVisualizationState(
                chartConfig,
                seedContext,
                stores.store.getState().cartesianIntent,
            ),
        );
        setStores({ chartConfig, store });
    }
    // A rename whose old name is in the edited query again names a new field, so it is skipped
    const tableCalculationRenames = useMemo(() => {
        const pendingFieldIds = getPendingFieldIds(unsavedMetricQuery);
        return tableCalculationsMetadata?.filter(
            ({ oldName }) => !pendingFieldIds?.has(oldName),
        );
    }, [tableCalculationsMetadata, unsavedMetricQuery]);
    useEffect(() => {
        if (tableCalculationRenames?.length)
            store.dispatch(tableCalculationsRenamed(tableCalculationRenames));
    }, [store, tableCalculationRenames]);
    const setStacking = useStableCallback(
        (value: CartesianIntentState['stacking']) =>
            store.dispatch(cartesianIntentActions.setStacking(value)),
    );
    const setCartesianType = useStableCallback(
        (value: CartesianIntentState['cartesianType']) =>
            store.dispatch(cartesianIntentActions.setCartesianType(value)),
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

    // Forwards a config unless the owner already has it
    const forwardChartConfig = useStableCallback((next: ChartConfig) => {
        if (!onChartConfigChange || isEqual(next.config, chartConfig.config))
            return;
        onChartConfigChange(next);
    });
    // The adapter's last emitted config and the prop it was last compared with
    const emitted = useRef<{
        config: ChartConfig;
        comparedWith: ChartConfig;
    } | null>(null);
    const emitChartConfig = useStableCallback((next: ChartConfig) => {
        emitted.current = { config: next, comparedWith: chartConfig };
        forwardChartConfig(next);
    });
    // An owner resetting the prop gets the edited config back, so an edit in progress wins
    useEffect(() => {
        const last = emitted.current;
        if (
            !last ||
            last.comparedWith === chartConfig ||
            last.config.type !== chartConfig.type
        )
            return;
        emitted.current = { ...last, comparedWith: chartConfig };
        forwardChartConfig(last.config);
    }, [chartConfig, forwardChartConfig]);

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

    // Actions read the inputs at call time, so they stay stable while results change
    const getInputs = useStableCallback(() => state);

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
            setPivotRows,
            getInputs,
            isTouchDevice,
        }),
        [
            setStacking,
            setCartesianType,
            hasSeriesContextMenu,
            stableOnSeriesContextMenu,
            setChartType,
            setPivotDimensions,
            setPivotRows,
            getInputs,
            isTouchDevice,
        ],
    );

    // Stable across resizes so memoised adapters skip them; an echo changes it
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
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationCartesianConfig>
                );
            case ChartType.PIE:
                return (
                    <VisualizationPieConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationPieConfig>
                );
            case ChartType.FUNNEL:
                return (
                    <VisualizationConfigFunnel
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationConfigFunnel>
                );
            case ChartType.BIG_NUMBER:
                return (
                    <VisualizationBigNumberConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationBigNumberConfig>
                );
            case ChartType.TREEMAP:
                return (
                    <VisualizationTreemapConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationTreemapConfig>
                );
            case ChartType.GAUGE:
                return (
                    <VisualizationGaugeConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationGaugeConfig>
                );
            case ChartType.MAP:
                return (
                    <VisualizationMapConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationMapConfig>
                );
            case ChartType.TABLE:
                return (
                    <VisualizationTableConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationTableConfig>
                );
            case ChartType.CUSTOM:
                return (
                    <VisualizationCustomConfig
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationCustomConfig>
                );
            case ChartType.SANKEY:
                return (
                    <VisualizationConfigSankey
                        onChartConfigChange={emitChartConfig}
                    >
                        {renderState}
                    </VisualizationConfigSankey>
                );
            case ChartType.DATA_APP_VIZ:
                return (
                    <VisualizationDataAppVizConfig
                        initialChartConfig={chartConfig.config}
                        onChartConfigChange={forwardChartConfig}
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
