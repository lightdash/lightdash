import {
    type DuckDBSqlFunction,
    type PivotChartData,
    type ResultRow,
    type RowData,
    type VizSqlCartesianChartLayout,
    type VizSqlColumn,
} from '@lightdash/common';
import { ResultsTransformer } from '../../../components/DataViz/transformers/ResultsTransformer';
import { duckDBFE } from '../duckDBQuery';

type GetPivotedResultsArgs = {
    columns: VizSqlColumn[];
    rows: RowData[];
    valuesSql: string[];
    pivotsSql: string[];
    groupByColumns: string[];
    sortsSql: string[];
    duckDBSqlFunction: DuckDBSqlFunction;
};

const getPivotedResults = async ({
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

export class SqlRunnerResultsTransformer extends ResultsTransformer {
    private readonly duckDBSqlFunction: DuckDBSqlFunction;

    constructor(args: {
        rows: (RowData | ResultRow)[];
        columns: VizSqlColumn[];
    }) {
        super(args);

        this.duckDBSqlFunction = duckDBFE;
    }

    // args should be rows, columns, values (blocked by db migration)
    public async getPivotChartData(
        config: VizSqlCartesianChartLayout,
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
}
