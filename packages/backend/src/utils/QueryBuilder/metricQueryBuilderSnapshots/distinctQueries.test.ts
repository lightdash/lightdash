import {
    EXPLORE_WITH_AVERAGE_DISTINCT,
    EXPLORE_WITH_SUM_DISTINCT,
    METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS,
    METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
    METRIC_QUERY_SUM_DISTINCT_MULTI_KEY_FULLY_JOINABLE,
    METRIC_QUERY_SUM_DISTINCT_MULTI_KEY_PARTIAL_JOIN,
    METRIC_QUERY_SUM_DISTINCT_NO_DIMS,
    METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
    METRIC_QUERY_SUM_DISTINCT_WITH_JOINABLE_DIM,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: distinct queries', () => {
    // Selected dimensions are orthogonal to the distinct key, so the dedup CTE collapses to a
    // scalar and is CROSS JOINed onto dd_base. Every output row sees the same global total
    // (SPK-450 Wise case).
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

    // average_distinct with a selected dimension that is not in distinct_keys — same global value
    // attached to every dimension row via CROSS JOIN.
    test('matches snapshot for an average-distinct query with dimensions not in distinct_keys', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_AVERAGE_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });
});
