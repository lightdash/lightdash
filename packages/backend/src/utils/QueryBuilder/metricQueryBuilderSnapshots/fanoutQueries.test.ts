import { FilterOperator } from '@lightdash/common';
import {
    EXPLORE,
    EXPLORE_WITH_CROSS_TABLE_METRICS,
    METRIC_QUERY_CROSS_TABLE,
    METRIC_QUERY_TWO_TABLES,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

describe('MetricQueryBuilder snapshot: fanout queries', () => {
    // Mirrors fanout dashboard queries that mix base-table and joined-table metrics,
    // exercising the CTE-based de-duplication path that prevents inflated aggregates.
    test('matches snapshot for a fanout-protected metric query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    metrics: ['table1_metric1', 'table2_metric3'],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers the no-dimensions variant of the fanout-protection path,
    // where independently aggregated CTEs must be merged with a CROSS JOIN instead of keyed joins.
    test('matches snapshot for a fanout-protected metric query without dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: [],
                    metrics: ['table1_metric1', 'table2_metric3'],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers metrics that are themselves defined in terms of metrics from joined tables,
    // exercising the deduplicated cross-table metric path rather than plain field aggregation.
    test('matches snapshot for a cross-table metric query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_CROSS_TABLE_METRICS,
                compiledMetricQuery: METRIC_QUERY_CROSS_TABLE,
            }),
        ).toMatchSnapshot();
    });

    // Covers the filter-only metric path where a joined-table metric must be computed in a fanout CTE
    // for filtering, but omitted from the final projected result columns.
    test('matches snapshot for a filter-only fanout metric query', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: ['table1_dim1'],
                    metrics: ['table1_metric1'],
                    filters: {
                        metrics: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table2_metric3',
                                    },
                                    operator: FilterOperator.GREATER_THAN,
                                    values: [100],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table1_metric1', descending: true }],
                    limit: 10,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
            }),
        ).toMatchSnapshot();
    });

    // Covers the filter-only deduplication path with no selected dimensions, where a joined-table
    // metric is the only projected field and a base-table dimension filter must not create an empty helper CTE.
    test('matches snapshot for a filter-only fanout query without selected dimensions', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_TWO_TABLES,
                    dimensions: [],
                    metrics: ['table2_metric3'],
                    filters: {
                        dimensions: {
                            id: 'root',
                            and: [
                                {
                                    id: '1',
                                    target: {
                                        fieldId: 'table1_dim1',
                                    },
                                    operator: FilterOperator.EQUALS,
                                    values: [2025],
                                },
                            ],
                        },
                    },
                    sorts: [{ fieldId: 'table2_metric3', descending: true }],
                    limit: 500,
                    tableCalculations: [],
                    compiledTableCalculations: [],
                },
            }),
        ).toMatchSnapshot();
    });
});
