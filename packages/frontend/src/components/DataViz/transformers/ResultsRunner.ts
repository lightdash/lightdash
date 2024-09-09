import {
    DimensionType,
    VizAggregationOptions,
    vizAggregationOptions,
    VizIndexType,
    type IResultsRunner,
    type PivotChartData,
    type RawResultRow,
    type SemanticLayerColumn,
    type VizChartLayout,
    type VizIndexLayoutOptions,
    type VizPivotLayoutOptions,
    type VizSqlColumn,
    type VizTableConfig,
    type VizValuesLayoutOptions,
} from '@lightdash/common';
import { intersectionBy } from 'lodash';

export class ResultsRunner implements IResultsRunner<VizChartLayout> {
    protected readonly rows: RawResultRow[];

    // TODO: this union type is necessary unless we move to making the interface
    // generic, but at the moment this class implements a lot of the interface, so it
    // hard to do. Most of the SQL runner-specific logic here should go in the
    // SQLRunnerRunner, then we can make this generic.
    protected readonly columns: VizSqlColumn[] | SemanticLayerColumn[];

    constructor(args: { rows: RawResultRow[]; columns: VizSqlColumn[] }) {
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
        }, [] as VizValuesLayoutOptions[]);
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

    getResultsColumns(
        fieldConfig: VizChartLayout,
    ): Pick<VizTableConfig, 'columns'> | undefined {
        if (!fieldConfig?.x) {
            return undefined;
        }

        const columnX = {
            [fieldConfig.x.reference]: {
                visible: true,
                reference: fieldConfig.x.reference,
                label: fieldConfig.x.reference,
                frozen: true,
            },
        };
        const columnYs = fieldConfig.y.reduce<
            Record<string, VizTableConfig['columns'][string]>
        >(
            (acc, y) => ({
                ...acc,
                [`${y.reference}_${y.aggregation}`]: {
                    visible: true,
                    reference: `${y.reference}_${y.aggregation}`,
                    label: y.reference,
                    frozen: true,
                    aggregation: y.aggregation,
                },
            }),
            {},
        );
        const columns: VizTableConfig['columns'] = {
            ...columnX,
            ...columnYs,
        };
        return { columns };
    }

    getAxisType(column: VizSqlColumn): VizIndexType {
        if (
            column.type &&
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(column.type)
        ) {
            return VizIndexType.TIME;
        }
        return VizIndexType.CATEGORY;
    }

    defaultPivotChartLayout(): VizChartLayout | undefined {
        const categoricalColumns = this.columns.filter(
            (column) => column.type === DimensionType.STRING,
        );
        const booleanColumns = this.columns.filter(
            (column) => column.type === DimensionType.BOOLEAN,
        );
        const dateColumns = this.columns.filter(
            (column) =>
                column.type &&
                [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                    column.type,
                ),
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
        const x: VizChartLayout['x'] = {
            reference: xColumn.reference,
            type: this.getAxisType(xColumn),
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
        const y: VizChartLayout['y'] = [
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

    mergePivotChartLayout(currentConfig?: VizChartLayout) {
        const newDefaultLayout = this.defaultPivotChartLayout();

        const someFieldsMatch =
            currentConfig?.x?.reference === newDefaultLayout?.x?.reference ||
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

    getPivotedVisualizationData(
        _config: VizChartLayout,
        _sql?: string,
        _projectUuid?: string,
        _limit?: number,
    ): Promise<PivotChartData> {
        throw new Error('Method not implemented.');
    }

    getColumns(): string[] {
        return this.columns.map((column) => column.reference);
    }

    getColumnsAccessorFn(column: string) {
        return (row: RawResultRow) => row[column];
    }

    getRows() {
        return this.rows;
    }
}
