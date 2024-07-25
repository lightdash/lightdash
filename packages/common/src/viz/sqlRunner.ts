import { DimensionType } from '../types/field';
import {
    type BarChartData,
    type ResultsTransformerBase,
    type RowData,
} from './base';

export type SqlColumn = {
    id: string;
    type: DimensionType;
};

type XLayoutOptions = {
    columnId: string;
    timeGrainOptions: string[];
};

type YLayoutOptions = {
    columnId: string;
    aggregationOptions: string[];
};

type SeriesLayoutOptions = {
    columnId: string;
};

export type SqlTransformBarChartConfig = {
    x: {
        columnId: string;
        timeGrain: string;
    };
    y: {
        columnId: string;
        aggregation: string;
        sort: string | null;
    }[];
    groupBy: {
        columnId: string | null;
    };
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

export class SqlRunnerResultsTransformer2
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
                        columnId: column.id,
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
                        columnId: column.id,
                        timeGrainOptions: [
                            'day',
                            'week',
                            'month',
                            'quarter',
                            'year',
                        ],
                    });
                    break;
                case DimensionType.TIMESTAMP:
                    options.push({
                        columnId: column.id,
                        timeGrainOptions: [
                            'minute',
                            'hour',
                            'day',
                            'week',
                            'month',
                            'quarter',
                            'year',
                        ],
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.NUMBER:
                case DimensionType.BOOLEAN:
                    options.push({
                        columnId: column.id,
                        timeGrainOptions: [],
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
                        columnId: column.id,
                        aggregationOptions: [
                            'first',
                            'min',
                            'max',
                            'sum',
                            'average',
                            'count',
                            'count_distinct',
                        ],
                    });
                    break;
                case DimensionType.STRING:
                case DimensionType.BOOLEAN:
                    options.push({
                        columnId: column.id,
                        aggregationOptions: ['count', 'count_distinct'],
                    });
                    break;
                default:
                    break;
            }
        }
        return options;
    }

    public async transformBarChartData(
        config: SqlTransformBarChartConfig,
    ): Promise<BarChartData> {
        const groupByColumns = [config.x.columnId];
        const pivotsSql = config.groupBy.columnId
            ? [config.groupBy.columnId]
            : [];
        const valuesSql = config.y.map(
            (y) => `${y.aggregation}(${y.columnId})`,
        );
        const sortsSql = [`${config.x.columnId} ASC`];

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
