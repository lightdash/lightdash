import {
    EXPLORE_WITH_AVERAGE_DISTINCT,
    EXPLORE_WITH_SUM_DISTINCT,
    METRIC_QUERY_AVERAGE_DISTINCT_NO_DIMS,
    METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
    METRIC_QUERY_SUM_DISTINCT_NO_DIMS,
    METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: distinct queries', () => {
    // Covers sum_distinct with selected dimensions, where the deduplication CTE must partition
    // by both the distinct key and every selected grouping dimension before rejoining the results.
    test('matches snapshot for a sum-distinct query with dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });

    // Covers the distinct-metric join ambiguity fix, where sorting by a selected
    // dimension alias after rejoining deduplicated metric CTEs requires an outer projection.
    test('matches snapshot for a sum-distinct query with dimensions sorted by dimension', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_SUM_DISTINCT,
                compiledMetricQuery: {
                    ...METRIC_QUERY_SUM_DISTINCT_WITH_DIMS,
                    sorts: [
                        { fieldId: 'orders_payment_method', descending: false },
                    ],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers the no-dimension sum_distinct path, where the deduped aggregate should avoid
    // dimension joins entirely and collapse back to a single-row aggregation shape.
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

    // Covers average_distinct with grouping dimensions, where the distinct CTE must partition
    // by the selected dimensions and then regroup the deduplicated rows into the final result set.
    test('matches snapshot for an average-distinct query with dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_AVERAGE_DISTINCT,
                compiledMetricQuery: METRIC_QUERY_AVERAGE_DISTINCT_WITH_DIMS,
            }),
        ).toMatchSnapshot();
    });
});
