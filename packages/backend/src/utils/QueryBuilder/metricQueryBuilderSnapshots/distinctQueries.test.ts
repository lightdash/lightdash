import {
    EXPLORE_WITH_AVERAGE_DISTINCT,
    EXPLORE_WITH_SUM_DISTINCT,
    EXPLORE_WITH_SUM_DISTINCT_WRAPPER,
    METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS,
    METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
    METRIC_QUERY_SUM_DISTINCT_MULTI_KEY_FULLY_JOINABLE,
    METRIC_QUERY_SUM_DISTINCT_MULTI_KEY_PARTIAL_JOIN,
    METRIC_QUERY_SUM_DISTINCT_NO_DIMS,
    METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
    METRIC_QUERY_SUM_DISTINCT_WITH_JOINABLE_DIM,
    METRIC_QUERY_SUM_DISTINCT_WRAPPER_DIRECT,
    METRIC_QUERY_SUM_DISTINCT_WRAPPER_MIXED,
    METRIC_QUERY_SUM_DISTINCT_WRAPPER_TRANSITIVE,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: distinct queries', () => {
    // Selected dimensions are orthogonal to the distinct key, but deduplication still happens
    // within each selected dimension group so each output row gets its own grouped total.
    test('matches snapshot for a sum-distinct query with dimensions not in distinct_keys', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });

    // The selected dimension is the metric's distinct key, so the dedup CTE keeps one row per
    // distinct-key value and is INNER JOINed back onto dd_base.
    test('matches snapshot for a sum-distinct query where the selected dimension is the distinct key', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery:
                    METRIC_QUERY_SUM_DISTINCT_WITH_JOINABLE_DIM,
            }),
        ).toMatchSnapshot();
    });

    // Multi-key distinct where every distinct key is also a selected dimension — one output row
    // per (order_id, payment_method), INNER JOIN on both keys. Regression test for the case where
    // a global CROSS JOIN scalar incorrectly produced the same value on every row.
    test('matches snapshot for a multi-key sum-distinct query with all distinct keys selected', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery:
                    METRIC_QUERY_SUM_DISTINCT_MULTI_KEY_FULLY_JOINABLE,
            }),
        ).toMatchSnapshot();
    });

    // Multi-key distinct where only one of two distinct keys is selected — the dedup CTE
    // aggregates over the unselected key, then INNER JOINs on the one selected key.
    test('matches snapshot for a multi-key sum-distinct query with a partially overlapping selection', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery:
                    METRIC_QUERY_SUM_DISTINCT_MULTI_KEY_PARTIAL_JOIN,
            }),
        ).toMatchSnapshot();
    });

    // No-dimension path: the dedup CTE collapses to a single-row aggregation with no join.
    test('matches snapshot for a sum-distinct query without dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_NO_DIMS,
            }),
        ).toMatchSnapshot();
    });

    // Covers average_distinct without dimensions, protecting the FLOAT-based numerator/denominator
    // rewrite that avoids integer division when deduplicated averages are computed from raw rows.
    test('matches snapshot for an average-distinct query without dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_AVERAGE_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS,
            }),
        ).toMatchSnapshot();
    });

    // average_distinct also deduplicates within the selected dimension group, even when that
    // dimension is not part of distinct_keys.
    test('matches snapshot for an average-distinct query with dimensions not in distinct_keys', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_AVERAGE_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });

    // PROD-7893: wrapper resolves to dd CTE refs, not raw SUM(...).
    test('matches snapshot for a type:number metric that wraps two sum_distinct metrics', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT_WRAPPER,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_WRAPPER_DIRECT,
            }),
        ).toMatchSnapshot();
    });

    // PROD-7893: transitive rate (rate -> wrapper -> sum_distinct) resolves to dd CTE refs.
    test('matches snapshot for a type:number metric that transitively references sum_distinct metrics through another type:number wrapper', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT_WRAPPER,
                compiledMetricQuery:
                    METRIC_QUERY_SUM_DISTINCT_WRAPPER_TRANSITIVE,
            }),
        ).toMatchSnapshot();
    });

    // PROD-7893: both wrappers selected — exercises topo ordering.
    test('matches snapshot for both wrapper and transitive-rate metrics selected together', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT_WRAPPER,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_WRAPPER_MIXED,
            }),
        ).toMatchSnapshot();
    });
});
