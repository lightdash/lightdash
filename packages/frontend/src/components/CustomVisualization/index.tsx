import EChartsReact from 'echarts-for-react';
import { createContext, FC, useContext, useMemo } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';

const CustomVisualizationContext = createContext<{
    echartsConfig: any | undefined;
}>({ echartsConfig: undefined });

const useCustomVisualizationContext = () =>
    useContext(CustomVisualizationContext);

export const CustomVisualizationProvider: FC = ({ children }) => {
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );

    const echartsConfig = useMemo(() => {
        return {
            dataset: {
                source: rows,
            },

            // dummy config...
            xAxis: {
                type: 'category',
                data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            },
            yAxis: {
                type: 'value',
            },
            series: [
                {
                    data: [120, 200, 150, 80, 70, 110, 130],
                    type: 'bar',
                    showBackground: true,
                    backgroundStyle: {
                        color: 'rgba(180, 180, 180, 0.2)',
                    },
                },
            ],
        };
    }, [rows]);

    return (
        <CustomVisualizationContext.Provider value={{ echartsConfig }}>
            {children}
        </CustomVisualizationContext.Provider>
    );
};

const CustomVisualization: FC = () => {
    const { echartsConfig } = useCustomVisualizationContext();

    return <EChartsReact option={echartsConfig} />;
};

export default CustomVisualization;
