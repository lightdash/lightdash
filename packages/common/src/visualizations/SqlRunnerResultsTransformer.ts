import { DimensionType, MetricType } from '../types/field';
import {
    type BarChartData,
    type PieChartData,
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

export type GroupByLayoutOptions = {
    reference: string;
};

export type BarChartDisplay = {
    xAxis?: {
        label?: string;
        type: XLayoutType;
    };
    yAxis?: {
        label?: string;
        position?: string;
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
        type: XLayoutType;
    };
    y: {
        reference: string;
        aggregation: AggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
};

// TODO: Should pie chart share the X and Y layout options? They could be
// called something else
export type PieChartDimensionOptions = {
    type: XLayoutType;
    reference: string;
};

export type PieChartMetricOptions = {
    reference: string;
    aggregationOptions: AggregationOptions[];
};

export type PieChartDisplay = {
    isDonut?: boolean;
};

export type SqlTransformPieChartConfig = {
    groupFieldIds?: string[];
    metricId?: string;
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
    implements
        ResultsTransformerBase<
            SqlTransformBarChartConfig,
            SqlTransformPieChartConfig
        >
{
    private readonly duckDBSqlFunction: DuckDBSqlFunction;

    private readonly rows: RowData[];

    private readonly columns: SqlColumn[];

    constructor(args: SqlRunnerResultsTransformerDeps) {
        this.duckDBSqlFunction = args.duckDBSqlFunction;

        this.rows = args.rows;
        this.columns = args.columns;
    }

    barChartGroupByLayoutOptions(): GroupByLayoutOptions[] {
        const options: GroupByLayoutOptions[] = [];
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

    defaultBarChartLayout(): SqlTransformBarChartConfig | undefined {
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
        const x: SqlTransformBarChartConfig['x'] = {
            reference: xColumn.reference,
            type: [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                xColumn.type,
            )
                ? XLayoutType.TIME
                : XLayoutType.CATEGORY,
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
            x,
            y,
            groupBy: undefined,
        };
    }

    public async transformBarChartData(
        config: SqlTransformBarChartConfig,
    ): Promise<BarChartData> {
        const groupByColumns = [config.x.reference];
        const pivotsSql =
            config.groupBy === undefined
                ? []
                : config.groupBy.map((groupBy) => groupBy.reference);
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
            xAxisColumn: { reference: groupByColumns[0], type: config.x.type },
            seriesColumns: pivotResults.valueColumns || [],
        };
    }

    pieChartGroupFieldOptions(): PieChartDimensionOptions[] {
        // TODO: Either make these option getters more generic or
        // do something specific for pie charts
        return this.barChartXLayoutOptions();
    }

    pieChartMetricFieldOptions(): PieChartMetricOptions[] {
        // TODO: Either make these option getters more generic or
        // do something specific for pie charts
        return this.barChartYLayoutOptions();
    }

    defaultPieChartFieldConfig(): SqlTransformPieChartConfig | undefined {
        const firstCategoricalColumn = this.columns.find(
            (column) => column.type === DimensionType.STRING,
        );

        const firstNumericColumn = this.columns.find(
            (column) => column.type === DimensionType.NUMBER,
        );

        const groupFieldIds = firstCategoricalColumn?.reference
            ? [firstCategoricalColumn.reference]
            : undefined;
        const metricId = firstNumericColumn?.reference;

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

    public async transformPieChartData(): // config: SqlTransformPieChartConfig,
    Promise<PieChartData> {
        // TODO: NYI
        return {
            results: this.rows,
        };
    }
}
