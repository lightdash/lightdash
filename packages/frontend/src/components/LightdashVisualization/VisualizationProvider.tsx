import { ApiQueryResults, DBChartTypes, Explore, SavedQuery } from 'common';
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
import { ChartConfig } from '../../hooks/useChartConfig';
import { useExplore } from '../../hooks/useExplore';
import { EchartSeriesClickEvent } from '../SimpleChart';

type VisualizationContext = {
    chartRef: RefObject<EChartsReact>;
    chartType: DBChartTypes;
    seriesLayout: SavedQuery['chartConfig']['seriesLayout'] | undefined;
    chartConfig: ChartConfig | undefined;
    explore: Explore | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
    setChartConfig: (value: ChartConfig | undefined) => void;
    setChartType: (value: DBChartTypes) => void;
};

const Context = createContext<VisualizationContext | undefined>(undefined);

type Props = {
    chartType: DBChartTypes;
    seriesLayout: SavedQuery['chartConfig']['seriesLayout'] | undefined;
    tableName: string | undefined;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    onSeriesContextMenu?: (e: EchartSeriesClickEvent) => void;
    onSeriesLayoutChange?: (
        value: SavedQuery['chartConfig']['seriesLayout'] | undefined,
    ) => void;
    onChartTypeChange?: (value: DBChartTypes) => void;
};

export const VisualizationProvider: FC<Props> = ({
    seriesLayout,
    chartType,
    tableName,
    resultsData,
    isLoading,
    onSeriesContextMenu,
    onSeriesLayoutChange,
    onChartTypeChange,
    children,
}) => {
    const chartRef = useRef<EChartsReact>(null);
    const explore = useExplore(tableName);
    const [chartConfig, setChartConfig] = useState<ChartConfig>();

    useEffect(() => {
        onSeriesLayoutChange?.(chartConfig?.seriesLayout);
    }, [chartConfig, onSeriesLayoutChange]);

    const setChartType = useCallback(
        (value: DBChartTypes) => onChartTypeChange?.(value),
        [onChartTypeChange],
    );
    return (
        <Context.Provider
            value={{
                seriesLayout,
                chartConfig,
                chartRef,
                chartType,
                explore: explore.data,
                resultsData,
                isLoading,
                onSeriesContextMenu,
                setChartConfig,
                setChartType,
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
