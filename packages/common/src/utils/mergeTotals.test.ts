import {
    DimensionType,
    FieldType,
    MetricType,
    type Metric,
    type TableCalculation,
} from '../types/field';
import { FilterOperator } from '../types/filter';
import { MergeJoinType, type MergeQuery } from '../types/mergeQuery';
import { type MetricQuery } from '../types/metricQuery';
import {
    getMergeColumnTotal,
    getMergeColumnTotals,
    getMergeSourceTotalBlocker,
    getMergeTotalAggregation,
} from './mergeTotals';

const metric = (
    type: MetricType,
    {
        label = 'Value',
        table = 'a',
        tableLabel = 'Orders',
        name = 'value',
    } = {},
): Metric => ({
    fieldType: FieldType.METRIC,
    type,
    name,
    label,
    table,
    tableLabel,
    sql: '',
    hidden: false,
});

const sourceQuery = (overrides: Partial<MetricQuery> = {}): MetricQuery => ({
    exploreName: 'orders',
    dimensions: ['orders_month'],
    metrics: ['orders_count'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    ...overrides,
});

const merge = (
    joinType: MergeJoinType,
    overrides: Partial<MergeQuery> = {},
): MergeQuery => ({
    sources: [
        { id: 'a', metricQuery: sourceQuery() },
        { id: 'b', metricQuery: sourceQuery({ exploreName: 'payments' }) },
    ],
    joinKey: [],
    joinType,
    tableCalculations: [],
    limit: 500,
    ...overrides,
});

describe('merge totals', () => {
    it.each([
        [MetricType.SUM, 'sum'],
        [MetricType.COUNT, 'sum'],
        [MetricType.MIN, 'min'],
        [MetricType.MAX, 'max'],
    ])('totals a %s over the merged rows with %s', (type, aggregation) => {
        expect(getMergeTotalAggregation(metric(type))).toBe(aggregation);
    });

    // An average of per-key averages, or a distinct count of distinct counts,
    // is a different number from the metric over all rows.
    it.each([
        MetricType.AVERAGE,
        MetricType.COUNT_DISTINCT,
        MetricType.SUM_DISTINCT,
        MetricType.MEDIAN,
        MetricType.PERCENTILE,
        MetricType.NUMBER,
        MetricType.PERCENT_OF_TOTAL,
    ])('has no exact aggregate over merged rows for a %s', (type) => {
        expect(getMergeTotalAggregation(metric(type))).toBeNull();
    });

    it('has no aggregate over merged rows for a repeated column or a dimension', () => {
        expect(getMergeTotalAggregation(metric(MetricType.SUM), true)).toBe(
            null,
        );
        expect(
            getMergeTotalAggregation({
                fieldType: FieldType.DIMENSION,
                type: DimensionType.NUMBER,
                name: 'amount',
                label: 'Amount',
                table: 'a',
                tableLabel: 'Orders',
                sql: '',
                hidden: false,
            }),
        ).toBeNull();
    });
});

describe('getMergeSourceTotalBlocker', () => {
    it('lets every source total itself under a full join', () => {
        const mergeQuery = merge(MergeJoinType.FULL);
        expect(getMergeSourceTotalBlocker(mergeQuery, 'a')).toBeNull();
        expect(getMergeSourceTotalBlocker(mergeQuery, 'b')).toBeNull();
    });

    it('lets only the first source total itself under a left join', () => {
        const mergeQuery = merge(MergeJoinType.LEFT);
        expect(getMergeSourceTotalBlocker(mergeQuery, 'a')).toBeNull();
        expect(getMergeSourceTotalBlocker(mergeQuery, 'b')).toEqual({
            kind: 'joinDropsRows',
            joinType: MergeJoinType.LEFT,
        });
    });

    it('lets no source total itself under an inner join', () => {
        const mergeQuery = merge(MergeJoinType.INNER);
        expect(getMergeSourceTotalBlocker(mergeQuery, 'a')).toEqual({
            kind: 'joinDropsRows',
            joinType: MergeJoinType.INNER,
        });
    });

    // A metric filter applies after aggregation, so the collapsed query
    // would total rows the source query filtered out.
    it('refuses a source that filters on a metric or table calculation', () => {
        const filtered = merge(MergeJoinType.FULL, {
            sources: [
                {
                    id: 'a',
                    metricQuery: sourceQuery({
                        filters: {
                            metrics: {
                                id: 'g',
                                and: [
                                    {
                                        id: 'r',
                                        target: { fieldId: 'orders_count' },
                                        operator: FilterOperator.GREATER_THAN,
                                        values: [1],
                                    },
                                ],
                            },
                        },
                    }),
                },
                { id: 'b', metricQuery: sourceQuery() },
            ],
        });
        expect(getMergeSourceTotalBlocker(filtered, 'a')).toEqual({
            kind: 'postAggregationFilters',
        });
        expect(getMergeSourceTotalBlocker(filtered, 'b')).toBeNull();
    });

    it('has no query to total for a referenced result', () => {
        const mergeQuery = merge(MergeJoinType.FULL, {
            sources: [
                { id: 'a', metricQuery: sourceQuery() },
                { id: 'b', queryUuid: 'result-uuid' },
            ],
        });
        expect(getMergeSourceTotalBlocker(mergeQuery, 'b')).toEqual({
            kind: 'noSourceQuery',
        });
    });
});

describe('getMergeColumnTotal', () => {
    it('totals an additive metric over the merged rows whatever the join', () => {
        expect(
            getMergeColumnTotal(
                metric(MetricType.SUM),
                merge(MergeJoinType.INNER),
            ),
        ).toEqual({ from: 'mergedRows', aggregation: 'sum' });
    });

    it('totals a non-additive metric from its own query when the join keeps every row of it', () => {
        expect(
            getMergeColumnTotal(
                metric(MetricType.COUNT_DISTINCT, {
                    table: 'b',
                    tableLabel: 'Payments',
                    name: 'payments_unique_payment_count',
                }),
                merge(MergeJoinType.FULL),
            ),
        ).toEqual({
            from: 'sourceQuery',
            sourceId: 'b',
            sourceFieldId: 'payments_unique_payment_count',
            sourceLabel: 'Payments',
        });
    });

    // Repetition breaks the sum over merged rows, not the source's own total.
    it('totals a repeated source from its own query when the join keeps every row of it', () => {
        const repeated = merge(MergeJoinType.LEFT, {
            sources: [
                { id: 'a', metricQuery: sourceQuery(), repeatValues: true },
                { id: 'b', metricQuery: sourceQuery() },
            ],
        });
        expect(getMergeColumnTotal(metric(MetricType.SUM), repeated)).toEqual({
            from: 'sourceQuery',
            sourceId: 'a',
            sourceFieldId: 'value',
            sourceLabel: 'Orders',
        });
    });

    it("explains a missing total in the user's terms", () => {
        expect(
            getMergeColumnTotal(
                metric(MetricType.AVERAGE, {
                    label: 'Average rating',
                    table: 'b',
                    tableLabel: 'Payments',
                }),
                merge(MergeJoinType.INNER),
            ),
        ).toEqual({
            from: null,
            reason: "Average rating is an average, and over merged rows only sums, counts, minimums and maximums are exact. An inner join keeps only the keys both queries share, so the Payments query's own total would not match the rows shown; a full join would total it.",
        });
        expect(
            getMergeColumnTotal(
                metric(MetricType.SUM, { table: 'b', tableLabel: 'Payments' }),
                merge(MergeJoinType.LEFT, {
                    sources: [
                        { id: 'a', metricQuery: sourceQuery() },
                        {
                            id: 'b',
                            metricQuery: sourceQuery(),
                            repeatValues: true,
                        },
                    ],
                }),
            ),
        ).toEqual({
            from: null,
            reason: "Value repeats on every matching row of the other query, so a total over the merged rows would count it more than once. A left join keeps only the Payments rows that match the first query, so the Payments query's own total would not match the rows shown; a full join would total it.",
        });
    });
});

describe('getMergeColumnTotals', () => {
    it('maps every value column and skips the join key', () => {
        const calculation: TableCalculation = {
            name: 'ratio',
            displayName: 'Ratio',
            sql: '1',
        };
        const totals = getMergeColumnTotals({
            mergeQuery: merge(MergeJoinType.FULL),
            fieldIds: ['merge_key', 'a_value', 'b_unique', 'ratio', 'gone'],
            itemsMap: {
                merge_key: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'key',
                    label: 'Key',
                    table: 'merge',
                    tableLabel: 'Merge',
                    sql: '',
                    hidden: false,
                },
                a_value: metric(MetricType.SUM),
                b_unique: metric(MetricType.COUNT_DISTINCT, {
                    table: 'b',
                    tableLabel: 'Payments',
                    name: 'unique',
                }),
                ratio: calculation,
            },
        });

        expect(Object.keys(totals)).toEqual(['a_value', 'b_unique', 'ratio']);
        expect(totals.a_value.from).toBe('mergedRows');
        expect(totals.b_unique.from).toBe('sourceQuery');
        expect(totals.ratio).toEqual({
            from: null,
            reason: 'Ratio is calculated over the merged rows, so it has no total.',
        });
    });
});
