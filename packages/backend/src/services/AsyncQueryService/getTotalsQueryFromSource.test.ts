import {
    NotSupportedError,
    VizAggregationOptions,
    VizIndexType,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import {
    getColumnSubtotalQueryFromSource,
    getColumnTotalQueryFromSource,
    getGrandTotalMetricQuery,
    getRowTotalQueryFromSource,
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
    it('strips dimensions and sorts, clamps the limit to 1, and drops calcs referencing non-metric fields', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'profit_margin',
                    displayName: 'Profit margin',
                    // references orders_total_cost which is not a metric
                    sql: '${orders.total_revenue} - ${orders.total_cost}',
                } as never,
            ],
        });

        expect(result.dimensions).toEqual([]);
        expect(result.sorts).toEqual([]);
        expect(result.tableCalculations).toEqual([]);
        expect(result.limit).toBe(1);
    });

    it('keeps SQL and formula table calcs that reference only metrics', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'rev_per_customer_sql',
                    displayName: 'Rev per customer (sql)',
                    sql: '${orders.total_revenue} / ${orders.unique_customer_count}',
                } as never,
                {
                    name: 'rev_per_customer_formula',
                    displayName: 'Rev per customer (formula)',
                    formula:
                        '=orders_total_revenue / orders_unique_customer_count',
                } as never,
            ],
        });

        expect(result.tableCalculations.map((tc) => tc.name)).toEqual([
            'rev_per_customer_sql',
            'rev_per_customer_formula',
        ]);
    });

    it('drops calcs that reference a dimension, use window functions, or are template-based', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'sql_with_dimension',
                    displayName: 'Sql with dimension',
                    sql: '${orders.total_revenue} / ${orders.status}',
                } as never,
                {
                    name: 'sql_with_window',
                    displayName: 'Sql with window',
                    sql: 'SUM(${orders.total_revenue}) OVER ()',
                } as never,
                {
                    name: 'formula_with_dimension',
                    displayName: 'Formula with dimension',
                    formula: '=orders_total_revenue / orders_status',
                } as never,
                {
                    name: 'template_rank',
                    displayName: 'Template rank',
                    template: { type: 'rank_in_column' },
                } as never,
            ],
        });

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops SQL calcs using row/pivot/total helper functions', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'with_offset',
                    displayName: 'With offset',
                    sql: 'offset(${orders.total_revenue}, 1)',
                } as never,
                {
                    name: 'with_row',
                    displayName: 'With row',
                    sql: 'row()',
                } as never,
                {
                    name: 'percent_of_total',
                    displayName: 'Percent of total',
                    sql: '${orders.total_revenue} / total(${orders.total_revenue})',
                } as never,
                {
                    name: 'with_pivot_offset',
                    displayName: 'With pivot offset',
                    sql: 'pivot_offset(${orders.total_revenue}, -1)',
                } as never,
            ],
        });

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops calcs with unresolvable references instead of throwing', () => {
        expect(() =>
            getGrandTotalMetricQuery({
                ...baseMetricQuery,
                tableCalculations: [
                    {
                        name: 'bad_ref',
                        displayName: 'Bad ref',
                        sql: '${orders.total.revenue} + 1',
                    } as never,
                ],
            }),
        ).not.toThrow();

        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'bad_ref',
                    displayName: 'Bad ref',
                    sql: '${orders.total.revenue} + 1',
                } as never,
            ],
        });

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops formula calcs that use aggregates or window functions', () => {
        const result = getGrandTotalMetricQuery({
            ...baseMetricQuery,
            tableCalculations: [
                {
                    name: 'formula_aggregate',
                    displayName: 'Formula aggregate',
                    formula:
                        '=SUM(orders_total_revenue) / SUM(orders_unique_customer_count)',
                } as never,
                {
                    name: 'formula_window',
                    displayName: 'Formula window',
                    formula:
                        '=SUM(orders_total_revenue) OVER (ORDER BY orders_total_revenue)',
                } as never,
            ],
        });

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops calcs that reference a stripped period-over-period metric', () => {
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
            tableCalculations: [
                {
                    name: 'pop_delta',
                    displayName: 'PoP delta',
                    sql: '${orders.total_revenue} - ${orders_total_revenue_pop_12m}',
                } as never,
            ],
        });

        expect(result.tableCalculations).toEqual([]);
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

        it('keeps metric-only table calcs and drops dimension-referencing ones', () => {
            const result = getColumnTotalQueryFromSource({
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [
                        {
                            name: 'rev_per_customer',
                            displayName: 'Rev per customer',
                            sql: '${orders.total_revenue} / ${orders.unique_customer_count}',
                        } as never,
                        {
                            name: 'rev_by_status',
                            displayName: 'Rev by status',
                            sql: '${orders.total_revenue} / ${orders.status}',
                        } as never,
                    ],
                },
                pivotConfiguration,
            });

            expect(
                result.metricQuery.tableCalculations.map((tc) => tc.name),
            ).toEqual(['rev_per_customer']);
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

describe('getRowTotalQueryFromSource', () => {
    describe('pivoted source', () => {
        it('keeps only index dimensions and clears groupByColumns', () => {
            const result = getRowTotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration,
            });

            expect(result.metricQuery.dimensions).toEqual([
                'orders_created_at',
            ]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([]);
            expect(result.pivotConfiguration).toBeDefined();
            expect(result.pivotConfiguration?.groupByColumns).toEqual([]);
            expect(result.pivotConfiguration?.indexColumn).toEqual(
                pivotConfiguration.indexColumn,
            );
        });

        it('keeps metric-only table calcs and drops dimension-referencing ones', () => {
            const result = getRowTotalQueryFromSource({
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [
                        {
                            name: 'rev_per_customer',
                            displayName: 'Rev per customer',
                            sql: '${orders.total_revenue} / ${orders.unique_customer_count}',
                        } as never,
                        {
                            name: 'rev_by_status',
                            displayName: 'Rev by status',
                            sql: '${orders.total_revenue} / ${orders.status}',
                        } as never,
                    ],
                },
                pivotConfiguration,
            });

            expect(
                result.metricQuery.tableCalculations.map((tc) => tc.name),
            ).toEqual(['rev_per_customer']);
        });

        it('handles an indexColumn array by expanding all references into dimensions', () => {
            const multiIndexPivotConfiguration: PivotConfiguration = {
                ...pivotConfiguration,
                indexColumn: [
                    {
                        reference: 'orders_created_at',
                        type: VizIndexType.TIME,
                    },
                    {
                        reference: 'orders_status',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                groupByColumns: [{ reference: 'orders_payment_method' }],
            };

            const result = getRowTotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: multiIndexPivotConfiguration,
            });

            expect(result.metricQuery.dimensions).toEqual([
                'orders_created_at',
                'orders_status',
            ]);
            expect(result.pivotConfiguration?.indexColumn).toEqual(
                multiIndexPivotConfiguration.indexColumn,
            );
        });

        it('throws when an index column references a dimension not in the source query', () => {
            expect(() =>
                getRowTotalQueryFromSource({
                    metricQuery: {
                        ...baseMetricQuery,
                        dimensions: ['orders_payment_method', 'orders_status'],
                    },
                    pivotConfiguration,
                }),
            ).toThrow(NotSupportedError);
        });

        it('strips period-over-period additional metrics so MetricQueryBuilder accepts the totals query', () => {
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

            const result = getRowTotalQueryFromSource({
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
                getRowTotalQueryFromSource({
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

        it('rejects sources that use table-calculation filters', () => {
            expect(() =>
                getRowTotalQueryFromSource({
                    metricQuery: {
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
                    },
                    pivotConfiguration,
                }),
            ).toThrow(NotSupportedError);
        });

        it('clears sortOnlyDimensions and passthroughDimensions on the totals pivot config', () => {
            const result = getRowTotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    sortOnlyDimensions: [
                        { reference: 'orders_payment_method' },
                    ],
                    passthroughDimensions: [{ reference: 'orders_status' }],
                },
            });

            expect(
                result.pivotConfiguration?.sortOnlyDimensions,
            ).toBeUndefined();
            expect(
                result.pivotConfiguration?.passthroughDimensions,
            ).toBeUndefined();
        });
    });

    describe('non-pivoted source', () => {
        it('throws when the source has no pivot configuration', () => {
            expect(() =>
                getRowTotalQueryFromSource({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: null,
                }),
            ).toThrow(NotSupportedError);
        });

        it('throws when the pivot configuration has no groupBy columns', () => {
            expect(() =>
                getRowTotalQueryFromSource({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: {
                        ...pivotConfiguration,
                        groupByColumns: [],
                    },
                }),
            ).toThrow(NotSupportedError);
        });

        it('throws when the pivot configuration has no index column', () => {
            expect(() =>
                getRowTotalQueryFromSource({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: {
                        ...pivotConfiguration,
                        indexColumn: undefined,
                    },
                }),
            ).toThrow(NotSupportedError);
        });
    });
});

describe('getColumnSubtotalQueryFromSource', () => {
    const singleGroupByPivotConfiguration: PivotConfiguration = {
        ...pivotConfiguration,
        groupByColumns: [{ reference: 'orders_payment_method' }],
        indexColumn: {
            reference: 'orders_created_at',
            type: VizIndexType.TIME,
        },
    };

    describe('pivoted source', () => {
        it('groups by the subtotal dimensions plus the pivot groupBy columns, flat output', () => {
            const result = getColumnSubtotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_status'],
            });

            expect(result.metricQuery.dimensions).toEqual([
                'orders_status',
                'orders_payment_method',
            ]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([]);
            expect(result.pivotConfiguration).toBeUndefined();
        });

        it('keeps metric-only table calcs and drops dimension-referencing ones', () => {
            const result = getColumnSubtotalQueryFromSource({
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [
                        {
                            name: 'rev_per_customer',
                            displayName: 'Rev per customer',
                            sql: '${orders.total_revenue} / ${orders.unique_customer_count}',
                        } as never,
                        {
                            name: 'rev_by_status',
                            displayName: 'Rev by status',
                            sql: '${orders.total_revenue} / ${orders.status}',
                        } as never,
                    ],
                },
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_status'],
            });

            expect(
                result.metricQuery.tableCalculations.map((tc) => tc.name),
            ).toEqual(['rev_per_customer']);
        });

        it('dedupes when a subtotal dimension is also a pivot groupBy column', () => {
            const result = getColumnSubtotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_payment_method'],
            });

            expect(result.metricQuery.dimensions).toEqual([
                'orders_payment_method',
            ]);
        });

        it('throws when a subtotal dimension is not in the source query', () => {
            expect(() =>
                getColumnSubtotalQueryFromSource({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: singleGroupByPivotConfiguration,
                    subtotalDimensions: ['orders_unknown_dimension'],
                }),
            ).toThrow(NotSupportedError);
        });

        it('throws when no subtotal dimensions are provided', () => {
            expect(() =>
                getColumnSubtotalQueryFromSource({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: singleGroupByPivotConfiguration,
                    subtotalDimensions: [],
                }),
            ).toThrow(NotSupportedError);
        });

        it('strips period-over-period additional metrics', () => {
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

            const result = getColumnSubtotalQueryFromSource({
                metricQuery: popMetricQuery,
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_status'],
            });

            expect(result.metricQuery.metrics).toEqual([
                'orders_total_revenue',
            ]);
            expect(result.metricQuery.additionalMetrics).toEqual([]);
        });

        it('rejects sources that use metric filters', () => {
            expect(() =>
                getColumnSubtotalQueryFromSource({
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
                    pivotConfiguration: singleGroupByPivotConfiguration,
                    subtotalDimensions: ['orders_status'],
                }),
            ).toThrow(NotSupportedError);
        });
    });

    describe('non-pivoted source (treemap)', () => {
        it('groups by only the subtotal dimensions', () => {
            const result = getColumnSubtotalQueryFromSource({
                metricQuery: baseMetricQuery,
                pivotConfiguration: null,
                subtotalDimensions: ['orders_payment_method', 'orders_status'],
            });

            expect(result.metricQuery.dimensions).toEqual([
                'orders_payment_method',
                'orders_status',
            ]);
            expect(result.pivotConfiguration).toBeUndefined();
        });
    });
});
