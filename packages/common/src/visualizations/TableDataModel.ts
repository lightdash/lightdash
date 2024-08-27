import { type ResultRow } from '../types/results';
import {
    type SqlTableConfig,
    type TableChartSqlConfig,
} from '../types/sqlRunner';
import { type VizTableOptions } from './types';
import { type IChartDataModel } from './types/IChartDataModel';

export class TableDataModel implements IChartDataModel<VizTableOptions> {
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

    public getResultOptions() {
        const columns = this.getColumns().reduce<
            TableChartSqlConfig['columns']
        >(
            (acc, key) => ({
                ...acc,
                [key]: {
                    visible: true, // FIXME: should this be true all the time?
                    reference: key,
                    label: key,
                    frozen: true,
                    order: undefined,
                },
            }),
            {},
        );

        return { defaultColumnConfig: columns };
    }
}
