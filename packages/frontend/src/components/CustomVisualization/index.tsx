import { ResultRow } from '@lightdash/common';
import { Code } from '@mantine/core';
import EChartsReact from 'echarts-for-react';
import { createContext, FC, useContext, useMemo, useState } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';

const defaultValue = '{}';

const CustomVisualizationContext = createContext<{
    echartsConfig: string;
    setEchartsConfig: (newConfig: string) => void;
    rows: ResultRow[] | undefined;
}>({
    echartsConfig: defaultValue,
    setEchartsConfig: () => {},
    rows: undefined,
});

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

    const [echartsConfig, setEchartsConfig] = useState<string>(defaultValue);

    return (
        <CustomVisualizationContext.Provider
            value={{
                echartsConfig,
                setEchartsConfig,
                rows,
            }}
        >
            {children}
        </CustomVisualizationContext.Provider>
    );
};

const CustomVisualization: FC = () => {
    const { echartsConfig, rows } = useCustomVisualizationContext();

    const [config, error] = useMemo(() => {
        try {
            return [
                {
                    ...JSON.parse(echartsConfig),
                    dataset: { source: convertRowsToSeries(rows || []) },
                },
                null,
            ];
        } catch (e) {
            return [null, e];
        }
    }, [echartsConfig, rows]);

    if (error) {
        return <Code>{error.toString()}</Code>;
    }

    return (
        <EChartsReact
            style={{ height: '100%', width: '100%' }}
            option={config}
        />
    );
};

export default CustomVisualization;
