import { type RawResultRow } from '../types/results';
import { ChartKind } from '../types/savedCharts';
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

    private readonly config: VizTableConfig;

    constructor(args: {
        resultsRunner: IResultsRunner;
        config?: VizTableConfig | undefined;
    }) {
        this.resultsRunner = args.resultsRunner;
        this.config = args.config ?? {
            type: ChartKind.TABLE,
            metadata: {
                version: 1,
            },
            columns: this.getResultOptions().defaultColumnConfig,
        };
    }

    private getColumns() {
        return this.resultsRunner.getColumns();
    }

    public getVisibleColumns() {
        return this.getColumns().filter((column) =>
            this.config ? this.config.columns[column]?.visible : true,
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
                    visible: this.config?.columns[key]?.visible ?? true,
                    reference: key,
                    label: this.config?.columns[key]?.label ?? key,
                    frozen: this.config?.columns[key]?.frozen ?? false,
                    order: this.config?.columns[key]?.order,
                },
            }),
            {},
        );

        return { defaultColumnConfig: columns };
    }

    public getConfig() {
        return this.config;
    }

    static getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    mergeConfig(chartKind: ChartKind.TABLE): VizTableConfig {
        return {
            type: chartKind,
            metadata: {
                version: 1,
            },
            columns: this.getResultOptions().defaultColumnConfig,
        };
    }

    async getPivotedChartData(): Promise<PivotChartData> {
        console.log('not implemented in table', this.config);
        return {
            columns: [],
            fileUrl: '',
            indexColumn: undefined,
            results: [],
            valuesColumns: [],
        };
    }

    getDataDownloadUrl(): string | undefined {
        console.log('not implemented in table', this.config);
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

    getSpec(display?: VizTableDisplay): {
        spec: Record<string, any>;
        tableData: { columns: string[]; rows: RawResultRow[] } | undefined;
    } {
        console.log('Not implemented in table', {
            display,
            config: this.config,
        });
        return {
            spec: {},
            tableData: undefined,
        };
    }
}
