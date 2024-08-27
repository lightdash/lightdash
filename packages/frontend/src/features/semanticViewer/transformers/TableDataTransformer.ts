import {
    SqlRunnerResultsTableTransformer,
    type RawResultRow,
    type SqlTableConfig,
} from '@lightdash/common';
import { type ColumnDef } from '@tanstack/react-table';
import { getValueCell } from '../../../hooks/useColumns';

export class TableDataTransformer {
    private transformer: SqlRunnerResultsTableTransformer;

    private columns: ColumnDef<RawResultRow, any>[];

    private config: SqlTableConfig | undefined;

    constructor(
        private data: RawResultRow[],
        private tableChartSqlConfig: SqlTableConfig | undefined,
    ) {
        this.config = this.tableChartSqlConfig;
        this.transformer = new SqlRunnerResultsTableTransformer({
            data: this.data,
        });
        this.columns = this.createColumns();
    }

    private createColumns(): ColumnDef<RawResultRow, any>[] {
        const columns = this.transformer.getColumns();
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
                cell: getValueCell,
            }));
    }

    public getColumns(): ColumnDef<RawResultRow, any>[] {
        return this.columns;
    }

    public getRows(): RawResultRow[] {
        return this.transformer.getRows();
    }

    public getRowsCount(): number {
        return this.getRows().length;
    }

    public getColumnsCount(): number {
        return this.getColumns().length;
    }
}
