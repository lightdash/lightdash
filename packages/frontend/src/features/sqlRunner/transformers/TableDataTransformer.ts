import {
    SqlRunnerResultsTableTransformer,
    type ResultRow,
    type SqlTableConfig,
} from '@lightdash/common';
import { type ColumnDef } from '@tanstack/react-table';
import { getRawValueCell } from '../../../hooks/useColumns';

export class TableDataTransformer {
    private transformer: SqlRunnerResultsTableTransformer;

    private columns: ColumnDef<ResultRow, any>[];

    private config: SqlTableConfig | undefined;

    constructor(
        private data: ResultRow[],
        private tableChartSqlConfig: SqlTableConfig | undefined,
    ) {
        this.config = this.tableChartSqlConfig;
        this.transformer = new SqlRunnerResultsTableTransformer({
            data: this.data,
        });
        this.columns = this.createColumns();
    }

    private createColumns(): ColumnDef<ResultRow, any>[] {
        const columns = this.transformer.getColumns();
        return columns
            .filter((column) =>
                this.config ? this.config.columns[column]?.visible : true,
            )
            .map((column) => ({
                id: column,
                accessorKey: column,
                header: this.config?.columns[column].label || column,
                cell: getRawValueCell,
            }));
    }

    public getColumns(): ColumnDef<ResultRow, any>[] {
        return this.columns;
    }

    public getRows(): ResultRow[] {
        return this.transformer.getRows();
    }

    public getRowsCount(): number {
        return this.getRows().length;
    }

    public getColumnsCount(): number {
        return this.getColumns().length;
    }
}
