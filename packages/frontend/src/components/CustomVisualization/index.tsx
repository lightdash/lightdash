import { ResultRow } from '@lightdash/common';
import { Code } from '@mantine/core';
import { createContext, FC, useContext, useMemo, useState } from 'react';
import { VegaLite } from 'react-vega';
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
            Object.entries(row).map(([key, value]) => [
                key,
                key === 'payments_unique_payment_count'
                    ? parseInt(value.value.raw as string)
                    : value.value.raw,
            ]),
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
                },
                null,
            ];
        } catch (e) {
            return [null, e];
        }
    }, [echartsConfig]);

    if (error) {
        return <Code>{error.toString()}</Code>;
    }

    const data = { table: convertRowsToSeries(rows || []) };
    console.log(data);
    return (
        <VegaLite spec={{ ...config, data: { name: 'table' } }} data={data} />
    );
};

export default CustomVisualization;
