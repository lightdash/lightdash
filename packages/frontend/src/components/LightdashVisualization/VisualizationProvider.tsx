import { ApiQueryResults, ChartConfig, ChartType, Explore } from 'common';
import EChartsReact from 'echarts-for-react';
import React, {
    createContext,
    FC,
    RefObject,
    useCallback,
    useContext,
    useEffect,
    useRef,
} from 'react';
import useBigNumberConfig from '../../hooks/useBigNumberConfig';
import useCartesianChartConfig from '../../hooks/useCartesianChartConfig';
import { useExplore } from '../../hooks/useExplore';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import usePlottedData from '../../hooks/usePlottedData';
import { EchartSeriesClickEvent } from '../SimpleChart';

type VisualizationContext = {
    chartRef: RefObject<EChartsReact>;
    chartType: ChartType;
    cartesianConfig: ReturnType<typeof useCartesianChartConfig>;
    bigNumberConfig: ReturnType<typeof useBigNumberConfig>;
    pivotDimensions: string[] | undefined;
    explore: Explore | undefined;
    originalData: ApiQueryResults['rows'];
    plotData: ApiQueryResults['rows'];
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

type Props = {
    chartType: ChartType;
    initialChartConfig: ChartConfig | undefined;
    initialPivotDimensions: string[] | undefined;
    tableName: string | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    columnOrder: string[];
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
    onChartConfigChange?: (value: ChartConfig['config']) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
};

export const VisualizationProvider: FC<Props> = ({
    initialChartConfig,
    chartType,
    initialPivotDimensions,
    tableName,
    resultsData,
    isLoading,
    columnOrder,
    onSeriesContextMenu,
    onChartConfigChange,
    onChartTypeChange,
    onPivotDimensionsChange,
    children,
}) => {
    const chartRef = useRef<EChartsReact>(null);
    const { data: explore } = useExplore(tableName);
    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        initialPivotDimensions,
        resultsData,
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
        resultsData,
        explore,
    );

    const { validBigNumberConfig } = bigNumberConfig;

    const cartesianConfig = useCartesianChartConfig(
        initialChartConfig?.type === ChartType.CARTESIAN
            ? initialChartConfig.config
            : undefined,
        validPivotDimensions?.[0],
        resultsData,
        setPivotDimensions,
    );

    const { validCartesianConfig } = cartesianConfig;

    const plotData = usePlottedData(
        explore,
        validCartesianConfig,
        resultsData,
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
                break;
            case ChartType.DONUT:
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
    ]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    return (
        <Context.Provider
            value={{
                pivotDimensions: validPivotDimensions,
                cartesianConfig,
                bigNumberConfig,
                chartRef,
                chartType,
                explore,
                originalData: resultsData?.rows || [],
                plotData,
                resultsData,
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
