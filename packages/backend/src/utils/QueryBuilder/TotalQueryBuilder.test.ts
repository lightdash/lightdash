import {
    NotSupportedError,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
    type MetricQuery,
    type PivotConfiguration,
} from '@lightdash/common';
import { TotalQueryBuilder } from './TotalQueryBuilder';

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

describe('TotalQueryBuilder: grandTotal', () => {
    it('strips dimensions and sorts, clamps the limit to 1, and drops calcs referencing non-metric fields', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
                ...baseMetricQuery,
                tableCalculations: [
                    {
                        name: 'profit_margin',
                        displayName: 'Profit margin',
                        // references orders_total_cost which is not a metric
                        sql: '${orders.total_revenue} - ${orders.total_cost}',
                    } as never,
                ],
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.dimensions).toEqual([]);
        expect(result.sorts).toEqual([]);
        expect(result.tableCalculations).toEqual([]);
        expect(result.limit).toBe(1);
    });

    it('keeps SQL and formula table calcs that reference only metrics', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
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
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.tableCalculations.map((tc) => tc.name)).toEqual([
            'rev_per_customer_sql',
            'rev_per_customer_formula',
        ]);
    });

    it('drops calcs that reference a dimension, use window functions, or are template-based', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
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
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops SQL calcs using row/pivot/total helper functions', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
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
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops calcs with unresolvable references instead of throwing', () => {
        expect(
            () =>
                new TotalQueryBuilder({
                    metricQuery: {
                        ...baseMetricQuery,
                        tableCalculations: [
                            {
                                name: 'bad_ref',
                                displayName: 'Bad ref',
                                sql: '${orders.total.revenue} + 1',
                            } as never,
                        ],
                    },
                    pivotConfiguration: null,
                    kind: 'grandTotal',
                }).compileQuery().metricQuery,
        ).not.toThrow();

        const result = new TotalQueryBuilder({
            metricQuery: {
                ...baseMetricQuery,
                tableCalculations: [
                    {
                        name: 'bad_ref',
                        displayName: 'Bad ref',
                        sql: '${orders.total.revenue} + 1',
                    } as never,
                ],
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops formula calcs that use aggregates or window functions', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
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
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.tableCalculations).toEqual([]);
    });

    it('drops calcs that reference a stripped period-over-period metric', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
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
                tableCalculations: [
                    {
                        name: 'pop_delta',
                        displayName: 'PoP delta',
                        sql: '${orders.total_revenue} - ${orders_total_revenue_pop_12m}',
                    } as never,
                ],
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.tableCalculations).toEqual([]);
    });

    it('preserves the metrics list when no PoP metrics are present', () => {
        const result = new TotalQueryBuilder({
            metricQuery: baseMetricQuery,
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

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

        const result = new TotalQueryBuilder({
            metricQuery: {
                ...baseMetricQuery,
                customDimensions,
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.customDimensions).toBe(customDimensions);
    });

    it('strips period-over-period additional metrics from both lists', () => {
        const result = new TotalQueryBuilder({
            metricQuery: {
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
            },
            pivotConfiguration: null,
            kind: 'grandTotal',
        }).compileQuery().metricQuery;

        expect(result.metrics).toEqual(['orders_total_revenue']);
        expect(result.additionalMetrics).toEqual([]);
    });

    it('rejects sources that use metric filters', () => {
        expect(
            () =>
                new TotalQueryBuilder({
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
                    pivotConfiguration: null,
                    kind: 'grandTotal',
                }).compileQuery().metricQuery,
        ).toThrow(NotSupportedError);
    });

    it('rejects sources that use table-calculation filters', () => {
        expect(
            () =>
                new TotalQueryBuilder({
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
                    pivotConfiguration: null,
                    kind: 'grandTotal',
                }).compileQuery().metricQuery,
        ).toThrow(NotSupportedError);
    });
});

describe('TotalQueryBuilder: columnTotal', () => {
    describe('pivoted source', () => {
        it('keeps only groupBy dimensions and drops the index column', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration,
                kind: 'columnTotal',
            }).compileQuery();

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
            const result = new TotalQueryBuilder({
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
                kind: 'columnTotal',
            }).compileQuery();

            expect(
                result.metricQuery.tableCalculations.map((tc) => tc.name),
            ).toEqual(['rev_per_customer']);
        });

        it('drops non-totalable value columns so the pivot query never aggregates a dropped column', () => {
            const result = new TotalQueryBuilder({
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [
                        {
                            name: 'rev_per_customer',
                            displayName: 'Rev per customer',
                            sql: '${orders.total_revenue} / ${orders.unique_customer_count}',
                        } as never,
                        {
                            name: 'prev_revenue',
                            displayName: 'Prev revenue',
                            sql: 'lag(${orders.total_revenue}) over(order by ${orders.created_at})',
                        } as never,
                    ],
                },
                pivotConfiguration: {
                    ...pivotConfiguration,
                    valuesColumns: [
                        {
                            reference: 'orders_total_revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                        {
                            reference: 'rev_per_customer',
                            aggregation: VizAggregationOptions.ANY,
                        },
                        {
                            reference: 'prev_revenue',
                            aggregation: VizAggregationOptions.ANY,
                        },
                    ],
                },
                kind: 'columnTotal',
            }).compileQuery();

            expect(
                result.pivotConfiguration?.valuesColumns.map(
                    (col) => col.reference,
                ),
            ).toEqual(['orders_total_revenue', 'rev_per_customer']);
        });

        it('throws when groupByColumns reference dimensions not in the source query', () => {
            expect(() =>
                new TotalQueryBuilder({
                    metricQuery: {
                        ...baseMetricQuery,
                        dimensions: ['orders_created_at'],
                    },
                    pivotConfiguration,
                    kind: 'columnTotal',
                }).compileQuery(),
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

            const result = new TotalQueryBuilder({
                metricQuery: popMetricQuery,
                pivotConfiguration,
                kind: 'columnTotal',
            }).compileQuery();

            expect(result.metricQuery.metrics).toEqual([
                'orders_total_revenue',
            ]);
            expect(result.metricQuery.additionalMetrics).toEqual([]);
        });

        it('rejects sources that use metric filters', () => {
            expect(() =>
                new TotalQueryBuilder({
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
                    kind: 'columnTotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });
    });

    describe('non-pivoted source', () => {
        it('drops all dimensions and returns no pivot configuration', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: null,
                kind: 'columnTotal',
            }).compileQuery();

            expect(result.metricQuery.dimensions).toEqual([]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([]);
            expect(result.pivotConfiguration).toBeUndefined();
        });

        it('drops all dimensions when pivot configuration has no groupBy columns', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    groupByColumns: [],
                },
                kind: 'columnTotal',
            }).compileQuery();

            expect(result.metricQuery.dimensions).toEqual([]);
            expect(result.pivotConfiguration).toBeUndefined();
        });
    });
});

