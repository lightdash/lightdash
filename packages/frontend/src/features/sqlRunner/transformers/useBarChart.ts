import {
    BarChartDataTransformer,
    SqlRunnerResultsTransformer,
    type BarChartConfig,
    type ResultRow,
    type RowData,
    type SqlColumn,
} from '@lightdash/common';
import { useEffect, useMemo, useState } from 'react';
import { duckDBFE } from '../duckDBQuery';

const isResultRows = (rows: (RowData | ResultRow)[]): rows is ResultRow[] => {
    return Array.isArray(rows) && rows.length > 0 && 'value' in rows[0];
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

export const useBarChart = async (
    rows: ResultRow[],
    columns: SqlColumn[],
    config: BarChartConfig,
) => {
    // TODO: Define an accurate type for this chartSpec
    const [chartSpec, setChartSpec] = useState<unknown | null>(null);
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

    useEffect(() => {
        void barChart
            .getEchartsSpec(config.fieldConfig, config.display)
            .then((spec) => setChartSpec(spec));
    }, [config, barChart]);

    return {
        chartSpec,
    };
};
