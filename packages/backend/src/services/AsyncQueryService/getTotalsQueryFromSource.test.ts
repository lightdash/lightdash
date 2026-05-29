import {
    NotSupportedError,
    VizAggregationOptions,
    VizIndexType,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import {
    getColumnTotalQueryFromSource,
    getGrandTotalMetricQuery,
} from './getTotalsQueryFromSource';

const emptyFilters: MetricQuery['filters'] = {};

const baseMetricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_payment_method', 'orders_status', 'orders_created_at'],
    metrics: ['orders_total_revenue', 'orders_unique_customer_count'],
    filters: emptyFilters,
    sorts: [{ fieldId: 'orders_total_revenue', descending: true }],
    limit: 500,
    tableCalculations: [],
};

const pivotConfiguration: PivotConfiguration = {
    indexColumn: {
        reference: 'orders_created_at',
        type: VizIndexType.TIME,
    },
    valuesColumns: [
        {
            reference: 'orders_total_revenue',
            aggregation: VizAggregationOptions.SUM,
        },
    ],
    groupByColumns: [
        { reference: 'orders_payment_method' },
        { reference: 'orders_status' },
    ],
    sortBy: undefined,
};

describe('getGrandTotalMetricQuery', () => {
    it('strips dimensions, sorts, table calculations and clamps the limit to 1', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'profit_margin',
                    displayName: 'Profit margin',
                    sql: '${orders.total_revenue} - ${orders.total_cost}',
                } as never,
            ],
        });

        expect(result.dimensions).toEqual([]);
        expect(result.sorts).toEqual([]);
        expect(result.tableCalculations).toEqual([]);
        expect(result.limit).toBe(1);
    });

    it('preserves the metrics list when no PoP metrics are present', () => {
        const result = getGrandTotalMetricQuery(baseMetricQuery);

        expect(result.metrics).toEqual(baseMetricQuery.metrics);
        expect(result.additionalMetrics ?? []).toEqual([]);
    });

    it('passes customDimensions through unchanged', () => {
        const customDimensions = [
            {
                id: 'orders_bin_revenue',
                name: 'orders_bin_revenue',
                dimensionId: 'orders_total_revenue',
                table: 'orders',
                binType: 'fixed_width',
                binWidth: 10,
            } as never,
        ];

        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            customDimensions,
        });

        expect(result.customDimensions).toBe(customDimensions);
    });

    it('strips period-over-period additional metrics from both lists', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            metrics: ['orders_total_revenue', 'orders_total_revenue_pop_12m'],
            additionalMetrics: [
                {
                    name: 'total_revenue_pop_12m',
                    table: 'orders',
                    sql: '${TABLE}.revenue',
                    type: 'sum' as never,
                    generationType: 'periodOverPeriod',
                    baseMetricId: 'orders_total_revenue',
                    timeDimensionId: 'orders_created_at',
                    granularity: 'MONTH' as never,
                    periodOffset: 12,
                } as never,
            ],
        });

        expect(result.metrics).toEqual(['orders_total_revenue']);
        expect(result.additionalMetrics).toEqual([]);
    });

    it('rejects sources that use metric filters', () => {
        expect(() =>
            getGrandTotalMetricQuery({
                ...baseMetricQuery,
                filters: {
                    metrics: {
                        id: 'metric-filter-group',
                        and: [
                            {
                                id: 'rule-1',
                                target: { fieldId: 'orders_total_revenue' },
                                operator: 'greaterThan' as never,
                                values: [0],
                            },
                        ],
                    } as never,
                },
            }),
        ).toThrow(NotSupportedError);
    });

    it('rejects sources that use table-calculation filters', () => {
        expect(() =>
            getGrandTotalMetricQuery({
                ...baseMetricQuery,
                filters: {
                    tableCalculations: {
                        id: 'tc-filter-group',
                        and: [
                            {
                                id: 'rule-1',
                                target: { fieldId: 'profit_margin' },
                                operator: 'greaterThan' as never,
                                values: [0],
                            },
                        ],
                    } as never,
                },
            }),
        ).toThrow(NotSupportedError);
    });
});

describe('getColumnTotalQueryFromSource', () => {
    describe('pivoted source', () => {
        it('keeps only groupBy dimensions and drops the index column', () => {
            const result = getColumnTotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration,
            });

            expect(result.metricQuery.dimensions).toEqual([
                'orders_payment_method',
                'orders_status',
            ]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([]);
            expect(result.pivotConfiguration).toBeDefined();
            expect(result.pivotConfiguration?.indexColumn).toBeUndefined();
            expect(result.pivotConfiguration?.groupByColumns).toEqual(
                pivotConfiguration.groupByColumns,
            );
        });

        it('throws when groupByColumns reference dimensions not in the source query', () => {
            expect(() =>
                getColumnTotalQueryFromSource({
                    metricQuery: {
                        ...baseMetricQuery,
                        dimensions: ['orders_created_at'],
                    },
                    pivotConfiguration,
                }),
            ).toThrow(NotSupportedError);
        });

        it('strips period-over-period additional metrics so MetricQueryBuilder accepts the totals query', () => {
            // PoP metrics need `table` + `name` (for isAdditionalMetric) plus
            // the generated-metric metadata fields (for the PoP type guard).
            const popMetricQuery: MetricQuery = {
                ...baseMetricQuery,
                metrics: [
                    'orders_total_revenue',
                    'orders_total_revenue_pop_12m',
                ],
                additionalMetrics: [
                    {
                        name: 'total_revenue_pop_12m',
                        table: 'orders',
                        sql: '${TABLE}.revenue',
                        type: 'sum' as never,
                        generationType: 'periodOverPeriod',
                        baseMetricId: 'orders_total_revenue',
                        timeDimensionId: 'orders_created_at',
                        granularity: 'MONTH' as never,
                        periodOffset: 12,
                    } as never,
                ],
            };

            const result = getColumnTotalQueryFromSource({
                metricQuery: popMetricQuery,
                pivotConfiguration,
            });

            expect(result.metricQuery.metrics).toEqual([
                'orders_total_revenue',
            ]);
            expect(result.metricQuery.additionalMetrics).toEqual([]);
        });

        it('rejects sources that use metric filters', () => {
            expect(() =>
                getColumnTotalQueryFromSource({
                    metricQuery: {
                        ...baseMetricQuery,
                        filters: {
                            metrics: {
                                id: 'metric-filter-group',
                                and: [
                                    {
                                        id: 'rule-1',
                                        target: {
                                            fieldId: 'orders_total_revenue',
                                        },
                                        operator: 'greaterThan' as never,
                                        values: [0],
                                    },
                                ],
                            } as never,
                        },
                    },
                    pivotConfiguration,
                }),
            ).toThrow(NotSupportedError);
        });
    });

    describe('non-pivoted source', () => {
        it('drops all dimensions and returns no pivot configuration', () => {
            const result = getColumnTotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: null,
            });

            expect(result.metricQuery.dimensions).toEqual([]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([]);
            expect(result.pivotConfiguration).toBeUndefined();
        });

        it('drops all dimensions when pivot configuration has no groupBy columns', () => {
            const result = getColumnTotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    groupByColumns: [],
                },
            });

            expect(result.metricQuery.dimensions).toEqual([]);
            expect(result.pivotConfiguration).toBeUndefined();
        });
    });
});
