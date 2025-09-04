import cloneDeep from 'lodash/cloneDeep';
import { DimensionType } from './field';
import {
    applyDimensionOverrides,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTileTarget,
    FilterOperator,
} from './filter';

describe('applyDimensionOverrides', () => {
    // Test fixtures
    const createBaseDashboardFilter = (
        id: string,
        fieldId: string,
        tableName: string,
        values: string[] = ['value1'],
        tileTargets: Record<string, DashboardTileTarget> = {},
    ): DashboardFilterRule => ({
        id,
        label: `Label for ${fieldId}`,
        operator: FilterOperator.EQUALS,
        target: {
            fieldId,
            tableName,
        },
        tileTargets,
        disabled: false,
        values,
    });

    const createOverrideFilter = (
        id: string,
        fieldId: string,
        tableName: string,
        values: string[] = ['overrideValue'],
        operator: FilterOperator = FilterOperator.EQUALS,
    ): DashboardFilterRule => ({
        id,
        label: `Override for ${fieldId}`,
        operator,
        target: {
            fieldId,
            tableName,
        },
        disabled: false,
        values,
    });

    const baseDashboardFilters: DashboardFilters = {
        dimensions: [
            createBaseDashboardFilter(
                'filter-1',
                'customers_customer_id',
                'customers',
                ['123', '456'],
                {
                    'tile-1': {
                        fieldId: 'customers_customer_id',
                        tableName: 'customers',
                    },
                    'tile-2': false,
                },
            ),
            createBaseDashboardFilter(
                'filter-2',
                'orders_status',
                'orders',
                ['completed'],
                {
                    'tile-1': {
                        fieldId: 'orders_status',
                        tableName: 'orders',
                    },
                },
            ),
        ],
        metrics: [],
        tableCalculations: [],
    };

    describe('when overrides is an array of DashboardFilterRule[]', () => {
        it('should apply overrides to existing dimensions while preserving tileTargets', () => {
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-1',
                    'customers_customer_id',
                    'customers',
                    ['789'], // different values
                    FilterOperator.IN_BETWEEN, // different operator
                ),
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: 'filter-1',
                label: 'Override for customers_customer_id',
                operator: FilterOperator.IN_BETWEEN,
                target: {
                    fieldId: 'customers_customer_id',
                    tableName: 'customers',
                },
                disabled: false,
                values: ['789'],
                // tileTargets should be preserved from original
                tileTargets: {
                    'tile-1': {
                        fieldId: 'customers_customer_id',
                        tableName: 'customers',
                    },
                    'tile-2': false,
                },
            });
            // Second filter should remain unchanged
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);
        });

        it('should add new dimensions that do not exist in dashboard filters', () => {
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-3',
                    'products_category',
                    'products',
                    ['electronics'],
                ),
                createOverrideFilter(
                    'filter-4',
                    'users_age',
                    'users',
                    ['25'],
                    FilterOperator.GREATER_THAN,
                ),
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(4);
            // Original filters should remain
            expect(result.slice(0, 2)).toEqual(baseDashboardFilters.dimensions);
            // New filters should be added
            expect(result[2]).toEqual(overrides[0]);
            expect(result[3]).toEqual(overrides[1]);
        });

        it('should handle mixed scenario: override existing and add new', () => {
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-1',
                    'customers_customer_id',
                    'customers',
                    ['999'],
                    FilterOperator.NOT_EQUALS,
                ),
                createOverrideFilter('filter-3', 'new_field', 'new_table', [
                    'new_value',
                ]),
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(3);
            // First filter should be overridden
            expect(result[0].values).toEqual(['999']);
            expect(result[0].operator).toBe(FilterOperator.NOT_EQUALS);
            expect(result[0].tileTargets).toEqual(
                baseDashboardFilters.dimensions[0].tileTargets,
            );
            // Second filter should remain unchanged
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);
            // Third filter should be new
            expect(result[2]).toEqual(overrides[1]);
        });

        it('should handle empty overrides array', () => {
            const overrides: DashboardFilterRule[] = [];
            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );
            expect(result).toEqual(baseDashboardFilters.dimensions);
        });

        it('should handle overrides with complex tileTargets', () => {
            const complexTileTargets: Record<string, DashboardTileTarget> = {
                'tile-1': {
                    fieldId: 'mapped_field',
                    tableName: 'mapped_table',
                    isSqlColumn: true,
                },
                'tile-2': false,
                'tile-3': {
                    fieldId: 'another_field',
                    tableName: 'another_table',
                    fallbackType: DimensionType.STRING,
                },
            };

            const dashboardWithComplexTileTargets: DashboardFilters = {
                ...baseDashboardFilters,
                dimensions: [
                    createBaseDashboardFilter(
                        'complex-filter',
                        'complex_field',
                        'complex_table',
                        ['value'],
                        complexTileTargets,
                    ),
                ],
            };

            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'complex-filter',
                    'complex_field',
                    'complex_table',
                    ['override_value'],
                ),
            ];

            const result = applyDimensionOverrides(
                dashboardWithComplexTileTargets,
                overrides,
            );

            expect(result[0].tileTargets).toEqual(complexTileTargets);
            expect(result[0].values).toEqual(['override_value']);
        });
    });

    describe('when overrides is a DashboardFilters object', () => {
        it('should use dimensions array from DashboardFilters', () => {
            const overrides: DashboardFilters = {
                dimensions: [
                    createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                        ['override_from_object'],
                    ),
                ],
                metrics: [
                    // These should be ignored when applying dimension overrides
                    createOverrideFilter('metric-1', 'revenue', 'orders', [
                        '1000',
                    ]),
                ],
                tableCalculations: [],
            };

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result).toHaveLength(2);
            expect(result[0].values).toEqual(['override_from_object']);
            expect(result[0].tileTargets).toEqual(
                baseDashboardFilters.dimensions[0].tileTargets,
            );
            // Second filter should remain unchanged
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);
        });

        it('should work with empty dimensions array in DashboardFilters', () => {
            const overrides: DashboardFilters = {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );
            expect(result).toEqual(baseDashboardFilters.dimensions);
        });
    });

    describe('edge cases', () => {
        it('should handle empty dashboard dimensions', () => {
            const emptyDashboard: DashboardFilters = {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };

            const overrides: DashboardFilterRule[] = [
                createOverrideFilter('new-filter', 'field', 'table'),
            ];

            const result = applyDimensionOverrides(emptyDashboard, overrides);
            expect(result).toEqual(overrides);
        });

        it('should handle filters with same id but different field properties', () => {
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                    ),
                    label: 'Completely different label',
                    disabled: true,
                    required: true,
                    singleValue: true,
                    settings: { someCustomSetting: 'value' },
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result[0]).toEqual({
                ...overrides[0],
                tileTargets: baseDashboardFilters.dimensions[0].tileTargets,
            });
        });

        it('should not modify original dashboard filters', () => {
            const originalFilters = cloneDeep(baseDashboardFilters);
            const overrides: DashboardFilterRule[] = [
                createOverrideFilter(
                    'filter-1',
                    'customers_customer_id',
                    'customers',
                ),
            ];

            applyDimensionOverrides(baseDashboardFilters, overrides);

            expect(baseDashboardFilters).toEqual(originalFilters);
        });

        it('should handle filters with different operator types', () => {
            const overrides: DashboardFilterRule[] = [
                {
                    ...createOverrideFilter(
                        'filter-1',
                        'customers_customer_id',
                        'customers',
                    ),
                    operator: FilterOperator.NULL,
                    values: undefined, // NULL operator doesn't need values
                },
                {
                    ...createOverrideFilter('filter-5', 'date_field', 'events'),
                    operator: FilterOperator.IN_THE_PAST,
                    values: [7], // number value for date operations
                    settings: {
                        unitOfTime: 'days',
                        completed: true,
                    },
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                overrides,
            );

            expect(result[0].operator).toBe(FilterOperator.NULL);
            expect(result[0].values).toBeUndefined();
            expect(result[2].operator).toBe(FilterOperator.IN_THE_PAST);
            expect(result[2].settings).toEqual({
                unitOfTime: 'days',
                completed: true,
            });
        });

        it('should preserve all properties from original tileTargets', () => {
            const complexDashboard: DashboardFilters = {
                dimensions: [
                    {
                        ...createBaseDashboardFilter(
                            'filter-1',
                            'field',
                            'table',
                        ),
                        tileTargets: {
                            'tile-1': {
                                fieldId: 'mapped_field',
                                tableName: 'mapped_table',
                                isSqlColumn: true,
                                fallbackType: DimensionType.NUMBER,
                            },
                        },
                    },
                ],
                metrics: [],
                tableCalculations: [],
            };

            const overrides: DashboardFilterRule[] = [
                createOverrideFilter('filter-1', 'field', 'table'),
            ];

            const result = applyDimensionOverrides(complexDashboard, overrides);

            expect(result[0].tileTargets).toEqual({
                'tile-1': {
                    fieldId: 'mapped_field',
                    tableName: 'mapped_table',
                    isSqlColumn: true,
                    fallbackType: 'number',
                },
            });
        });
    });

    describe('real-world scenarios', () => {
        it('should handle scheduler filter overrides scenario', () => {
            // Simulating a scenario where scheduled reports override dashboard filters
            const schedulerOverrides: DashboardFilterRule[] = [
                {
                    id: 'filter-1',
                    label: 'Scheduled Customer Filter',
                    operator: FilterOperator.EQUALS,
                    target: {
                        fieldId: 'customers_customer_id',
                        tableName: 'customers',
                    },
                    disabled: false,
                    values: ['scheduled_customer_123'],
                },
                {
                    id: 'scheduler-date-filter',
                    label: 'Last 30 Days',
                    operator: FilterOperator.IN_THE_PAST,
                    target: {
                        fieldId: 'orders_created_date',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: [30],
                    settings: {
                        unitOfTime: 'days',
                        completed: true,
                    },
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                schedulerOverrides,
            );

            expect(result).toHaveLength(3);
            // Override should be applied
            expect(result[0].values).toEqual(['scheduled_customer_123']);
            expect(result[0].label).toBe('Scheduled Customer Filter');
            expect(result[0].tileTargets).toEqual(
                baseDashboardFilters.dimensions[0].tileTargets,
            );

            // Original filter should remain
            expect(result[1]).toEqual(baseDashboardFilters.dimensions[1]);

            // New scheduler filter should be added
            expect(result[2]).toEqual(schedulerOverrides[1]);
        });

        it('should handle URL parameter override scenario', () => {
            // Simulating URL parameters overriding dashboard filters
            const urlOverrides: DashboardFilterRule[] = [
                {
                    id: 'filter-2',
                    label: 'Orders Status (from URL)',
                    operator: FilterOperator.INCLUDE,
                    target: {
                        fieldId: 'orders_status',
                        tableName: 'orders',
                    },
                    disabled: false,
                    values: ['completed', 'shipped', 'delivered'],
                },
            ];

            const result = applyDimensionOverrides(
                baseDashboardFilters,
                urlOverrides,
            );

            expect(result).toHaveLength(2);
            expect(result[1].operator).toBe(FilterOperator.INCLUDE);
            expect(result[1].values).toEqual([
                'completed',
                'shipped',
                'delivered',
            ]);
            expect(result[1].tileTargets).toEqual(
                baseDashboardFilters.dimensions[1].tileTargets,
            );
        });
    });
});
