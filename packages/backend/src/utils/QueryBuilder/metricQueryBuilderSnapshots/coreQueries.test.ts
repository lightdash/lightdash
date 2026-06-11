import {
    DimensionType,
    FieldType,
    MetricType,
    type Explore,
} from '@lightdash/common';
import {
    bigqueryClientMock,
    EXPLORE,
    EXPLORE_ALL_JOIN_TYPES_CHAIN,
    EXPLORE_BIGQUERY,
    EXPLORE_JOIN_CHAIN,
    METRIC_QUERY,
    METRIC_QUERY_JOIN_CHAIN,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_WITH_ADDITIONAL_METRIC,
    METRIC_QUERY_WITH_TABLE_REFERENCE,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: core queries', () => {
    // Baseline grouped metric query with one dimension, one aggregate metric,
    // and an inline table calculation emitted in the final SELECT.
    test('matches snapshot for a simple metric query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY,
            }),
        ).toMatchSnapshot();
    });

    // Covers adapter-specific quoting and SQL shape for the same baseline metric query,
    // protecting the BigQuery compilation path separately from the Postgres default path.
    test('matches snapshot for a simple metric query in BigQuery', () => {
        expect(
            buildQuery({
                explore: EXPLORE_BIGQUERY,
                compiledMetricQuery: METRIC_QUERY,
                warehouseClient: bigqueryClientMock,
            }),
        ).toMatchSnapshot();
    });

    // Covers the standard multi-table metric path, where grouped metrics are built from a joined table
    // and then projected through the top-level metrics CTE with ordering on a joined-table measure.
    test('matches snapshot for a metric query across two tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
            }),
        ).toMatchSnapshot();
    });

    // Covers non-selected table joins introduced by field references,
    // where a base-table dimension compiles to SQL that directly references a joined table field.
    test('matches snapshot for a field-reference query across tables', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TABLE_REFERENCE,
            }),
        ).toMatchSnapshot();
    });

    // Covers multi-hop join resolution, ensuring the builder emits the full intermediary join chain
    // before grouping and sorting on fields that only exist several joins away from the base table.
    test('matches snapshot for an intermediary join-chain query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_JOIN_CHAIN,
                compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
            }),
        ).toMatchSnapshot();
    });

    // Covers mixed join semantics across a multi-hop path, protecting the join-ordering logic
    // when INNER, LEFT, FULL, and RIGHT joins need to be preserved in the compiled SQL.
    test('matches snapshot for an all-join-types intermediary chain query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_ALL_JOIN_TYPES_CHAIN,
                compiledMetricQuery: METRIC_QUERY_JOIN_CHAIN,
            }),
        ).toMatchSnapshot();
    });

    // Covers queries with additional metrics that are projected alongside the requested fields,
    // ensuring the builder materializes helper metrics without changing the primary grouping shape.
    test('matches snapshot for a query with additional metrics', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_ADDITIONAL_METRIC,
            }),
        ).toMatchSnapshot();
    });

    // Covers the default-sort fallback when a query returns a single aggregated row,
    // ensuring MetricQueryBuilder omits ORDER BY entirely when no dimensions are selected.
    test('matches snapshot for a metric-only query without default sorting', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    dimensions: [],
                    metrics: ['table1_metric1'],
                    sorts: [],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers selected dimensions and metrics whose SQL depends on intrinsic user attributes,
    // ensuring runtime user context is replaced before SELECT expressions reach the warehouse.
    test('matches snapshot for selected fields using intrinsic user attributes', () => {
        const explore: Explore = {
            ...EXPLORE,
            tables: {
                ...EXPLORE.tables,
                table1: {
                    ...EXPLORE.tables.table1,
                    dimensions: {
                        ...EXPLORE.tables.table1.dimensions,
                        user_email_status: {
                            type: DimensionType.STRING,
                            name: 'user_email_status',
                            label: 'user_email_status',
                            table: 'table1',
                            tableLabel: 'table1',
                            fieldType: FieldType.DIMENSION,
                            sql: `CASE WHEN \${ld.user.email} = 'mock@lightdash.com' THEN \${TABLE}.shared ELSE 'other' END`,
                            compiledSql: `CASE WHEN \${ld.user.email} = 'mock@lightdash.com' THEN "table1".shared ELSE 'other' END`,
                            tablesReferences: ['table1'],
                            hidden: false,
                        },
                    },
                    metrics: {
                        ...EXPLORE.tables.table1.metrics,
                        user_email_metric: {
                            type: MetricType.SUM,
                            fieldType: FieldType.METRIC,
                            table: 'table1',
                            tableLabel: 'table1',
                            name: 'user_email_metric',
                            label: 'user_email_metric',
                            sql: `CASE WHEN \${ld.user.email} = 'mock@lightdash.com' THEN \${TABLE}.number_column ELSE 0 END`,
                            compiledSql: `SUM(CASE WHEN \${ld.user.email} = 'mock@lightdash.com' THEN "table1".number_column ELSE 0 END)`,
                            tablesReferences: ['table1'],
                            hidden: false,
                        },
                    },
                },
            },
        };

        expect(
            buildQuery({
                explore,
                compiledMetricQuery: {
                    ...METRIC_QUERY,
                    dimensions: ['table1_user_email_status'],
                    metrics: ['table1_user_email_metric'],
                    sorts: [],
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
            }),
        ).toMatchSnapshot();
    });
});
