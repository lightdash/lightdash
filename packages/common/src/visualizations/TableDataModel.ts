import { type RawResultRow } from '../types/results';
import { type ChartKind } from '../types/savedCharts';
import {
    type SemanticLayerQuery,
    type SemanticLayerSortBy,
} from '../types/semanticLayer';
import {
    type PivotChartData,
    type VizTableConfig,
    type VizTableDisplay,
    type VizTableHeaderSortConfig,
} from './types';
import type { IResultsRunner } from './types/IResultsRunner';

export class TableDataModel {
    private readonly resultsRunner: IResultsRunner;

    private readonly columnsConfig: VizTableConfig['columns'];

    constructor(args: {
        resultsRunner: IResultsRunner;
        columnsConfig?: VizTableConfig['columns'] | undefined;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.columnsConfig =
            args.columnsConfig ?? this.getResultOptions().defaultColumnConfig;
    }

    private getColumns() {
        return this.resultsRunner.getColumnNames();
    }

    public getVisibleColumns() {
        return this.getColumns().filter((column) =>
            this.columnsConfig ? this.columnsConfig[column]?.visible : true,
        );
    }

    public getRows() {
        return this.resultsRunner.getRows();
    }

    public getRowsCount(): number {
        return this.getRows().length;
    }

    public getColumnsCount(): number {
        return this.getColumns().length;
    }

    static getTableHeaderSortConfig(
        columnNames: string[],
        query: SemanticLayerQuery,
    ): VizTableHeaderSortConfig {
        return columnNames.reduce<VizTableHeaderSortConfig>((acc, col) => {
            const sortBy = query.sortBy.find(
                (sort: SemanticLayerSortBy) => sort.name === col,
            );

            return {
                ...acc,
                [col]: {
                    direction: sortBy?.direction,
                },
            };
        }, {});
    }

    public getResultOptions() {
        const columns = this.getColumns().reduce<VizTableConfig['columns']>(
            (acc, key) => ({
                ...acc,
                [key]: {
                    visible: this.columnsConfig?.[key]?.visible ?? true,
                    reference: key,
                    label: this.columnsConfig?.[key]?.label ?? key,
                    frozen: this.columnsConfig?.[key]?.frozen ?? false,
                    order: this.columnsConfig?.[key]?.order,
                },
            }),
            {},
        );

        return { defaultColumnConfig: columns };
    }

    public getConfig() {
        return this.columnsConfig;
    }

    static getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    mergeConfig(chartKind: ChartKind.TABLE): VizTableConfig {
        return {
            type: chartKind,
            display: {},
            metadata: {
                version: 1,
            },
            columns: this.getResultOptions().defaultColumnConfig,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    async getPivotedChartData(): Promise<PivotChartData> {
        // Not implemented in table yet
        return {
            columns: [],
            fileUrl: '',
            indexColumn: undefined,
            results: [],
            valuesColumns: [],
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getDataDownloadUrl(): string | undefined {
        // Not implemented in table yet
        return '';
    }

    getPivotedTableData():
        | {
              columns: string[];
              rows: RawResultRow[];
          }
        | undefined {
        return {
            columns: this.getColumns(),
            rows: this.getRows(),
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getSpec(_display?: VizTableDisplay): {
        spec: Record<string, any>;
        tableData: { columns: string[]; rows: RawResultRow[] } | undefined;
    } {
        return {
            spec: {
                columns: this.columnsConfig,
                visibleColumns: this.getVisibleColumns(),
            },
            tableData: undefined,
        };
    }
}
