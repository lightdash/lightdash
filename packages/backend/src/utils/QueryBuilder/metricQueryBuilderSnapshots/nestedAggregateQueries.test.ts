import {
    CompiledMetricQuery,
    DimensionType,
    Explore,
    FieldType,
    JoinRelationship,
    MetricType,
} from '@lightdash/common';
import {
    EXPLORE_WITH_NESTED_AGG,
    METRIC_QUERY_NESTED_AGG_MIXED_RAW,
    METRIC_QUERY_NESTED_AGG_TRANSITIVE,
    METRIC_QUERY_NESTED_AGG_WITH_DIMS,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

const EXPLORE_WITH_NESTED_AGG_AND_FANOUT: Explore = {
    ...EXPLORE_WITH_NESTED_AGG,
    joinedTables: [
        {
            table: 'fanout_users',
            sqlOn: '${my_table.id} = ${fanout_users.account_id}',
            compiledSqlOn: '("my_table".id) = ("fanout_users".account_id)',
            type: 'left',
            relationship: JoinRelationship.ONE_TO_MANY,
            tablesReferences: ['my_table', 'fanout_users'],
        },
    ],
    tables: {
        ...EXPLORE_WITH_NESTED_AGG.tables,
        my_table: {
            ...EXPLORE_WITH_NESTED_AGG.tables.my_table,
            metrics: {
                ...EXPLORE_WITH_NESTED_AGG.tables.my_table.metrics,
                cross_table_sum_of_max: {
                    type: MetricType.NUMBER,
                    fieldType: FieldType.METRIC,
                    table: 'my_table',
                    tableLabel: 'my_table',
                    name: 'cross_table_sum_of_max',
                    label: 'cross_table_sum_of_max',
                    sql: 'sum(${max_value}) / NULLIF(${fanout_users.count_users}, 0)',
                    compiledSql:
                        'SUM(MAX("my_table".value)) / NULLIF(COUNT("fanout_users".id), 0)',
                    tablesReferences: ['my_table', 'fanout_users'],
                    hidden: false,
                },
            },
        },
        fanout_users: {
            name: 'fanout_users',
            label: 'fanout_users',
            database: 'db',
            schema: 'schema',
            sqlTable: '"db"."schema"."fanout_users"',
            primaryKey: ['id'],
            dimensions: {
                title: {
                    type: DimensionType.STRING,
                    name: 'title',
                    label: 'title',
                    table: 'fanout_users',
                    tableLabel: 'fanout_users',
                    fieldType: FieldType.DIMENSION,
                    sql: '${TABLE}.title',
                    compiledSql: '"fanout_users".title',
                    tablesReferences: ['fanout_users'],
                    hidden: false,
                },
            },
            metrics: {
                count_users: {
                    type: MetricType.COUNT,
                    fieldType: FieldType.METRIC,
                    table: 'fanout_users',
                    tableLabel: 'fanout_users',
                    name: 'count_users',
                    label: 'count_users',
                    sql: '${TABLE}.id',
                    compiledSql: 'COUNT("fanout_users".id)',
                    tablesReferences: ['fanout_users'],
                    hidden: false,
                },
            },
            lineageGraph: {},
        },
    },
};

const METRIC_QUERY_NESTED_AGG_WITH_FANOUT: CompiledMetricQuery = {
    exploreName: 'my_table',
    dimensions: ['fanout_users_title'],
    metrics: ['my_table_sum_of_max', 'my_table_count_records'],
    filters: {},
    sorts: [{ fieldId: 'my_table_sum_of_max', descending: true }],
    limit: 10,
    tableCalculations: [],
    compiledTableCalculations: [],
    compiledAdditionalMetrics: [],
    compiledCustomDimensions: [],
};

describe('MetricQueryBuilder snapshot: nested aggregate queries', () => {
    // Covers the baseline nested-aggregate fixup, where MetricQueryBuilder must split an invalid
    // SUM(MAX(...)) metric into staged nested_agg and nested_agg_results CTEs.
    test('matches snapshot for a nested-aggregate query with dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_NESTED_AGG,
                compiledMetricQuery: METRIC_QUERY_NESTED_AGG_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });

    // Covers transitive nested aggregation, where a metric depends on another custom metric
    // that already wraps an aggregate, forcing multi-hop CTE routing to avoid nested SQL aggregates.
    test('matches snapshot for a transitive nested-aggregate query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_NESTED_AGG,
                compiledMetricQuery: METRIC_QUERY_NESTED_AGG_TRANSITIVE,
            }),
        ).toMatchSnapshot();
    });

    // Covers mixed raw and aggregate dependencies, where nested_agg_mixed must join raw base-table
    // columns with aggregate helper results instead of trying to group raw helper metrics too early.
    test('matches snapshot for a mixed raw-and-aggregate nested query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_NESTED_AGG,
                compiledMetricQuery: METRIC_QUERY_NESTED_AGG_MIXED_RAW,
            }),
        ).toMatchSnapshot();
    });

    // Covers nested aggregates when fanout protection is also active, ensuring the nested metric
    // is emitted once and threaded through both the fanout CTE and nested aggregate result layers.
    test('matches snapshot for a fanout-protected nested-aggregate query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_NESTED_AGG_AND_FANOUT,
                compiledMetricQuery: METRIC_QUERY_NESTED_AGG_WITH_FANOUT,
            }),
        ).toMatchSnapshot();
    });

    // Covers the MAX_BY customer pattern where non-aggregate helper metrics still require
    // nested CTE routing, preventing raw helper columns from leaking into grouped SELECT output.
    test('matches snapshot for a max-by query with raw helper metrics', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_NESTED_AGG,
                compiledMetricQuery: {
                    exploreName: 'my_table',
                    dimensions: ['my_table_category'],
                    metrics: ['my_table_max_by_of_raw'],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'my_table_max_by_of_raw',
                            descending: true,
                        },
                    ],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                    compiledAdditionalMetrics: [],
                    compiledCustomDimensions: [],
                },
            }),
        ).toMatchSnapshot();
    });
});
