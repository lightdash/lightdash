import {
    SqlRunnerResultsTransformer,
    type ResultRow,
    type TableChartSqlConfig,
} from '@lightdash/common';
import { type ColumnDef } from '@tanstack/react-table';
import { getRawValueCell } from '../../../hooks/useColumns';
import { type useSqlQueryRun } from '../hooks/useSqlQueryRun';

// TODO: Move to the common package
export class TableDataTransformer {
    private transformer: SqlRunnerResultsTransformer;

    private columns: ColumnDef<ResultRow, any>[];

    private config: TableChartSqlConfig | undefined;

    constructor(
        private data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>,
        private tableChartSqlConfig: TableChartSqlConfig | undefined,
    ) {
        this.config = this.tableChartSqlConfig;
        this.transformer = new SqlRunnerResultsTransformer({ data: this.data });
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
