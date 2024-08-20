import {
    type ResultRow,
    type RowData,
    type VizSqlColumn,
} from '@lightdash/common';
import { duckDBFE } from '../duckDBQuery';
import { SqlRunnerResultsTransformer } from '../SqlResultsRunner';

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
    constructor(args: {
        rows: (RowData | ResultRow)[];
        columns: VizSqlColumn[];
    }) {
        super({
            rows: isResultRows(args.rows)
                ? convertToRowData(args.rows)
                : args.rows,
            columns: args.columns,
            duckDBSqlFunction: duckDBFE,
        });
    }
}
