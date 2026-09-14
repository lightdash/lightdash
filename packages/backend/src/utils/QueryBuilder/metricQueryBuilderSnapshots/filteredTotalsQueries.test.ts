import {
    CompiledMetricQuery,
    FilterOperator,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import {
    EXPLORE,
    METRIC_QUERY_WITH_CUSTOM_DIMENSION,
    METRIC_QUERY_WITH_METRIC_FILTER,
    METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

// The builder receives the ORIGINAL query + totalConfiguration and collapses
// it internally; metric filters are stripped from the collapsed query and
// enforced by restricting raw rows to the embedded source groups instead.
const GRAND_TOTAL = {
    kind: 'grandTotal' as const,
    subtotalDimensions: undefined,
};

const METRIC_FILTERED_SOURCE: CompiledMetricQuery =
    METRIC_QUERY_WITH_METRIC_FILTER;

describe('MetricQueryBuilder snapshot: totals restricted to filtered dimension groups', () => {
    // Covers the basic PROD-8431 shape: a grand total over raw rows, INNER
    // JOINed to the metric-filtered source groups on the source dimension.
    test('matches snapshot for a grand total restricted by a metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_FILTERED_SOURCE,
                totalConfiguration: GRAND_TOTAL,
            }),
        ).toMatchSnapshot();
    });

    // Covers a source filtered on a table calculation: the embedded CTE must
    // compile the calc chain and filter on it.
    test('matches snapshot for a grand total restricted by a table-calculation filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: METRIC_QUERY_WITH_TABLE_CALCULATION_FILTER,
                totalConfiguration: GRAND_TOTAL,
            }),
        ).toMatchSnapshot();
    });

    // Covers a custom bin dimension as a join dimension when the collapsed
    // totals query does not select it: the bin min/max CTE and CROSS JOIN must
    // be added so the bin expression is computable at the raw scan.
    test('matches snapshot for a custom bin dimension restriction', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_QUERY_WITH_CUSTOM_DIMENSION,
                    filters: METRIC_FILTERED_SOURCE.filters,
                },
                totalConfiguration: GRAND_TOTAL,
            }),
        ).toMatchSnapshot();
    });

    // Covers a pivoted column total: the builder collapses to the pivot
    // groupBy grain, still restricted to the filtered source groups.
    test('matches snapshot for a pivoted column total restricted by a metric filter', () => {
        expect(
            buildQuery({
                explore: EXPLORE,
                compiledMetricQuery: {
                    ...METRIC_FILTERED_SOURCE,
                    dimensions: ['table1_dim1', 'table1_shared'],
                },
                pivotConfiguration: {
                    indexColumn: {
                        reference: 'table1_dim1',
                        type: VizIndexType.CATEGORY,
                    },
                    valuesColumns: [
                        {
                            reference: 'table1_metric1',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                    groupByColumns: [{ reference: 'table1_shared' }],
                    sortBy: undefined,
                },
                totalConfiguration: {
                    kind: 'columnTotal',
                    subtotalDimensions: undefined,
                },
            }),
        ).toMatchSnapshot();
    });
});
