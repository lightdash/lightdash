import {
    FilterOperator,
    type DashboardFilters,
    type Explore,
    type Filters,
} from '@lightdash/common';
import { getDashboardTileFilterInfo } from './getDashboardTileFilterInfo';

const explore = {
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
            explore,
        });

        expect(result.appliedFilterRules).toHaveLength(1);
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
});
