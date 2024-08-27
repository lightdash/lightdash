import {
    ResultsTableModel,
    type ResultRow,
    type SqlTableConfig,
} from '@lightdash/common';
import { type ColumnDef } from '@tanstack/react-table';
import { getRawValueCell } from '../../../hooks/useColumns';

export class TableDataTransformer {
    private tableModel: ResultsTableModel;

    private columns: ColumnDef<ResultRow, any>[];

    private config: SqlTableConfig | undefined;

    constructor(
        private data: ResultRow[],
        private tableChartSqlConfig: SqlTableConfig | undefined,
    ) {
        this.config = this.tableChartSqlConfig;
        this.tableModel = new ResultsTableModel({
            data: this.data,
        });
        this.columns = this.createColumns();
    }

    private createColumns(): ColumnDef<ResultRow, any>[] {
        const columns = this.tableModel.getColumns();
        return columns
            .filter((column) =>
                this.config ? this.config.columns[column]?.visible : true,
            )
            .map((column) => ({
                id: column,
                // react table has a bug with accessors that has dots in them
                // we found the fix here -> https://github.com/TanStack/table/issues/1671
                // do not remove the line below
                accessorFn: (data) => data[column],
                header: this.config?.columns[column].label || column,
                cell: getRawValueCell,
            }));
    }

    public getColumns(): ColumnDef<ResultRow, any>[] {
        return this.columns;
    }

    public getRows(): ResultRow[] {
        return this.tableModel.getRows();
    }

    public getRowsCount(): number {
        return this.getRows().length;
    }

    public getColumnsCount(): number {
        return this.getColumns().length;
    }
}
