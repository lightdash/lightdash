import {
    DimensionType,
    VizAggregationOptions,
    vizAggregationOptions,
    VizIndexType,
    type IResultsRunner,
    type PivotChartData,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizSqlCartesianChartLayout,
    type VizSqlColumn,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { intersectionBy } from 'lodash';

// const isResultRows = (rows: (RowData | ResultRow)[]): rows is ResultRow[] => {
//     if (rows.length === 0) return false;

//     const firstRow = rows[0];
//     if (typeof firstRow !== 'object' || firstRow === null) return false;

//     const firstValue = Object.values(firstRow)[0];
//     if (typeof firstValue !== 'object' || firstValue === null) return false;

//     return 'value' in firstValue;
// };

// const convertToRowData = (data: ResultRow[]): RowData[] => {
//     return data.map((row) => {
//         return Object.fromEntries(
//             Object.entries(row).map(([key, value]) => {
//                 return [key, value.value.raw];
//             }),
//         );
//     });
// };

export class ResultsRunner<TRow>
    implements IResultsRunner<VizSqlCartesianChartLayout, TRow>
{
    protected readonly rows: TRow[];

    protected readonly columns: VizSqlColumn[];

    constructor(args: { rows: TRow[]; columns: VizSqlColumn[] }) {
        this.rows = args.rows;
        this.columns = args.columns;
    }

    pivotChartLayoutOptions(): VizPivotLayoutOptions[] {
        const options: VizPivotLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.STRING:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    // should the conversion from DimensionType to XLayoutType actually be done in an echarts specific function?
    // The output 'category' | 'time' is echarts specific. or is this more general?
    pivotChartIndexLayoutOptions(): VizIndexLayoutOptions[] {
        const options: VizIndexLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.DATE:
                    options.push({
                        reference: column.reference,
                        type: VizIndexType.TIME,
                    });
                    break;
                case DimensionType.TIMESTAMP:
                    options.push({
                        reference: column.reference,
                        type: VizIndexType.TIME,
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.NUMBER:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                        type: VizIndexType.CATEGORY,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    pivotChartValuesLayoutOptions(): VizValuesLayoutOptions[] {
        return this.columns.reduce<VizValuesLayoutOptions[]>((acc, column) => {
            switch (column.type) {
                case DimensionType.NUMBER:
                    return [
                        ...acc,
                        {
                            reference: column.reference,
                            aggregationOptions: vizAggregationOptions,
                        },
                    ];

                case DimensionType.STRING:
                case DimensionType.BOOLEAN:
                    return [
                        ...acc,
                        {
                            reference: column.reference,
                            aggregationOptions: vizAggregationOptions.filter(
                                (option) =>
                                    option === VizAggregationOptions.COUNT,
                            ),
                        },
                    ];

                default:
                    return acc;
            }
        }, []);
    }

    pivotChartOptions(): {
        indexLayoutOptions: VizIndexLayoutOptions[];
        valuesLayoutOptions: VizValuesLayoutOptions[];
        pivotLayoutOptions: VizPivotLayoutOptions[];
    } {
        return {
            indexLayoutOptions: this.pivotChartIndexLayoutOptions(),
            valuesLayoutOptions: this.pivotChartValuesLayoutOptions(),
            pivotLayoutOptions: this.pivotChartLayoutOptions(),
        };
    }

    defaultPivotChartLayout(): VizSqlCartesianChartLayout | undefined {
        const categoricalColumns = this.columns.filter(
            (column) => column.type === DimensionType.STRING,
        );
        const booleanColumns = this.columns.filter(
            (column) => column.type === DimensionType.BOOLEAN,
        );
        const dateColumns = this.columns.filter((column) =>
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(column.type),
        );
        const numericColumns = this.columns.filter(
            (column) => column.type === DimensionType.NUMBER,
        );

        const xColumn =
            categoricalColumns[0] ||
            booleanColumns[0] ||
            dateColumns[0] ||
            numericColumns[0];
        if (xColumn === undefined) {
            return undefined;
        }
        const x: VizSqlCartesianChartLayout['x'] = {
            reference: xColumn.reference,
            type: [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                xColumn.type,
            )
                ? VizIndexType.TIME
                : VizIndexType.CATEGORY,
        };

        const yColumn =
            numericColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            booleanColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            categoricalColumns.filter(
                (column) => column.reference !== x.reference,
            )[0] ||
            numericColumns[0] ||
            booleanColumns[0] ||
            categoricalColumns[0];

        if (yColumn === undefined) {
            return undefined;
        }
        const y: VizSqlCartesianChartLayout['y'] = [
            {
                reference: yColumn.reference,
                aggregation:
                    yColumn.type === DimensionType.NUMBER
                        ? VizAggregationOptions.SUM
                        : VizAggregationOptions.COUNT,
            },
        ];

        return {
            x,
            y,
            groupBy: undefined,
        };
    }

    mergePivotChartLayout(currentConfig?: VizSqlCartesianChartLayout) {
        const newDefaultLayout = this.defaultPivotChartLayout();

        const someFieldsMatch =
            currentConfig?.x.reference === newDefaultLayout?.x.reference ||
            intersectionBy(
                currentConfig?.y || [],
                newDefaultLayout?.y || [],
                'reference',
            ).length > 0;

        let mergedLayout = currentConfig;

        if (!currentConfig || !someFieldsMatch) {
            mergedLayout = newDefaultLayout;
        }

        return mergedLayout;
    }

    getPivotChartData(
        _config: VizSqlCartesianChartLayout,
        _sql?: string,
        _projectUuid?: string,
        _limit?: number,
    ): Promise<PivotChartData> {
        throw new Error('Method not implemented.');
    }

    getColumns(): string[] {
        return this.columns.map((column) => column.reference);
    }

    getRows() {
        return this.rows;
    }
}
