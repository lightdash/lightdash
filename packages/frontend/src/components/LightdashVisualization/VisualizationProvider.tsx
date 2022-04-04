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
import { useOrganisation } from '../../hooks/organisation/useOrganisation';
import useCartesianChartConfig from '../../hooks/useCartesianChartConfig';
import { useExplore } from '../../hooks/useExplore';
import usePivotDimensions from '../../hooks/usePivotDimensions';
import usePlottedData from '../../hooks/usePlottedData';
import { EchartSeriesClickEvent } from '../SimpleChart';

type VisualizationContext = {
    chartRef: RefObject<EChartsReact>;
    chartType: ChartType;
    cartesianConfig: ReturnType<typeof useCartesianChartConfig>;
    pivotDimensions: string[] | undefined;
    explore: Explore | undefined;
    originalData: ApiQueryResults['rows'];
    plotData: ApiQueryResults['rows'];
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
    setChartType: (value: ChartType) => void;
    setPivotDimensions: (value: string[] | undefined) => void;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

type Props = {
    chartType: ChartType;
    chartConfigs: ChartConfig['config'];
    pivotDimensions: string[] | undefined;
    tableName: string | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
    onChartConfigChange?: (value: ChartConfig['config'] | undefined) => void;
    onChartTypeChange?: (value: ChartType) => void;
    onPivotDimensionsChange?: (value: string[] | undefined) => void;
};

export const VisualizationProvider: FC<Props> = ({
    chartConfigs,
    chartType,
    pivotDimensions,

    tableName,
    resultsData,
    isLoading,
    onSeriesContextMenu,
    onChartConfigChange,
    onChartTypeChange,
    onPivotDimensionsChange,
    children,
}) => {
    const chartRef = useRef<EChartsReact>(null);
    const { data: explore } = useExplore(tableName);
    const { validPivotDimensions, setPivotDimensions } = usePivotDimensions(
        pivotDimensions,
        resultsData,
    );
    const setChartType = useCallback(
        (value: ChartType) => {
            onChartTypeChange?.(value);
        },
        [onChartTypeChange],
    );
    const cartesianConfig = useCartesianChartConfig(
        chartConfigs,
        validPivotDimensions?.[0],
        resultsData,
        setChartType,
        setPivotDimensions,
    );
    const { validCartesianConfig } = cartesianConfig;

    // Use default colors from org
    const { isLoading: isOrgLoading, data } = useOrganisation();

    if (data?.chartColors && validCartesianConfig) {
        validCartesianConfig.eChartsConfig.series =
            validCartesianConfig.eChartsConfig.series?.map((serie, index) => ({
                ...serie,
                color: serie.color
                    ? serie.color
                    : data.chartColors && data.chartColors[index],
            }));
    }

    const plotData = usePlottedData(
        explore,
        validCartesianConfig,
        resultsData,
        validPivotDimensions,
    );

    useEffect(() => {
        onChartConfigChange?.(validCartesianConfig);
    }, [validCartesianConfig, onChartConfigChange]);

    useEffect(() => {
        onPivotDimensionsChange?.(validPivotDimensions);
    }, [validPivotDimensions, onPivotDimensionsChange]);

    return (
        <Context.Provider
            value={{
                pivotDimensions: validPivotDimensions,
                cartesianConfig,
                chartRef,
                chartType,
                explore,
                originalData: resultsData?.rows || [],
                plotData,
                resultsData,
                isLoading,
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
