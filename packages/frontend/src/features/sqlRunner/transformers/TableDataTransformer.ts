import { SqlRunnerResultsTransformer, type ResultRow } from '@lightdash/common';
import { type ColumnDef, type Table } from '@tanstack/react-table';
import { type Virtualizer } from '@tanstack/react-virtual';
import { ROW_HEIGHT_PX } from '../../../components/common/Table/Table.styles';
import { getRawValueCell } from '../../../hooks/useColumns';
import { type useSqlQueryRun } from '../hooks/useSqlQueryRun';

// TODO: This should be moved to the common package
export type TableChartSqlConfig =
    | {
          columns: Record<
              string,
              {
                  visible: boolean;
                  reference: string;
                  label: string;
                  frozen: boolean;
                  order?: number;
              }
          >;
      }
    | undefined;

export class TableDataTransformer {
    private transformer: SqlRunnerResultsTransformer;

    private columns: ColumnDef<ResultRow, any>[];

    private rows: ResultRow[];

    constructor(
        data: NonNullable<ReturnType<typeof useSqlQueryRun>['data']>,
        private config: TableChartSqlConfig,
    ) {
        this.transformer = new SqlRunnerResultsTransformer({ data });
        this.columns = this.createColumns();
        this.rows = this.transformer.getRows();
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
        return this.rows;
    }

    public getRowHeight(): number {
        return ROW_HEIGHT_PX;
    }

    public getRowsCount(): number {
        return this.rows.length;
    }

    public getColumnsCount(): number {
        return this.columns.length;
    }

    public getTableData(
        table: Table<ResultRow>,
        virtualizer: Virtualizer<HTMLDivElement, Element>,
    ) {
        const { rows: rowModelRows } = table.getRowModel();
        const virtualRows = virtualizer.getVirtualItems();

        return {
            headerGroups: table.getHeaderGroups(),
            virtualRows,
            rowModelRows,
        };
    }
}
