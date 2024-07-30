import {
    BarChartResultsTransformer,
    type BarChartConfig,
    type ResultRow,
    type RowData,
    type SqlColumn,
} from '@lightdash/common';
import { useMemo } from 'react';
import { useAsync } from 'react-use';
import { duckDBFE } from '../duckDBQuery';

const isResultRows = (rows: (RowData | ResultRow)[]): rows is ResultRow[] => {
    if (rows.length === 0) return false;

    const firstRow = rows[0];
    if (typeof firstRow !== 'object' || firstRow === null) return false;

    const firstValue = Object.values(firstRow)[0];
    if (typeof firstValue !== 'object' || firstValue === null) return false;

    return 'value' in firstValue;
};

const convertToRowData = (data: ResultRow[]): RowData[] => {
    return data.map((row) => {
        return Object.fromEntries(
            Object.entries(row).map(([key, value]) => {
                return [key, value.value.raw];
            }),
        );
    });
};

export const useBarChart = (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: BarChartConfig,
) => {
    const transformer = useMemo(
        () =>
            new BarChartResultsTransformer({
                rows: isResultRows(rows) ? convertToRowData(rows) : rows,
                columns,
                duckDBSqlFunction: duckDBFE,
            }),
        [rows, columns],
    );

    return useAsync(
        async () =>
            transformer.getEchartsSpec(config.fieldConfig, config.display),
        [config, transformer],
    );
};
