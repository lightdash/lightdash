import {
    CompiledMetricQuery,
    DimensionType,
    Explore,
    FieldType,
    MetricType,
} from 'common';

export const EXPLORE: Explore = {
    targetDatabase: 'postgres',
    name: 'table1',
    baseTable: 'table1',
    joinedTables: [],
    tables: {
        table1: {
            name: 'table1',
            database: 'database',
            schema: 'schema',
            sqlTable: '"db"."schema"."table1"',
            dimensions: {
                dim1: {
                    type: DimensionType.NUMBER,
                    name: 'dim1',
                    table: 'table1',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.dim1',
                    compiledSql: 'table1.dim1',
                },
            },
            metrics: {
                metric1: {
                    type: MetricType.MAX,
                    fieldType: FieldType.METRIC,
                    table: 'table1',
                    name: 'metric1',
                    sql: '${TABLE}.number_column',
                    compiledSql: 'MAX(table1.number_column)',
                },
            },
            lineageGraph: {},
        },
    },
};

export const METRIC_QUERY: CompiledMetricQuery = {
    dimensions: ['table1_dim1'],
    metrics: ['table1_metric1'],
    filters: [],
    sorts: [{ fieldId: 'table1_metric1', descending: true }],
    limit: 10,
    tableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table1.metric1}',
        },
    ],
    compiledTableCalculations: [
        {
            name: 'calc3',
            displayName: '',
            sql: '${table1.dim1} + ${table1.metric1}',
            compiledSql: 'table1_dim1 + table1_metric1',
        },
    ],
};

export const METRIC_QUERY_SQL = `WITH metrics AS (
SELECT
  table1.dim1 AS "table1_dim1",
  MAX(table1.number_column) AS "table1_metric1"
FROM "db"."schema"."table1" AS table1


GROUP BY 1
)
SELECT
  *,
  table1_dim1 + table1_metric1 AS "calc3"
FROM metrics
ORDER BY "table1_metric1" DESC
LIMIT 10`;
