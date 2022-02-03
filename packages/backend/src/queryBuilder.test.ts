import { buildQuery } from './queryBuilder';
import {
    EXPLORE,
    METRIC_QUERY,
    METRIC_QUERY_SQL,
    METRIC_QUERY_TWO_TABLES,
    METRIC_QUERY_TWO_TABLES_SQL,
    METRIC_QUERY_WITH_FILTER,
    METRIC_QUERY_WITH_FILTER_SQL,
    METRIC_QUERY_WITH_METRIC_FILTER,
    METRIC_QUERY_WITH_METRIC_FILTER_SQL,
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

test('Should join table from filter dimension', () => {
    expect(
        buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: METRIC_QUERY_WITH_FILTER,
        }).query,
    ).toStrictEqual(METRIC_QUERY_WITH_FILTER_SQL);
});

test('Should build second query with metric filter', () => {
    expect(
        buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: METRIC_QUERY_WITH_METRIC_FILTER,
        }).query,
    ).toStrictEqual(METRIC_QUERY_WITH_METRIC_FILTER_SQL);
});
