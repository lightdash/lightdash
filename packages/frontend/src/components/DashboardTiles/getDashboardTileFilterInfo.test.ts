import {
    FilterOperator,
    MergeJoinType,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type Filters,
    type SavedMergeQuery,
} from '@lightdash/common';
import { getDashboardTileFilterInfo } from './getDashboardTileFilterInfo';

const explore = {
    name: 'orders',
    tables: {
        orders: {
            dimensions: {
                order_date_month: {
                    name: 'order_date_month',
                    timeIntervalBaseDimensionName: 'order_date',
                },
                order_date_year: {
                    name: 'order_date_year',
                    timeIntervalBaseDimensionName: 'order_date',
                },
            },
        },
    },
} as unknown as Explore;

describe('getDashboardTileFilterInfo', () => {
    test('marks a chart date filter overridden by another date granularity', () => {
        const chartFilters: Filters = {
            dimensions: {
                id: 'chart-filter-group',
                and: [
                    {
                        id: 'month-filter',
                        target: { fieldId: 'orders_order_date_month' },
                        operator: FilterOperator.EQUALS,
                        values: ['2024-03'],
                    },
                    {
                        id: 'nested-filter-group',
                        or: [
                            {
                                id: 'nested-month-filter',
                                target: {
                                    fieldId: 'orders_order_date_month',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['2024-02'],
                            },
                        ],
                    },
                ],
            },
        };
        const appliedDashboardFilters: DashboardFilters = {
            dimensions: [
                {
                    id: 'year-filter',
                    label: 'Year Filter',
                    target: {
                        fieldId: 'orders_order_date_year',
                        tableName: 'orders',
                    },
                    operator: FilterOperator.EQUALS,
                    values: ['2024'],
                },
            ],
            metrics: [],
            tableCalculations: [],
        };

        const result = getDashboardTileFilterInfo({
            chartFilters,
            appliedDashboardFilters,
            appliedDashboardFiltersBySourceId: undefined,
            merge: null,
            explore,
        });

        expect(result.appliedFilterItems).toHaveLength(1);
        expect(result.chartFilterItems).toEqual([
            expect.objectContaining({
                filterRule: expect.objectContaining({ id: 'month-filter' }),
                isOverridden: true,
            }),
            expect.objectContaining({
                filterRule: expect.objectContaining({
                    id: 'nested-month-filter',
                }),
                isOverridden: false,
            }),
        ]);
    });

    const yearFilter: DashboardFilterRule = {
        id: 'year-filter',
        label: 'Year Filter',
        target: { fieldId: 'orders_order_date_year', tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: ['2024'],
    };
    const paymentMonthFilter: DashboardFilterRule = {
        id: 'payment-month-filter',
        label: 'Payment month',
        target: { fieldId: 'payments_payment_month', tableName: 'payments' },
        operator: FilterOperator.EQUALS,
        values: ['2024-03'],
    };
    const merge: SavedMergeQuery = {
        primarySourceId: 'a',
        sources: [
            {
                id: 'b',
                kind: 'query',
                metricQuery: {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_month'],
                    metrics: ['payments_unique_payment_count'],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
            },
            { id: 'a', kind: 'chart' },
        ],
        joinKey: [
            {
                name: 'order_month',
                fieldIdBySourceId: {
                    a: 'orders_order_date_month',
                    b: 'payments_payment_month',
                },
            },
        ],
        joinType: MergeJoinType.FULL,
        tableCalculations: [],
    };

    test('lists an ordinary echo without a source', () => {
        const result = getDashboardTileFilterInfo({
            chartFilters: {},
            appliedDashboardFilters: {
                dimensions: [yearFilter],
                metrics: [],
                tableCalculations: [],
            },
            appliedDashboardFiltersBySourceId: undefined,
            merge: null,
            explore,
        });

        expect(result.appliedFilterItems).toEqual([
            { filterRule: yearFilter, sourceId: null, sourceExploreName: null },
        ]);
    });

    test('lists a merged echo per source, primary first', () => {
        const result = getDashboardTileFilterInfo({
            chartFilters: {},
            appliedDashboardFilters: {
                dimensions: [yearFilter, paymentMonthFilter],
                metrics: [],
                tableCalculations: [],
            },
            appliedDashboardFiltersBySourceId: {
                b: {
                    dimensions: [paymentMonthFilter, yearFilter],
                    metrics: [],
                    tableCalculations: [],
                },
                a: {
                    dimensions: [yearFilter],
                    metrics: [],
                    tableCalculations: [],
                },
            },
            merge,
            explore,
        });

        expect(result.appliedFilterItems).toEqual([
            {
                filterRule: yearFilter,
                sourceId: 'a',
                sourceExploreName: 'orders',
            },
            {
                filterRule: paymentMonthFilter,
                sourceId: 'b',
                sourceExploreName: 'payments',
            },
            {
                filterRule: yearFilter,
                sourceId: 'b',
                sourceExploreName: 'payments',
            },
        ]);
    });

    test('falls back to the flat echo when a merged tile has no per-source echo', () => {
        const result = getDashboardTileFilterInfo({
            chartFilters: {},
            appliedDashboardFilters: {
                dimensions: [yearFilter],
                metrics: [],
                tableCalculations: [],
            },
            appliedDashboardFiltersBySourceId: undefined,
            merge,
            explore,
        });

        expect(result.appliedFilterItems).toEqual([
            { filterRule: yearFilter, sourceId: null, sourceExploreName: null },
        ]);
    });
});
