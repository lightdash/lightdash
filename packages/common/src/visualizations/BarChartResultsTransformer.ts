import { DimensionType, friendlyName, MetricType } from '../types/field';
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

type BarChartResultsTransformerDeps = {
    duckDBSqlFunction: DuckDBSqlFunction;
    rows: RowData[];
    columns: SqlColumn[];
};

export class BarChartResultsTransformer
    implements ResultsTransformerBase<SqlTransformBarChartConfig>
{
    private readonly duckDBSqlFunction: DuckDBSqlFunction;

    private readonly rows: RowData[];

    private readonly columns: SqlColumn[];

    constructor(args: BarChartResultsTransformerDeps) {
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

    public async getEchartsSpec(
        fieldConfig: SqlTransformBarChartConfig | undefined,
        // TODO: display should always be defined and defaults should be applied in the transformer
        display: BarChartDisplay | undefined,
    ) {
        const transformedData = fieldConfig
            ? await this.transformBarChartData(fieldConfig)
            : undefined;

        const DEFAULT_X_AXIS_TYPE = 'category';

        return {
            tooltip: {},
            legend: {
                show: true,
                type: 'scroll',
            },
            xAxis: {
                // TODO: display should always be defined and defaults should be applied in the transformer
                type: display?.xAxis?.type ?? DEFAULT_X_AXIS_TYPE,
                name:
                    // TODO: display should always be defined and defaults should be applied in the transformer
                    display?.xAxis?.label ||
                    friendlyName(transformedData?.xAxisColumn || 'xAxisColumn'),
                nameLocation: 'center',
                nameGap: 30,
                nameTextStyle: {
                    fontWeight: 'bold',
                },
            },
            yAxis: [
                {
                    // TODO: display should always be defined and defaults should be applied in the transformer
                    type: 'value',
                    name:
                        // TODO: display should always be defined and defaults should be applied in the transformer
                        (display?.yAxis && display.yAxis[0].label) ||
                        friendlyName(
                            transformedData?.seriesColumns.length === 1
                                ? transformedData.seriesColumns[0]
                                : '',
                        ),
                    nameLocation: 'center',
                    nameGap: 50,
                    nameRotate: 90,
                    nameTextStyle: {
                        fontWeight: 'bold',
                    },
                },
            ],
            dataset: {
                id: 'dataset',
                source: transformedData?.results,
            },
            series: transformedData?.seriesColumns.map((seriesColumn) => ({
                dimensions: [transformedData.xAxisColumn, seriesColumn],
                type: 'bar',
                name:
                    (display?.series && display.series[seriesColumn]?.label) ||
                    friendlyName(seriesColumn),
                encode: {
                    x: transformedData.xAxisColumn,
                    y: seriesColumn,
                },
                yAxisIndex:
                    (display?.series &&
                        display.series[seriesColumn]?.yAxisIndex) ||
                    0,
            })),
        };
    }
}
