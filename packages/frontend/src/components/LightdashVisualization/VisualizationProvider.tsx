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
import { EChartSeries } from '../../hooks/echarts/getEchartsCartesianConfig';
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
    changeVisualizationConfig: (value: VisualizationConfig) => void;
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
    const { changeVisualizationConfig } = useVisualizationContext();

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

    useEffect(() => {
        changeVisualizationConfig({
            chartType: ChartType.CARTESIAN,
            chartConfig: cartesianConfig,
        });
    }, [changeVisualizationConfig, cartesianConfig]);

    return <>{children}</>;
};

const VisualizationPieConfig: FC<{
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
    const { changeVisualizationConfig } = useVisualizationContext();

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

    useEffect(() => {
        changeVisualizationConfig({
            chartType: ChartType.PIE,
            chartConfig: pieChartConfig,
        });
    }, [changeVisualizationConfig, pieChartConfig]);

    return <>{children}</>;
};

const VisualizationBigNumberConfig: FC<{
    initialChartConfig: ChartConfig | undefined;
    lastValidResultsData: ApiQueryResults | undefined;
    explore?: Explore;
}> = ({ children, initialChartConfig, lastValidResultsData, explore }) => {
    const { changeVisualizationConfig } = useVisualizationContext();

    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig?.type === ChartType.BIG_NUMBER
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
    );

    useEffect(() => {
        changeVisualizationConfig({
            chartType: ChartType.BIG_NUMBER,
            chartConfig: bigNumberConfig,
        });
    }, [changeVisualizationConfig, bigNumberConfig]);

    return <>{children}</>;
};

const VisualizationTableConfig: FC<{
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
    const { changeVisualizationConfig } = useVisualizationContext();

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

    useEffect(() => {
        changeVisualizationConfig({
            chartType: ChartType.TABLE,
            chartConfig: tableConfig,
        });
    }, [changeVisualizationConfig, tableConfig]);

    return <>{children}</>;
};

const VisualizationCustomConfig: FC<{}> = () => {
    const { changeVisualizationConfig } = useVisualizationContext();

    useEffect(() => {
        changeVisualizationConfig({
            chartType: ChartType.CUSTOM,
            chartConfig: {
                test: true,
            },
        });
    }, [changeVisualizationConfig]);

    return <></>;
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
    onChartConfigChange,
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

    const [visualizationConfig, setVisualizationConfig] = useState<
        VisualizationConfig | undefined
    >(undefined);

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

    useEffect(() => {
        onChartConfigChange?.(visualizationConfig?.chartConfig);
    }, [visualizationConfig, onChartConfigChange]);

    const value: VisualizationContext = useMemo(
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
            visualizationConfig,
            changeVisualizationConfig: setVisualizationConfig,
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
            visualizationConfig,
            setVisualizationConfig,
            onSeriesContextMenu,
            setChartType,
            setPivotDimensions,
        ],
    );

    return (
        <Context.Provider value={value}>
            {chartType === ChartType.CARTESIAN ? (
                <VisualizationCartesianConfig
                    chartType={chartType}
                    initialChartConfig={initialChartConfig}
                    validPivotDimensions={validPivotDimensions}
                    lastValidResultsData={lastValidResultsData}
                    columnOrder={isSqlRunner ? [] : defaultColumnOrder}
                    explore={isSqlRunner ? undefined : explore}
                    setPivotDimensions={setPivotDimensions}
                >
                    {children}
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
                    {children}
                </VisualizationPieConfig>
            ) : chartType === ChartType.BIG_NUMBER ? (
                <VisualizationBigNumberConfig
                    initialChartConfig={initialChartConfig}
                    lastValidResultsData={lastValidResultsData}
                    explore={explore}
                >
                    {children}
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
                    {children}
                </VisualizationTableConfig>
            ) : chartType === ChartType.CUSTOM ? (
                <VisualizationCustomConfig>
                    {children}
                </VisualizationCustomConfig>
            ) : (
                assertUnreachable(
                    chartType,
                    `Unexpected chart type: ${chartType}`,
                )
            )}
        </Context.Provider>
    );
};

export default VisualizationProvider;
