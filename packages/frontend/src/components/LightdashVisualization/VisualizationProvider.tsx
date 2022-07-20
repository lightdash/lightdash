import {
    ApiQueryResults,
    ChartConfig,
    ChartType,
    Explore,
} from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import React, {
    createContext,
    FC,
    RefObject,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import { EChartSeries } from '../../hooks/echarts/useEcharts';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import useCartesianChartConfig from '../../hooks/useCartesianChartConfig';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import usePlottedData from '../../hooks/usePlottedData';
import useTableConfig from '../../hooks/useTableConfig';
import { EchartSeriesClickEvent } from '../SimpleChart';

type VisualizationContext = {
    chartRef: RefObject<EChartsReact>;
    chartType: ChartType;
    cartesianConfig: ReturnType<typeof useCartesianChartConfig>;
    bigNumberConfig: ReturnType<typeof useBigNumberConfig>;
    tableConfig: ReturnType<typeof useTableConfig>;
    pivotDimensions: string[] | undefined;
    explore: Explore | undefined;
    originalData: ApiQueryResults['rows'];
    plotData: ApiQueryResults['rows'];
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (
        e: EchartSeriesClickEvent,
        series: EChartSeries[],
    ) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

type Props = {
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
};

export const VisualizationProvider: FC<Props> = ({
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
    children,
}) => {
    const chartRef = useRef<EChartsReact>(null);

    const [lastValidResultsData, setLastValidResultsData] =
        useState<ApiQueryResults>();
    useEffect(() => {
        if (!!resultsData) {
            setLastValidResultsData(resultsData);
        }
    }, [resultsData]);

    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        lastValidResultsData,
    );
    const setChartType = useCallback(
        (value: ChartType) => {
            onChartTypeChange?.(value);
        },
        [onChartTypeChange],
    );

    const bigNumberConfig = useBigNumberConfig(
        initialChartConfig?.type === ChartType.BIG_NUMBER
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
    );

    const tableConfig = useTableConfig(
        initialChartConfig?.type === ChartType.TABLE
            ? initialChartConfig.config
            : undefined,
        lastValidResultsData,
        explore,
        columnOrder,
    );

    const { validBigNumberConfig } = bigNumberConfig;
    const { validTableConfig } = tableConfig;
    const cartesianConfig = useCartesianChartConfig({
        initialChartConfig:
            initialChartConfig?.type === ChartType.CARTESIAN
                ? initialChartConfig.config
                : undefined,
        pivotKey: validPivotDimensions?.[0],
        resultsData: lastValidResultsData,
        setPivotDimensions,
    });

    const { validCartesianConfig } = cartesianConfig;

    const plotData = usePlottedData(
        explore,
        validCartesianConfig,
        lastValidResultsData,
        validPivotDimensions,
    );

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
            default:
                const never: never = chartType;
                throw new Error(`Unexpected chart type: ${chartType}`);
        }
        onChartConfigChange?.(validConfig);
    }, [
        validCartesianConfig,
        onChartConfigChange,
        chartType,
        validBigNumberConfig,
        validTableConfig,
    ]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    return (
        <Context.Provider
            value={{
                pivotDimensions: validPivotDimensions,
                cartesianConfig,
                bigNumberConfig,
                tableConfig,
                chartRef,
                chartType,
                explore,
                originalData: lastValidResultsData?.rows || [],
                plotData,
                resultsData: lastValidResultsData,
                isLoading,
                columnOrder,
                onSeriesContextMenu,
                setChartType,
                setPivotDimensions,
            }}
        >
            {children}
        </Context.Provider>
    );
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
