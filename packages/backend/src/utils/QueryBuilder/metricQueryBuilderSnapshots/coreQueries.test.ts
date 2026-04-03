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
                warehouseSqlBuilder: bigqueryClientMock,
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
});
