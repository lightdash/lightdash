import { DimensionType, MetricType } from '../types/field';
import { ChartKind } from '../types/savedCharts';
import { type BarChartConfig } from '../types/sqlRunner';
import {
    type BarChartData,
    type ResultsTransformerBase,
    type RowData,
} from './ResultsTransformerBase';

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

export enum XLayoutType {
    TIME = 'time',
    CATEGORY = 'category',
}

export type XLayoutOptions = {
    type: XLayoutType;
    reference: string;
};

export type YLayoutOptions = {
    reference: string;
    aggregationOptions: AggregationOptions[];
};

type SeriesLayoutOptions = {
    reference: string;
};

export type BarChartDisplay = {
    xAxis?: {
        label?: string;
        type: XLayoutType;
    };
    yAxis?: {
        label?: string;
        position?: 'left' | 'right';
    }[];
    series?: Record<string, { label?: string; yAxisIndex?: number }>;
    legend?: {
        position: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
    };
};

export type SqlTransformBarChartConfig = {
    x: {
        reference: string;
    };
    y: {
        reference: string;
        aggregation: AggregationOptions;
    }[];
    groupBy:
        | {
              reference: string;
          }
        | undefined;
};
export type DuckDBSqlFunction = (
    sql: string,
    rowData: RowData[],
) => Promise<RowData[]>;

type GetPivotedResultsArgs = {
    rows: RowData[];
    valuesSql: string[];
    pivotsSql: string[];
    groupByColumns: string[];
    sortsSql: string[];
    duckDBSqlFunction: DuckDBSqlFunction;
};

export const getPivotedResults = async ({
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

    const pivoted = await duckDBSqlFunction(query, rows);

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
    implements ResultsTransformerBase<SqlTransformBarChartConfig>
{
    private readonly duckDBSqlFunction: DuckDBSqlFunction;

    private readonly rows: RowData[];

    private readonly columns: SqlColumn[];

    constructor(args: SqlRunnerResultsTransformerDeps) {
        this.duckDBSqlFunction = args.duckDBSqlFunction;

        this.rows = args.rows;
        this.columns = args.columns;
    }

    barChartSeriesLayoutOptions(): SeriesLayoutOptions[] {
        const options: SeriesLayoutOptions[] = [];
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

    barChartXLayoutOptions(): XLayoutOptions[] {
        const options: XLayoutOptions[] = [];
        for (const column of this.columns) {
            switch (column.type) {
                case DimensionType.DATE:
                    options.push({
                        reference: column.reference,
                        type: XLayoutType.TIME,
                    });
                    break;
                case DimensionType.TIMESTAMP:
                    options.push({
                        reference: column.reference,
                        type: XLayoutType.TIME,
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.NUMBER:
                case DimensionType.BOOLEAN:
                    options.push({
                        reference: column.reference,
                        type: XLayoutType.CATEGORY,
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    barChartYLayoutOptions(): YLayoutOptions[] {
        const options: YLayoutOptions[] = [];
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

    private defaultLayout(): SqlTransformBarChartConfig | undefined {
        const firstColumnNonNumeric = this.columns.find(
            (column) => column.type !== DimensionType.NUMBER,
        );
        if (!firstColumnNonNumeric) return undefined;

        const firstColumnNumeric = this.columns.find(
            (column) => column.type === DimensionType.NUMBER,
        );

        return {
            x: {
                reference: firstColumnNonNumeric.reference,
            },
            y: firstColumnNumeric
                ? [
                      {
                          reference: firstColumnNumeric.reference,
                          aggregation: aggregationOptions[0],
                      },
                  ]
                : [],
            groupBy: undefined,
        };
    }

    defaultConfig(): BarChartConfig {
        return {
            metadata: {
                version: 1,
            },
            type: ChartKind.VERTICAL_BAR,
            fieldConfig: this.defaultLayout(),
            display: undefined,
        };
    }

    public async transformBarChartData(
        config: SqlTransformBarChartConfig,
    ): Promise<BarChartData> {
        const groupByColumns = [config.x.reference];
        const pivotsSql = config.groupBy?.reference
            ? [config.groupBy.reference]
            : [];
        const valuesSql = config.y.map(
            (y) => `${y.aggregation}(${y.reference})`,
        );
        const sortsSql = [`${config.x.reference} ASC`];

        const pivotResults = await getPivotedResults({
            rows: this.rows, // data
            groupByColumns, // bar x location
            valuesSql, // bar height
            pivotsSql, // bar grouping
            sortsSql,
            duckDBSqlFunction: this.duckDBSqlFunction,
        });

        return {
            results: pivotResults.results,
            xAxisColumn: groupByColumns[0],
            seriesColumns: pivotResults.valueColumns || [],
        };
    }
}
