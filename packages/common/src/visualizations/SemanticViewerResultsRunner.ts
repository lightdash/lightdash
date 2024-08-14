import { intersectionBy } from 'lodash';
import { DimensionType, MetricType } from '../types/field';
import { ChartKind } from '../types/savedCharts';
import type {
    CartesianChartSqlConfig,
    PieChartSqlConfig,
} from '../types/sqlRunner';
import {
    type PieChartData,
    type PivotChartData,
    type ResultsRunnerBase,
    type RowData,
} from './ResultsRunnerBase';

export const aggregationOptions = [
    // TODO: Change these to strings
    MetricType.SUM,
    MetricType.COUNT,
    MetricType.MIN,
    MetricType.MAX,
    'first',
];

export const DEFAULT_AGGREGATION = MetricType.COUNT;

export type AggregationOptions = typeof aggregationOptions[number];

export type SqlColumn = {
    reference: string;
    type: DimensionType;
};

export enum IndexType {
    TIME = 'time',
    CATEGORY = 'category',
}

export type IndexLayoutOptions = {
    type: IndexType;
    reference: string;
};

export type ValuesLayoutOptions = {
    reference: string;
    aggregationOptions: AggregationOptions[];
};

export type PivotLayoutOptions = {
    reference: string;
};

export type SqlCartesianChartLayout = {
    index: {
        reference: string;
        type: IndexType;
    };
    values: {
        reference: string;
        aggregation: AggregationOptions;
    }[];
    pivots: { reference: string }[] | undefined;
};

export type PieChartDimensionOptions = IndexLayoutOptions;

export type PieChartMetricOptions = {
    reference: string;
    aggregationOptions: AggregationOptions[];
};

export type PieChartDisplay = {
    isDonut?: boolean;
};

export type SqlPieChartConfig = {
    groupFieldIds?: string[];
    metricId?: string;
};

export type DuckDBSqlFunction = (
    sql: string,
    rowData: RowData[],
    columns: SqlColumn[],
) => Promise<RowData[]>;

type GetPivotedResultsArgs = {
    columns: SqlColumn[];
    rows: RowData[];
    valuesSql: string[];
    pivotsSql: string[];
    groupByColumns: string[];
    sortsSql: string[];
    duckDBSqlFunction: DuckDBSqlFunction;
};

export const getPivotedResults = async ({
    columns,
    rows,
    valuesSql,
    pivotsSql,
    groupByColumns,
    sortsSql,
    duckDBSqlFunction,
}: GetPivotedResultsArgs) => {
    const pivotOnSql = pivotsSql.join(', ');
    const pivotValuesSql = valuesSql.join(', ');

    let query = 'PIVOT results_data';
    if (pivotsSql.length > 0) {
        query += ` ON ${pivotOnSql}`;
    }
    if (valuesSql.length > 0) {
        query += ` USING ${pivotValuesSql}`;
    } else {
        return {
            results: [],
            columns: [],
        };
    }
    if (groupByColumns.length > 0) {
        query += ` GROUP BY ${groupByColumns.join(', ')}`;
    }
    if (sortsSql.length > 0) {
        query += ` ORDER BY ${sortsSql.join(', ')}`;
    }

    const pivoted = await duckDBSqlFunction(query, rows, columns);

    const fieldNames = Object.keys(pivoted[0]);

    return {
        results: pivoted,
        indexColumns: groupByColumns,
        valueColumns: fieldNames.filter(
            (field) => !groupByColumns.includes(field),
        ),
    };
};

type SqlRunnerResultsTransformerDeps = {
    duckDBSqlFunction: DuckDBSqlFunction;
    rows: RowData[];
    columns: SqlColumn[];
};

