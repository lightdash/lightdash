import { buildQuery } from './queryBuilder';
import { EXPLORE, METRIC_QUERY, METRIC_QUERY_SQL } from './queryBuilder.mock';

test('Should build simple metric query', () => {
    expect(
        buildQuery({
            explore: EXPLORE,
            compiledMetricQuery: METRIC_QUERY,
        }).query,
    ).toStrictEqual(METRIC_QUERY_SQL);
});
