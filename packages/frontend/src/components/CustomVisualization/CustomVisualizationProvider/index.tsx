import { ResultRow } from '@lightdash/common';
import { createContext, FC, useMemo, useState } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider/useExplorerContext';

const defaultValue = JSON.stringify({}, null, 2);

export const CustomVisualizationContext = createContext<{
    chartConfig: string;
    setChartConfig: (newConfig: string) => void;
    rows: {
        [k: string]: unknown;
    }[];
    fields: string[];
}>({
    chartConfig: defaultValue,
    setChartConfig: () => {},
    rows: [],
    fields: [],
});

const convertRowsToSeries = (rows: ResultRow[]) => {
    return rows.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, rowValue]) => [
                key,
                rowValue.value.raw,
            ]),
        );
    });
};

export const CustomVisualizationProvider: FC = ({ children }) => {
    const rows = useExplorerContext(
        (context) => context.queryResults.data?.rows,
    );

    const [chartConfig, setChartConfig] = useState<string>(defaultValue);

    const convertedRows = useMemo(() => {
        return rows ? convertRowsToSeries(rows) : [];
    }, [rows]);

    const fields = useMemo(() => {
        return rows && rows.length > 0 ? Object.keys(rows[0]) : [];
    }, [rows]);

    return (
        <CustomVisualizationContext.Provider
            value={{
                chartConfig,
                setChartConfig,
                rows: convertedRows,
                fields,
            }}
        >
            {children}
        </CustomVisualizationContext.Provider>
    );
};
