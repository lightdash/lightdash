import {
    BarChartDataTransformer,
    SqlRunnerResultsTransformer,
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

export class SqlRunnerResultsTransformerFE extends SqlRunnerResultsTransformer {
    constructor(args: { rows: (RowData | ResultRow)[]; columns: SqlColumn[] }) {
        super({
            rows: isResultRows(args.rows)
                ? convertToRowData(args.rows)
                : args.rows,
            columns: args.columns,
            duckDBSqlFunction: duckDBFE,
        });
    }
}

export const useBarChart = (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: BarChartConfig,
) => {
    const transformer = useMemo(
        () =>
            new SqlRunnerResultsTransformerFE({
                rows,
                columns,
            }),
        [rows, columns],
    );
    const barChart = useMemo(
        () =>
            new BarChartDataTransformer({
                transformer,
            }),
        [transformer],
    );

    return useAsync(
        async () => barChart.getEchartsSpec(config.fieldConfig, config.display),
        [config, barChart],
    );
};
