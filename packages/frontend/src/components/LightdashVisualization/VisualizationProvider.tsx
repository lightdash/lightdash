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
import { EChartSeries } from '../../hooks/echarts/useEcharts';
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
    visualizationConfig: VisualizationConfig;
    pivotDimensions: string[] | undefined;
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
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

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
    onChartConfigChange?: (value: ChartConfig['config']) => void;
    onChartTypeChange?: (value: ChartType) => void;
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
    onChartConfigChange,
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

    const tableConfig = useTableConfig(
        initialChartConfig?.type === ChartType.TABLE
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
        (columnOrder = defaultColumnOrder),
        validPivotDimensions,
        pivotTableMaxColumnLimit,
    );

    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig?.type === ChartType.BIG_NUMBER
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
    );

    const cartesianConfig = useCartesianChartConfig({
        chartType,
        initialChartConfig:
            initialChartConfig?.type === ChartType.CARTESIAN
                ? initialChartConfig.config
                : undefined,
        pivotKeys: validPivotDimensions,
        resultsData: lastValidResultsData,
        setPivotDimensions,
        columnOrder: isSqlRunner ? [] : defaultColumnOrder,
        explore: isSqlRunner ? undefined : explore,
    });

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

    const { validTableConfig } = tableConfig;
    const { validBigNumberConfig } = bigNumberConfig;
    const { validCartesianConfig } = cartesianConfig;
    const { validPieChartConfig } = pieChartConfig;

    useEffect(() => {
        let validConfig: ChartConfig['config'];
        switch (chartType) {
            case ChartType.CARTESIAN:
                validConfig = validCartesianConfig;
                break;
            case ChartType.BIG_NUMBER:
                validConfig = validBigNumberConfig;
                break;
            case ChartType.TABLE:
                validConfig = validTableConfig;
                break;
            case ChartType.PIE:
                validConfig = validPieChartConfig;
                break;
            case ChartType.CUSTOM:
                validConfig = {};
                break;
            default:
                assertUnreachable(
                    chartType,
                    `Unexpected chart type: ${chartType}`,
                );
        }
        onChartConfigChange?.(validConfig);
    }, [
        onChartConfigChange,
        chartType,
        validCartesianConfig,
        validPieChartConfig,
        validBigNumberConfig,
        validTableConfig,
    ]);

    useEffect(() => {
        if (!!resultsData) {
            setLastValidResultsData(resultsData);
        }
    }, [resultsData]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    const visualizationConfig: VisualizationConfig = useMemo(() => {
        switch (chartType) {
            case ChartType.CARTESIAN:
                return {
                    chartType: ChartType.CARTESIAN,
                    chartConfig: cartesianConfig,
                } as const;
            case ChartType.BIG_NUMBER:
                return {
                    chartType: ChartType.BIG_NUMBER,
                    chartConfig: bigNumberConfig,
                } as const;
            case ChartType.TABLE:
                return {
                    chartType: ChartType.TABLE,
                    chartConfig: tableConfig,
                } as const;
            case ChartType.PIE:
                return {
                    chartType: ChartType.PIE,
                    chartConfig: pieChartConfig,
                };
            case ChartType.CUSTOM:
                return {
                    chartType: ChartType.CUSTOM,
                    chartConfig: { test: true },
                } as const;
            default:
                return assertUnreachable(
                    chartType,
                    `Unexpected chart type: ${chartType}`,
                );
        }
    }, [
        chartType,
        cartesianConfig,
        bigNumberConfig,
        tableConfig,
        pieChartConfig,
    ]);

    const value: VisualizationContext = useMemo(
        () => ({
            minimal,
            pivotDimensions: validPivotDimensions,
            visualizationConfig,
            chartRef,
            originalData: lastValidResultsData?.rows || [],
            resultsData: lastValidResultsData,
            isLoading,
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
            isSqlRunner,
            lastValidResultsData,
            visualizationConfig,
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

    return <Context.Provider value={value}>{children}</Context.Provider>;
};

export function useVisualizationContext(): VisualizationContext {
    const context = useContext(Context);
    if (context === undefined) {
        throw new Error(
            'useVisualizationContext must be used within a VisualizationProvider',
        );
    }
    return context;
}

export default VisualizationProvider;
