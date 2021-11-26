import { buildQuery } from './queryBuilder';
import {
    EXPLORE,
    METRIC_QUERY,
    METRIC_QUERY_SQL,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_TWO_TABLES_SQL,
} from './queryBuilder.mock';

test('Should build simple metric query', () => {
    expect(
        buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: METRIC_QUERY,
        }).query,
    ).toStrictEqual(METRIC_QUERY_SQL);
});

test('Should build metric query across two tables', () => {
    expect(
        buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: METRIC_QUERY_TWO_TABLES,
        }).query,
    ).toStrictEqual(METRIC_QUERY_TWO_TABLES_SQL);
});
