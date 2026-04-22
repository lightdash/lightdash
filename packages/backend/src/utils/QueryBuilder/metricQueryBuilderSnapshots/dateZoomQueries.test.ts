import {
    EXPLORE_WITH_DATE_DIMENSION,
    EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
    METRIC_QUERY_WITH_DATE_FILTER,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: date zoom queries', () => {
    // Covers zoomed date dimensions with filters, where the selected field stays DATE_TRUNC-based
    // but the WHERE clause must still target the raw underlying date column.
    test('matches snapshot for a date-zoom query with raw-date filtering', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_DATE_DIMENSION_ZOOMED,
                compiledMetricQuery: METRIC_QUERY_WITH_DATE_FILTER,
                originalExplore: EXPLORE_WITH_DATE_DIMENSION,
            }),
        ).toMatchSnapshot();
    });
});
