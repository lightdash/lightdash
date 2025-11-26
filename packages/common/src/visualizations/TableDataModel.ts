import { type AnyType } from '../types/any';
import { type RawResultRow } from '../types/results';
import { type ChartKind } from '../types/savedCharts';
import { type SqlRunnerQuery, type SqlRunnerSortBy } from '../types/sqlRunner';

import {
    type PivotChartData,
    type VizTableConfig,
    type VizTableDisplay,
    type VizTableHeaderSortConfig,
} from './types';
import type { IResultsRunner } from './types/IResultsRunner';

export type RowSpanInfo = {
    rowspan: number;
    skip: boolean;
};

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
        query: SqlRunnerQuery,
    ): VizTableHeaderSortConfig {
        return columnNames.reduce<VizTableHeaderSortConfig>((acc, col) => {
            const sortBy = query.sortBy.find(
                (sort: SqlRunnerSortBy) => sort.name === col,
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
            queryUuid: undefined,
            columns: [],
            fileUrl: '',
            indexColumn: undefined,
            results: [],
            valuesColumns: [],
            columnCount: undefined,
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
        spec: Record<string, AnyType>;
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

    /**
     * Calculates rowspan information for visual cell merging
     * Returns a map of cell keys to rowspan info
     */
    public getRowSpanMap(display?: VizTableDisplay): Map<string, RowSpanInfo> {
        const rowSpanMap = new Map<string, RowSpanInfo>();

        // Return empty map if feature is disabled or no columns configured
        if (!display?.mergeConsecutiveDuplicates || !display?.mergeColumns) {
            return rowSpanMap;
        }

        const rows = this.getRows();
        const columnsToMerge = display.mergeColumns;

        // For each column that should be merged
        columnsToMerge.forEach((columnId) => {
            let spanStart = 0;
            let spanCount = 1;
            let currentValue = rows[0]?.[columnId];

            // Iterate through rows to detect consecutive duplicates
            for (let i = 1; i <= rows.length; i++) {
                const nextValue = i < rows.length ? rows[i][columnId] : null;
                const valuesMatch =
                    i < rows.length &&
                    currentValue === nextValue &&
                    currentValue !== null &&
                    currentValue !== undefined;

                if (valuesMatch) {
                    // Continue the span
                    spanCount++;
                } else {
                    // End the span
                    if (spanCount > 1) {
                        // Set rowspan for the first cell in the group
                        const spanKey = `${columnId}-${spanStart}`;
                        rowSpanMap.set(spanKey, {
                            rowspan: spanCount,
                            skip: false,
                        });

                        // Mark subsequent cells as skip
                        for (let j = spanStart + 1; j < spanStart + spanCount; j++) {
                            const skipKey = `${columnId}-${j}`;
                            rowSpanMap.set(skipKey, {
                                rowspan: 0,
                                skip: true,
                            });
                        }
                    }

                    // Start a new span
                    spanStart = i;
                    spanCount = 1;
                    currentValue = nextValue;
                }
            }
        });

        return rowSpanMap;
    }
}