export class SqlRunnerResultsTransformer
    implements ResultsRunnerBase<SqlCartesianChartLayout, SqlPieChartConfig>
{
    private readonly duckDBSqlFunction: DuckDBSqlFunction;

    private readonly rows: RowData[];

    private readonly columns: SqlColumn[];

    constructor(args: SqlRunnerResultsTransformerDeps) {
        this.duckDBSqlFunction = args.duckDBSqlFunction;

        this.rows = args.rows;
        this.columns = args.columns;
    }

    cartesianChartGroupByLayoutOptions(): PivotLayoutOptions[] {
        const options: PivotLayoutOptions[] = [];
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
    cartesianChartXLayoutOptions(): IndexLayoutOptions[] {
        const options: IndexLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.DATE:
                    options.push({
                        reference: column.reference,
                        type: IndexType.TIME,
                    });
                    break;
                case DimensionType.TIMESTAMP:
                    options.push({
                        reference: column.reference,
                        type: IndexType.TIME,
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.NUMBER:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                        type: IndexType.CATEGORY,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    cartesianChartYLayoutOptions(): ValuesLayoutOptions[] {
        const options: ValuesLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.NUMBER:
                    options.push({
                        reference: column.reference,
                        aggregationOptions,
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                        aggregationOptions: aggregationOptions.filter(
                            (option) =>
                                option === MetricType.COUNT ||
                                option === MetricType.COUNT_DISTINCT,
                        ),
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    getCartesianLayoutOptions(): {
        xLayoutOptions: IndexLayoutOptions[];
        yLayoutOptions: ValuesLayoutOptions[];
        groupByOptions: PivotLayoutOptions[];
    } {
        return {
            xLayoutOptions: this.cartesianChartXLayoutOptions(),
            yLayoutOptions: this.cartesianChartYLayoutOptions(),
            groupByOptions: this.cartesianChartGroupByLayoutOptions(),
        };
    }

    defaultPivotChartLayout(): SqlCartesianChartLayout | undefined {
        const firstCategoricalColumn = this.columns.find(
            (column) => column.type === DimensionType.STRING,
        );
        const firstBooleanColumn = this.columns.find(
            (column) => column.type === DimensionType.BOOLEAN,
        );
        const firstDateColumn = this.columns.find((column) =>
            [DimensionType.DATE, DimensionType.TIMESTAMP].includes(column.type),
        );
        const firstNumericColumn = this.columns.find(
            (column) => column.type === DimensionType.NUMBER,
        );

        const xColumn =
            firstCategoricalColumn ||
            firstBooleanColumn ||
            firstDateColumn ||
            firstNumericColumn;
        if (xColumn === undefined) {
            return undefined;
        }
        const x: SqlCartesianChartLayout['index'] = {
            reference: xColumn.reference,
            type: [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                xColumn.type,
            )
                ? IndexType.TIME
                : IndexType.CATEGORY,
        };

        const yColumn =
            firstNumericColumn || firstBooleanColumn || firstCategoricalColumn;
        if (yColumn === undefined) {
            return undefined;
        }
        const y = [
            {
                reference: yColumn.reference,
                aggregation:
                    yColumn.type === DimensionType.NUMBER
                        ? MetricType.SUM
                        : MetricType.COUNT,
            },
        ];

        return {
            index: x,
            values: y,
            pivots: undefined,
        };
    }

    // args should be rows, columns, values
    // return type should be rows, columns, values too.
    public async getPivotChartData(
        config: SqlCartesianChartLayout,
    ): Promise<PivotChartData> {
        const groupByColumns = [config.index.reference];
        const pivotsSql =
            config.pivots === undefined
                ? []
                : config.pivots.map((groupBy) => groupBy.reference);
        const valuesSql = config.values.map(
            (y) => `${y.aggregation}(${y.reference})`,
        );
        const sortsSql = [`${config.index.reference} ASC`];

        const pivotResults = await getPivotedResults({
            columns: this.columns,
            rows: this.rows, // data
            groupByColumns, // x location
            valuesSql, // height
            pivotsSql, // grouping
            sortsSql,
            duckDBSqlFunction: this.duckDBSqlFunction,
        });

        return {
            results: pivotResults.results,
            indexColumn: {
                reference: groupByColumns[0],
                type: config.index.type,
            },
            valuesColumns: pivotResults.valueColumns || [],
        };
    }

    pieChartGroupFieldOptions(): PieChartDimensionOptions[] {
        // TODO: Either make these option getters more generic or
        // do something specific for pie charts
        return this.cartesianChartXLayoutOptions();
    }

    pieChartMetricFieldOptions(): PieChartMetricOptions[] {
        // TODO: Either make these option getters more generic or
        // do something specific for pie charts
        return this.cartesianChartYLayoutOptions();
    }

    defaultPieChartLayout(): SqlPieChartConfig | undefined {
        const firstCategoricalColumn = this.columns.find(
            (column) => column.type === DimensionType.STRING,
        );

        const firstNumericColumn = this.columns.find(
            (column) => column.type === DimensionType.NUMBER,
        );

        const groupFieldIds = firstCategoricalColumn?.reference
            ? [firstCategoricalColumn.reference]
            : undefined;

        const metricId = firstNumericColumn?.reference || undefined;

        if (
            !groupFieldIds ||
            groupFieldIds.length === 0 ||
            metricId === undefined
        ) {
            return undefined;
        }

        return {
            groupFieldIds,
            metricId,
        };
    }

    public async getPieChartData(): // config: SqlTransformPieChartConfig,
    Promise<PieChartData> {
        // TODO: NYI
        return {
            results: this.rows,
        };
    }

    // TODO: merge with function below
    getPieChartConfig({
        currentConfig,
    }: {
        currentConfig?: PieChartSqlConfig;
    }) {
        const newDefaultConfig = this.defaultPieChartLayout();

        let newConfig = currentConfig;

        if (!currentConfig) {
            newConfig = {
                metadata: {
                    version: 1,
                },
                type: ChartKind.PIE,
                fieldConfig: newDefaultConfig,
                display: {
                    isDonut: false,
                },
            };
        } else {
            newConfig = {
                ...currentConfig,
                fieldConfig: newDefaultConfig,
            };
        }

        return {
            newConfig,
        };
    }

    // TODO: rename
    getChartConfig({
        chartType,
        currentConfig,
    }: {
        chartType: ChartKind.VERTICAL_BAR | ChartKind.LINE;
        currentConfig?: CartesianChartSqlConfig;
    }) {
        const newDefaultLayout = this.defaultPivotChartLayout();

        const someFieldsMatch =
            currentConfig?.fieldConfig?.index.reference ===
                newDefaultLayout?.index.reference ||
            intersectionBy(
                currentConfig?.fieldConfig?.values || [],
                newDefaultLayout?.values || [],
                'reference',
            ).length > 0;

        let newConfig = currentConfig;

        if (!currentConfig) {
            newConfig = {
                metadata: {
                    version: 1,
                },
                type: chartType,
                fieldConfig: newDefaultLayout,
                display: undefined,
            };
        } else if (currentConfig && !someFieldsMatch) {
            newConfig = {
                ...currentConfig,
                fieldConfig: newDefaultLayout,
            };
        }

        return {
            newConfig,
            newDefaultLayout,
        };
    }
}
