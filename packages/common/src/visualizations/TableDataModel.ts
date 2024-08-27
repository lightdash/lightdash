import { type ResultRow } from '../types/results';
import { type SqlTableConfig } from '../types/sqlRunner';

export class TableDataModel {
    private rows: ResultRow[];

    private config: SqlTableConfig | undefined;

    constructor(
        private data: ResultRow[],
        private tableChartSqlConfig: SqlTableConfig | undefined,
    ) {
        this.config = this.tableChartSqlConfig;
        this.rows = data;
    }

    private getColumns() {
        return Object.keys(this.data[0]);
    }

    public getVisibleColumns() {
        return this.getColumns().filter((column) =>
            this.config ? this.config.columns[column]?.visible : true,
        );
    }

    public getRows() {
        return this.rows;
    }

    public getRowsCount(): number {
        return this.getRows().length;
    }

    public getColumnsCount(): number {
        return this.getColumns().length;
    }
}
