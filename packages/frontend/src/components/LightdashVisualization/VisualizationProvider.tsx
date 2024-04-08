import {
    assertUnreachable,
    ChartType,
    getCustomDimensionId,
    type ApiQueryResults,
    type ChartConfig,
    type DashboardFilters,
    type ItemsMap,
    type SeriesMetadata,
    type TableCalculationMetadata,
} from '@lightdash/common';
import type EChartsReact from 'echarts-for-react';
import isEqual from 'lodash/isEqual';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type RefObject,
} from 'react';
import { type CartesianTypeOptions } from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { type EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import {
    calculateSeriesLikeIdentifier,
    isGroupedSeries,
    useChartColorConfig,
    type SeriesLike,
} from '../../hooks/useChartColorConfig';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { type EchartSeriesClickEvent } from '../SimpleChart';
import VisualizationBigNumberConfig, {
    type VisualizationConfigBigNumber,
} from './VisualizationBigNumberConfig';
import VisualizationCartesianConfig, {
    type VisualizationConfigCartesian,
} from './VisualizationConfigCartesian';
import VisualizationPieConfig, {
    type VisualizationConfigPie,
} from './VisualizationConfigPie';
import VisualizationTableConfig, {
    type VisualizationConfigTable,
} from './VisualizationConfigTable';
import VisualizationCustomConfig, {
    type VisualizationCustomConfigType,
} from './VisualizationCustomConfig';

export type VisualizationConfig =
    | VisualizationConfigBigNumber
    | VisualizationConfigCartesian
    | VisualizationCustomConfigType
    | VisualizationConfigPie
    | VisualizationConfigTable;

type VisualizationContext = {
    minimal: boolean;
    chartRef: RefObject<EChartsReact>;
    pivotDimensions: string[] | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    isSqlRunner: boolean;
    itemsMap: ItemsMap | undefined;
    visualizationConfig: VisualizationConfig;
    // cartesian config related
    setStacking: (value: boolean | undefined) => void;
    setCartesianType(args: CartesianTypeOptions | undefined): void;
    // --
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;

    getSeriesColor: (seriesLike: SeriesLike) => string;
    getGroupColor: (groupPrefix: string, groupName: string) => string;
    setMetadata: (metadata: Record<string, SeriesMetadata>) => void;
    metadata?: Record<string, SeriesMetadata>;
    colorPalette: string[];
};

const Context = createContext<VisualizationContext | undefined>(undefined);

export function useVisualizationContext(): VisualizationContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useVisualizationContext must be used within a VisualizationProvider',
        );
    }
    return context;
}

export type VisualizationConfigCommon<T extends VisualizationConfig> = {
    resultsData: ApiQueryResults | undefined;
    initialChartConfig: T['chartConfig']['validConfig'] | undefined;
    onChartConfigChange?: (chartConfig: {
        type: T['chartType'];
        config: T['chartConfig']['validConfig'];
    }) => void;
    children: (props: { visualizationConfig: T }) => JSX.Element;
};

type Props = {
    minimal?: boolean;
    chartConfig: ChartConfig;
    initialPivotDimensions: string[] | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onChartConfigChange?: (value: ChartConfig) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
    isSqlRunner?: boolean;
    pivotTableMaxColumnLimit: number;
    savedChartUuid?: string;
    dashboardFilters?: DashboardFilters;
    invalidateCache?: boolean;
    colorPalette: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
};

const VisualizationProvider: FC<React.PropsWithChildren<Props>> = ({
    minimal = false,
    initialPivotDimensions,
    resultsData,
    isLoading,
    columnOrder,
    isSqlRunner,
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
}) => {
    const itemsMap = useMemo(() => {
        return resultsData?.fields;
    }, [resultsData]);

    const chartRef = useRef<EChartsReact>(null);

    const [metadata, setMetadata] = useState<Record<string, SeriesMetadata>>();
    const [lastValidResultsData, setLastValidResultsData] =
        useState<ApiQueryResults>();

    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        lastValidResultsData,
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
                          ...(metricQuery.customDimensions?.map(
                              getCustomDimensionId,
                          ) || []),
                      ]
                    : [];
            return metricQueryFields;
        }
    }, [resultsData?.metricQuery, columnOrder]);

    /**
     * Build a local set of fallback colors, used when dealing with ungrouped series.
     *
     * Colors are pre-calculated per-series, and re-calculated when series change.
     */
    const fallbackColors = useMemo<Record<string, string>>(() => {
        if (!chartConfig?.config || chartConfig.type !== ChartType.CARTESIAN) {
            return {};
        }

        return Object.fromEntries(
            (chartConfig.config.eChartsConfig.series ?? []).map((series, i) => {
                return [
                    calculateSeriesLikeIdentifier(series).join('|'),
                    colorPalette[i % colorPalette.length],
                ];
            }),
        );
    }, [chartConfig, colorPalette]);

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
     */
    const getGroupColor = useCallback(
        (groupPrefix: string, identifier: string) => {
            return calculateKeyColorAssignment(groupPrefix, identifier);
        },
        [calculateKeyColorAssignment],
    );

    /**
     * Gets a shared color for a given series.
     */
    const getSeriesColor = useCallback(
        (seriesLike: SeriesLike) => {
            if (seriesLike.color) return seriesLike.color;

            // Check if color is stored in metadata
            const serieId = calculateSeriesLikeIdentifier(seriesLike).join('.');
            if (metadata && metadata?.[serieId]?.color)
                return metadata?.[serieId].color;

            /**
             * If this series is grouped, figure out a shared color assignment from the series;
             * otherwise, pick a series color from the palette based on its order.
             */
            return isGroupedSeries(seriesLike)
                ? calculateSeriesColorAssignment(seriesLike)
                : fallbackColors[
                      // Note: we don't use getSeriesId since we may not be dealing with a Series type here
                      calculateSeriesLikeIdentifier(seriesLike).join('|')
                  ];
        },
        [calculateSeriesColorAssignment, fallbackColors, metadata],
    );

    const value: Omit<VisualizationContext, 'visualizationConfig'> = {
        minimal,
        pivotDimensions: validPivotDimensions,
        chartRef,
        resultsData: lastValidResultsData,
        isLoading,
        columnOrder,
        isSqlRunner: isSqlRunner ?? false,
        itemsMap,
        setStacking,
        setCartesianType,
        onSeriesContextMenu,
        setChartType,
        setPivotDimensions,
        colorPalette,
        getGroupColor,
        getSeriesColor,
        setMetadata,
        metadata,
    };

    switch (chartConfig.type) {
        case ChartType.CARTESIAN:
            return (
                <VisualizationCartesianConfig
                    itemsMap={itemsMap}
                    resultsData={lastValidResultsData}
                    validPivotDimensions={validPivotDimensions}
                    columnOrder={isSqlRunner ? [] : defaultColumnOrder}
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
