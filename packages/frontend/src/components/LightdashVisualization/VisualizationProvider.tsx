import {
    AdditionalMetric,
    ApiQueryResults,
    assertUnreachable,
    ChartConfig,
    ChartType,
    convertAdditionalMetric,
    CustomDimension,
    Dimension,
    Explore,
    fieldId,
    getCustomDimensionId,
    getDimensions,
    getMetrics,
    isNumericItem,
    Metric,
    TableCalculation,
} from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import {
    createContext,
    FC,
    RefObject,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import useCartesianChartConfig from '../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { EChartSeries } from '../../hooks/echarts/useEchartsCartesianConfig';
import useTableConfig from '../../hooks/tableVisualization/useTableConfig';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import usePieChartConfig from '../../hooks/usePieChartConfig';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import { EchartSeriesClickEvent } from '../SimpleChart';

export type VisualizationConfigCartesian = ReturnType<
    typeof useCartesianChartConfig
>;
export type VisualizationConfigTable = ReturnType<typeof useTableConfig>;
export type VisualizationConfigBigNumber = ReturnType<
    typeof useBigNumberConfig
>;
export type VisualizationConfigPie = ReturnType<typeof usePieChartConfig>;

export type VisualizationConfig =
    | {
          chartType: ChartType.CARTESIAN;
          chartConfig: VisualizationConfigCartesian;
      }
    | {
          chartType: ChartType.BIG_NUMBER;
          chartConfig: VisualizationConfigBigNumber;
      }
    | {
          chartType: ChartType.TABLE;
          chartConfig: VisualizationConfigTable;
      }
    | {
          chartType: ChartType.PIE;
          chartConfig: VisualizationConfigPie;
      }
    | {
          chartType: ChartType.CUSTOM;
          chartConfig: { test: true };
      };

type VisualizationContext = {
    minimal: boolean;
    chartRef: RefObject<EChartsReact>;
    pivotDimensions: string[] | undefined;
    explore: Explore | undefined;
    originalData: ApiQueryResults['rows'];
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    isSqlRunner: boolean;
    dimensions: Dimension[];
    customDimensions: CustomDimension[];
    metrics: Metric[];
    allMetrics: (Metric | TableCalculation)[];
    allNumericMetrics: (Metric | TableCalculation)[];
    customMetrics: AdditionalMetric[];
    tableCalculations: TableCalculation[];
    visualizationConfig: VisualizationConfig | undefined;
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;
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

const VisualizationCartesianConfig: FC<{
    children: (props: {
        visualizationConfig: VisualizationConfig;
    }) => JSX.Element;
    chartType: ChartType.CARTESIAN;
    initialChartConfig: ChartConfig | undefined;
    validPivotDimensions: string[] | undefined;
    lastValidResultsData: ApiQueryResults | undefined;
    setPivotDimensions: React.Dispatch<
        React.SetStateAction<string[] | undefined>
    >;
    columnOrder: string[];
    explore?: Explore;
}> = ({
    children,
    chartType,
    initialChartConfig,
    validPivotDimensions,
    lastValidResultsData,
    columnOrder,
    explore,
    setPivotDimensions,
}) => {
    const cartesianConfig = useCartesianChartConfig({
        // TODO: we should not be doing this...
        chartType,
        initialChartConfig:
            initialChartConfig?.type === ChartType.CARTESIAN
                ? initialChartConfig.config
                : undefined,
        pivotKeys: validPivotDimensions,
        resultsData: lastValidResultsData,
        setPivotDimensions,
        columnOrder,
        explore,
    });

    if (typeof children !== 'function') {
        throw new Error(
            'VisualizationCartesianConfig children must be a function',
        );
    }

    return children({
        visualizationConfig: {
            chartType: ChartType.CARTESIAN,
            chartConfig: cartesianConfig,
        },
    });
};

const VisualizationPieConfig: FC<{
    children: (props: {
        visualizationConfig: VisualizationConfig;
    }) => JSX.Element;
    initialChartConfig: ChartConfig | undefined;
    resultsData: ApiQueryResults | undefined;
    dimensions: Dimension[];
    allNumericMetrics: (Metric | TableCalculation)[];
    customDimensions: CustomDimension[];
    explore?: Explore;
}> = ({
    children,
    initialChartConfig,
    resultsData,
    dimensions,
    allNumericMetrics,
    customDimensions,
    explore,
}) => {
    const pieChartConfig = usePieChartConfig(
        explore,
        resultsData,
        initialChartConfig?.type === ChartType.PIE
            ? initialChartConfig.config
            : undefined,
        dimensions,
        allNumericMetrics,
        customDimensions,
    );

    if (typeof children !== 'function') {
        throw new Error('VisualizationPieConfig children must be a function');
    }

    return children({
        visualizationConfig: {
            chartType: ChartType.PIE,
            chartConfig: pieChartConfig,
        },
    });
};

const VisualizationBigNumberConfig: FC<{
    children: (props: {
        visualizationConfig: VisualizationConfig;
    }) => JSX.Element;
    initialChartConfig: ChartConfig | undefined;
    lastValidResultsData: ApiQueryResults | undefined;
    explore?: Explore;
}> = ({ children, initialChartConfig, lastValidResultsData, explore }) => {
    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig?.type === ChartType.BIG_NUMBER
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
    );

    if (typeof children !== 'function') {
        throw new Error(
            'VisualizationBigNumberConfig children must be a function',
        );
    }

    return children({
        visualizationConfig: {
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        },
    });
};

const VisualizationTableConfig: FC<{
    children: (props: {
        visualizationConfig: VisualizationConfig;
    }) => JSX.Element;
    initialChartConfig: ChartConfig | undefined;
    lastValidResultsData: ApiQueryResults | undefined;
    explore?: Explore;
    columnOrder: string[];
    validPivotDimensions: string[] | undefined;
    pivotTableMaxColumnLimit: number;
}> = ({
    children,
    initialChartConfig,
    lastValidResultsData,
    explore,
    columnOrder,
    validPivotDimensions,
    pivotTableMaxColumnLimit,
}) => {
    const tableConfig = useTableConfig(
        initialChartConfig?.type === ChartType.TABLE
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
        columnOrder,
        validPivotDimensions,
        pivotTableMaxColumnLimit,
    );

    if (typeof children !== 'function') {
        throw new Error('VisualizationTableConfig children must be a function');
    }

    return children({
        visualizationConfig: {
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        },
    });
};

const VisualizationCustomConfig: FC<{
    children: (props: {
        visualizationConfig: VisualizationConfig;
    }) => JSX.Element;
}> = ({ children }) => {
    if (typeof children !== 'function') {
        throw new Error(
            'VisualizationCustomConfig children must be a function',
        );
    }

    return children({
        visualizationConfig: {
            chartType: ChartType.CUSTOM,
            chartConfig: { test: true },
        },
    });
};

type Props = {
    minimal?: boolean;
    chartType: ChartType;
    initialChartConfig: ChartConfig | undefined;
    initialPivotDimensions: string[] | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onChartConfigChange?: (value: ChartConfig['config']) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
    explore: Explore | undefined;
    isSqlRunner?: boolean;
    pivotTableMaxColumnLimit: number;
};

const VisualizationProvider: FC<Props> = ({
    minimal = false,
    initialChartConfig,
    chartType,
    initialPivotDimensions,
    resultsData,
    isLoading,
    columnOrder,
    onSeriesContextMenu,
    onChartTypeChange,
    onPivotDimensionsChange,
    explore,
    isSqlRunner,
    pivotTableMaxColumnLimit,
    children,
}) => {
    const chartRef = useRef<EChartsReact>(null);

    const setChartType = useCallback(
        (value: ChartType) => onChartTypeChange?.(value),
        [onChartTypeChange],
    );

    const [lastValidResultsData, setLastValidResultsData] =
        useState<ApiQueryResults>();

    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        lastValidResultsData,
    );

    const dimensions = useMemo(() => {
        if (!explore) return [];
        return getDimensions(explore).filter((field) =>
            resultsData?.metricQuery.dimensions.includes(fieldId(field)),
        );
    }, [explore, resultsData?.metricQuery.dimensions]);

    const metrics = useMemo(() => {
        if (!explore) return [];
        return getMetrics(explore).filter((field) =>
            resultsData?.metricQuery.metrics.includes(fieldId(field)),
        );
    }, [explore, resultsData?.metricQuery.metrics]);

    const customDimensions = useMemo(() => {
        return resultsData?.metricQuery.customDimensions || [];
    }, [resultsData?.metricQuery.customDimensions]);

    const customMetrics = useMemo(() => {
        if (!explore) return [];

        return (resultsData?.metricQuery.additionalMetrics || []).reduce<
            Metric[]
        >((acc, additionalMetric) => {
            const table = explore.tables[additionalMetric.table];
            if (!table) return acc;

            const metric = convertAdditionalMetric({
                additionalMetric,
                table,
            });

            if (!resultsData?.metricQuery.metrics.includes(fieldId(metric))) {
                return acc;
            }

            return [...acc, metric];
        }, []);
    }, [
        explore,
        resultsData?.metricQuery.additionalMetrics,
        resultsData?.metricQuery.metrics,
    ]);

    const tableCalculations = useMemo(() => {
        return resultsData?.metricQuery.tableCalculations ?? [];
    }, [resultsData?.metricQuery.tableCalculations]);

    const allMetrics = useMemo(
        () => [...metrics, ...customMetrics, ...tableCalculations],
        [metrics, customMetrics, tableCalculations],
    );

    const allNumericMetrics = useMemo(
        () => allMetrics.filter((m) => isNumericItem(m)),
        [allMetrics],
    );

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

    useEffect(() => {
        if (!resultsData) return;
        setLastValidResultsData(resultsData);
    }, [resultsData]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    // TODO: fix...
    // useEffect(() => {
    //     onChartConfigChange?.(visualizationConfig?.chartConfig);
    // }, [visualizationConfig, onChartConfigChange]);

    const value: Omit<VisualizationContext, 'visualizationConfig'> = useMemo(
        () => ({
            minimal,
            pivotDimensions: validPivotDimensions,
            chartRef,
            originalData: lastValidResultsData?.rows || [],
            resultsData: lastValidResultsData,
            isLoading,
            explore,
            columnOrder,
            isSqlRunner: isSqlRunner || false,
            dimensions,
            metrics,
            customMetrics,
            customDimensions,
            tableCalculations,
            allMetrics,
            allNumericMetrics,
            onSeriesContextMenu,
            setChartType,
            setPivotDimensions,
        }),
        [
            minimal,
            columnOrder,
            isLoading,
            explore,
            isSqlRunner,
            lastValidResultsData,
            validPivotDimensions,
            dimensions,
            metrics,
            customMetrics,
            customDimensions,
            tableCalculations,
            allMetrics,
            allNumericMetrics,
            onSeriesContextMenu,
            setChartType,
            setPivotDimensions,
        ],
    );

    return chartType === ChartType.CARTESIAN ? (
        <VisualizationCartesianConfig
            chartType={chartType}
            initialChartConfig={initialChartConfig}
            validPivotDimensions={validPivotDimensions}
            lastValidResultsData={lastValidResultsData}
            columnOrder={isSqlRunner ? [] : defaultColumnOrder}
            explore={isSqlRunner ? undefined : explore}
            setPivotDimensions={setPivotDimensions}
        >
            {({ visualizationConfig }) => (
                <Context.Provider value={{ ...value, visualizationConfig }}>
                    {children}
                </Context.Provider>
            )}
        </VisualizationCartesianConfig>
    ) : chartType === ChartType.PIE ? (
        <VisualizationPieConfig
            initialChartConfig={initialChartConfig}
            resultsData={lastValidResultsData}
            dimensions={dimensions}
            allNumericMetrics={allNumericMetrics}
            customDimensions={customDimensions}
            explore={explore}
        >
            {({ visualizationConfig }) => (
                <Context.Provider value={{ ...value, visualizationConfig }}>
                    {children}
                </Context.Provider>
            )}
        </VisualizationPieConfig>
    ) : chartType === ChartType.BIG_NUMBER ? (
        <VisualizationBigNumberConfig
            initialChartConfig={initialChartConfig}
            lastValidResultsData={lastValidResultsData}
            explore={explore}
        >
            {({ visualizationConfig }) => (
                <Context.Provider value={{ ...value, visualizationConfig }}>
                    {children}
                </Context.Provider>
            )}
        </VisualizationBigNumberConfig>
    ) : chartType === ChartType.TABLE ? (
        <VisualizationTableConfig
            initialChartConfig={initialChartConfig}
            lastValidResultsData={lastValidResultsData}
            explore={explore}
            columnOrder={defaultColumnOrder}
            validPivotDimensions={validPivotDimensions}
            pivotTableMaxColumnLimit={pivotTableMaxColumnLimit}
        >
            {({ visualizationConfig }) => (
                <Context.Provider value={{ ...value, visualizationConfig }}>
                    {children}
                </Context.Provider>
            )}
        </VisualizationTableConfig>
    ) : chartType === ChartType.CUSTOM ? (
        <VisualizationCustomConfig>
            {({ visualizationConfig }) => (
                <Context.Provider value={{ ...value, visualizationConfig }}>
                    {children}
                </Context.Provider>
            )}
        </VisualizationCustomConfig>
    ) : (
        assertUnreachable(chartType, `Unexpected chart type: ${chartType}`)
    );
};

export default VisualizationProvider;
