import { intersectionBy } from 'lodash';
import { DimensionType, MetricType } from '../types/field';
import {
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
    x: {
        reference: string;
        type: IndexType;
    };
    y: {
        reference: string;
        aggregation: AggregationOptions;
    }[];
    groupBy: { reference: string }[] | undefined;
};

// Temporary - this type was used for runner-specific **and** cartesian specific config
// now we have distinct types for each, even though they are identical
export type SqlPivotChartLayout = SqlCartesianChartLayout;

export type PieChartDisplay = {
    isDonut?: boolean;
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

    console.log({ query });

    const pivoted = await duckDBSqlFunction(query, rows, columns);

    console.log({ pivoted });

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
    implements ResultsRunnerBase<SqlPivotChartLayout>
{
    private readonly duckDBSqlFunction: DuckDBSqlFunction;

    private readonly rows: RowData[];

    private readonly columns: SqlColumn[];

    constructor(args: SqlRunnerResultsTransformerDeps) {
        this.duckDBSqlFunction = args.duckDBSqlFunction;

        this.rows = args.rows;
        this.columns = args.columns;
    }

    pivotChartLayoutOptions(): PivotLayoutOptions[] {
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
    pivotChartIndexLayoutOptions(): IndexLayoutOptions[] {
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

    pivotChartValuesLayoutOptions(): ValuesLayoutOptions[] {
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

    getPivotChartLayoutOptions(): {
        indexLayoutOptions: IndexLayoutOptions[];
        valuesLayoutOptions: ValuesLayoutOptions[];
        pivotLayoutOptions: PivotLayoutOptions[];
    } {
        return {
            indexLayoutOptions: this.pivotChartIndexLayoutOptions(),
            valuesLayoutOptions: this.pivotChartValuesLayoutOptions(),
            pivotLayoutOptions: this.pivotChartLayoutOptions(),
        };
    }

    defaultPivotChartLayout(): SqlPivotChartLayout | undefined {
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
        const x: SqlCartesianChartLayout['x'] = {
            reference: xColumn.reference,
            type: [DimensionType.DATE, DimensionType.TIMESTAMP].includes(
                xColumn.type,
            )
                ? IndexType.TIME
                : IndexType.CATEGORY,
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

    // args should be rows, columns, values (blocked by db migration)
    public async getPivotChartData(
        config: SqlPivotChartLayout,
    ): Promise<PivotChartData> {
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
                type: config.x.type,
            },
            valuesColumns: pivotResults.valueColumns || [],
        };
    }

    mergePivotChartLayout(currentConfig?: SqlPivotChartLayout) {
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
}
