import { ResultRow } from '@lightdash/common';
import EChartsReact from 'echarts-for-react';
import {
    createContext,
    FC,
    useCallback,
    useContext,
    useMemo,
    useState,
} from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';

const defaultValue = {
    xAxis: {
        type: 'category',
        data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
    yAxis: {
        type: 'value',
    },
    series: [
        {
            // data: [120, 200, 150, 80, 70, 110, 130],
            type: 'bar',
            showBackground: true,
            backgroundStyle: {
                color: 'rgba(180, 180, 180, 0.2)',
            },
        },
    ],
};

const CustomVisualizationContext = createContext<{
    echartsConfig: any | undefined;
    setChartConfig: (newConfig: any) => void;
    rows: any;
}>({ echartsConfig: undefined, setChartConfig: () => {}, rows: undefined });

export const useCustomVisualizationContext = () =>
    useContext(CustomVisualizationContext);

const convertRowsToSeries = (rows: ResultRow[]) => {
    return rows.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value.value.raw]),
        );
    });
};

export const CustomVisualizationProvider: FC = ({ children }) => {
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );

    const [echartsConfig, setEchartsConfig] = useState<any>(defaultValue);

    const setChartConfig = useCallback(
        (newConfig: any) => {
            // TODO: we need to figure out the data source better
            newConfig.dataset = {
                source: convertRowsToSeries(rows || []),
            };

            console.log(newConfig);

            setEchartsConfig(newConfig);
        },
        [rows],
    );

    const value = useMemo(
        () => ({
            echartsConfig,
            setChartConfig,
            rows,
        }),
        [echartsConfig, setChartConfig, rows],
    );

    return (
        <CustomVisualizationContext.Provider value={value}>
            {children}
        </CustomVisualizationContext.Provider>
    );
};

const CustomVisualization: FC = () => {
    const { echartsConfig } = useCustomVisualizationContext();

    console.log('echartsConfig', echartsConfig);

    if (!echartsConfig) {
        return null;
    }

    return (
        <EChartsReact
            style={{ height: '100%', width: '100%' }}
            option={echartsConfig}
        />
    );
};

export default CustomVisualization;