describe('TotalQueryBuilder: rowTotal', () => {
    describe('pivoted source', () => {
        it('keeps only index dimensions and clears groupByColumns', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration,
                kind: 'rowTotal',
            }).compileQuery();

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
            const result = new TotalQueryBuilder({
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
                kind: 'rowTotal',
            }).compileQuery();

            expect(
                result.metricQuery.tableCalculations.map((tc) => tc.name),
            ).toEqual(['rev_per_customer']);
        });

        it('drops non-totalable value columns so the pivot query never aggregates a dropped column', () => {
            const result = new TotalQueryBuilder({
                metricQuery: {
                    ...baseMetricQuery,
                    tableCalculations: [
                        {
                            name: 'rev_per_customer',
                            displayName: 'Rev per customer',
                            sql: '${orders.total_revenue} / ${orders.unique_customer_count}',
                        } as never,
                        {
                            name: 'prev_revenue',
                            displayName: 'Prev revenue',
                            sql: 'lag(${orders.total_revenue}) over(order by ${orders.created_at})',
                        } as never,
                    ],
                },
                pivotConfiguration: {
                    ...pivotConfiguration,
                    valuesColumns: [
                        {
                            reference: 'orders_total_revenue',
                            aggregation: VizAggregationOptions.SUM,
                        },
                        {
                            reference: 'rev_per_customer',
                            aggregation: VizAggregationOptions.ANY,
                        },
                        {
                            reference: 'prev_revenue',
                            aggregation: VizAggregationOptions.ANY,
                        },
                    ],
                },
                kind: 'rowTotal',
            }).compileQuery();

            expect(
                result.pivotConfiguration?.valuesColumns.map(
                    (col) => col.reference,
                ),
            ).toEqual(['orders_total_revenue', 'rev_per_customer']);
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

            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: multiIndexPivotConfiguration,
                kind: 'rowTotal',
            }).compileQuery();

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
                new TotalQueryBuilder({
                    metricQuery: {
                        ...baseMetricQuery,
                        dimensions: ['orders_payment_method', 'orders_status'],
                    },
                    pivotConfiguration,
                    kind: 'rowTotal',
                }).compileQuery(),
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

            const result = new TotalQueryBuilder({
                metricQuery: popMetricQuery,
                pivotConfiguration,
                kind: 'rowTotal',
            }).compileQuery();

            expect(result.metricQuery.metrics).toEqual([
                'orders_total_revenue',
            ]);
            expect(result.metricQuery.additionalMetrics).toEqual([]);
        });

        it('rejects sources that use metric filters', () => {
            expect(() =>
                new TotalQueryBuilder({
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
                    kind: 'rowTotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });

        it('rejects sources that use table-calculation filters', () => {
            expect(() =>
                new TotalQueryBuilder({
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
                    kind: 'rowTotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });

        it('drops sortBy on the pivot column dimension that the collapse removes', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    sortBy: [
                        {
                            reference: 'orders_payment_method',
                            direction: SortByDirection.ASC,
                        },
                    ],
                },
                kind: 'rowTotal',
            }).compileQuery();

            expect(result.pivotConfiguration?.sortBy).toEqual([]);
        });

        it('drops sortBy on a metric (exposed under an `_any` alias in the collapsed query)', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    sortBy: [
                        {
                            reference: 'orders_total_revenue',
                            direction: SortByDirection.DESC,
                        },
                    ],
                },
                kind: 'rowTotal',
            }).compileQuery();

            expect(result.pivotConfiguration?.sortBy).toEqual([]);
        });

        it('keeps sortBy on index columns and drops sorts on non-index dimensions', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    sortBy: [
                        {
                            reference: 'orders_created_at',
                            direction: SortByDirection.ASC,
                        },
                        {
                            reference: 'orders_payment_method',
                            direction: SortByDirection.ASC,
                        },
                    ],
                },
                kind: 'rowTotal',
            }).compileQuery();

            expect(result.pivotConfiguration?.sortBy).toEqual([
                {
                    reference: 'orders_created_at',
                    direction: SortByDirection.ASC,
                },
            ]);
        });

        it('clears sortOnlyDimensions and passthroughDimensions on the totals pivot config', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    sortOnlyDimensions: [
                        { reference: 'orders_payment_method' },
                    ],
                    passthroughDimensions: [{ reference: 'orders_status' }],
                },
                kind: 'rowTotal',
            }).compileQuery();

            expect(
                result.pivotConfiguration?.sortOnlyDimensions,
            ).toBeUndefined();
            expect(
                result.pivotConfiguration?.passthroughDimensions,
            ).toBeUndefined();
        });

        it('supports metrics-as-rows pivots with no index column', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: {
                    ...pivotConfiguration,
                    indexColumn: undefined,
                    sortBy: [
                        {
                            reference: 'orders_payment_method',
                            direction: SortByDirection.ASC,
                        },
                    ],
                },
                kind: 'rowTotal',
            }).compileQuery();

            expect(result.metricQuery.dimensions).toEqual([]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.limit).toBe(1);
            expect(result.pivotConfiguration).toBeUndefined();
        });
    });

    describe('non-pivoted source', () => {
        it('throws when the source has no pivot configuration', () => {
            expect(() =>
                new TotalQueryBuilder({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: null,
                    kind: 'rowTotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });

        it('throws when the pivot configuration has no groupBy columns', () => {
            expect(() =>
                new TotalQueryBuilder({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: {
                        ...pivotConfiguration,
                        groupByColumns: [],
                    },
                    kind: 'rowTotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });
    });
});

describe('TotalQueryBuilder: columnSubtotal', () => {
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
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_status'],
                kind: 'columnSubtotal',
            }).compileQuery();

            expect(result.metricQuery.dimensions).toEqual([
                'orders_status',
                'orders_payment_method',
            ]);
            expect(result.metricQuery.sorts).toEqual([]);
            expect(result.metricQuery.tableCalculations).toEqual([]);
            expect(result.pivotConfiguration).toBeUndefined();
        });

        it('keeps metric-only table calcs and drops dimension-referencing ones', () => {
            const result = new TotalQueryBuilder({
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
                kind: 'columnSubtotal',
            }).compileQuery();

            expect(
                result.metricQuery.tableCalculations.map((tc) => tc.name),
            ).toEqual(['rev_per_customer']);
        });

        it('dedupes when a subtotal dimension is also a pivot groupBy column', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_payment_method'],
                kind: 'columnSubtotal',
            }).compileQuery();

            expect(result.metricQuery.dimensions).toEqual([
                'orders_payment_method',
            ]);
        });

        it('throws when a subtotal dimension is not in the source query', () => {
            expect(() =>
                new TotalQueryBuilder({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: singleGroupByPivotConfiguration,
                    subtotalDimensions: ['orders_unknown_dimension'],
                    kind: 'columnSubtotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });

        it('throws when no subtotal dimensions are provided', () => {
            expect(() =>
                new TotalQueryBuilder({
                    metricQuery: baseMetricQuery,
                    pivotConfiguration: singleGroupByPivotConfiguration,
                    subtotalDimensions: [],
                    kind: 'columnSubtotal',
                }).compileQuery(),
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

            const result = new TotalQueryBuilder({
                metricQuery: popMetricQuery,
                pivotConfiguration: singleGroupByPivotConfiguration,
                subtotalDimensions: ['orders_status'],
                kind: 'columnSubtotal',
            }).compileQuery();

            expect(result.metricQuery.metrics).toEqual([
                'orders_total_revenue',
            ]);
            expect(result.metricQuery.additionalMetrics).toEqual([]);
        });

        it('rejects sources that use metric filters', () => {
            expect(() =>
                new TotalQueryBuilder({
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
                    kind: 'columnSubtotal',
                }).compileQuery(),
            ).toThrow(NotSupportedError);
        });
    });

    describe('non-pivoted source (treemap)', () => {
        it('groups by only the subtotal dimensions', () => {
            const result = new TotalQueryBuilder({
                metricQuery: baseMetricQuery,
                pivotConfiguration: null,
                subtotalDimensions: ['orders_payment_method', 'orders_status'],
                kind: 'columnSubtotal',
            }).compileQuery();

            expect(result.metricQuery.dimensions).toEqual([
                'orders_payment_method',
                'orders_status',
            ]);
            expect(result.pivotConfiguration).toBeUndefined();
        });
    });
});
