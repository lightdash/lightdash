import {
    ConditionalOperator,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { createOverrideDashboardSavedFiltersUrlSubParam } from './dashboardSavedFiltersOverride';

describe('dashboardSavedFiltersOverride', () => {
    it('should override a boolean saved filter', () => {
        const originalBooleanFilter: DashboardFilterRule = {
            id: 'e7df7c5a-1070-439a-8300-125fe5f9b1af',
            target: {
                fieldId: 'orders_is_completed',
                tableName: 'orders',
            },
            values: [true],
            label: 'Is Completed',
            operator: ConditionalOperator.EQUALS,
        };

        // Just Value changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalBooleanFilter,
                {
                    ...originalBooleanFilter,
                    values: [false],
                },
            ),
        ).toBe('orders_is_completed.equals:false');

        // Just Operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalBooleanFilter,
                {
                    ...originalBooleanFilter,
                    operator: ConditionalOperator.NULL,
                    values: [],
                },
            ),
        ).toBe('orders_is_completed.isNull');

        // Both Operator and value changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalBooleanFilter,
                {
                    ...originalBooleanFilter,
                    operator: ConditionalOperator.NOT_NULL,
                    values: [false],
                },
            ),
        ).toBe('orders_is_completed.notNull');

        // If no change to original filter, return null
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalBooleanFilter,
                originalBooleanFilter,
            ),
        ).toBeNull();
    });

    it('should override number saved filter', () => {
        const originalNumberFilter: DashboardFilterRule = {
            id: '59d6c5da-83e0-473a-bbf1-526bb257093e',
            target: {
                fieldId: 'orders_amount',
                tableName: 'orders',
            },
            values: ['20'],
            label: 'label1',
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        };

        // Just Value changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalNumberFilter,
                {
                    ...originalNumberFilter,
                    values: ['30'],
                },
            ),
        ).toBe('orders_amount.equals:30');

        // Value changed to multiple values
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalNumberFilter,
                {
                    ...originalNumberFilter,
                    values: ['30', '40'],
                },
            ),
        ).toBe('orders_amount.equals:30,40');

        // Value changed to multiple values & operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalNumberFilter,
                {
                    ...originalNumberFilter,
                    values: ['30', '40'],
                    operator: ConditionalOperator.NOT_EQUALS,
                },
            ),
        ).toBe('orders_amount.notEquals:30,40');

        // Just Operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalNumberFilter,
                {
                    ...originalNumberFilter,
                    operator: ConditionalOperator.NOT_NULL,
                },
            ),
        ).toBe('orders_amount.notNull');
    });

    it('should override string saved filter', () => {
        const originalStringFilter: DashboardFilterRule = {
            id: '52415189-3811-4704-80a3-696aaa73596b',
            operator: ConditionalOperator.EQUALS,
            target: {
                fieldId: 'payments_payment_method',
                tableName: 'payments',
            },
            label: 'label1',
            disabled: false,
            values: ['bank_transfer', 'coupon'],
        };

        // Just Value changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalStringFilter,
                {
                    ...originalStringFilter,
                    values: ['bank_transfer'],
                },
            ),
        ).toBe('payments_payment_method.equals:bank_transfer');

        // Value changed to multiple values
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalStringFilter,
                {
                    ...originalStringFilter,
                    values: ['coupon', 'card'],
                },
            ),
        ).toBe('payments_payment_method.equals:coupon,card');

        // Value changed to multiple values & operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalStringFilter,
                {
                    ...originalStringFilter,
                    operator: ConditionalOperator.NOT_EQUALS,
                    values: ['coupon', 'card', 'bank_transfer'],
                },
            ),
        ).toBe('payments_payment_method.notEquals:coupon,card,bank_transfer');

        // Just Operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalStringFilter,
                {
                    ...originalStringFilter,
                    operator: ConditionalOperator.NOT_NULL,
                },
            ),
        ).toBe('payments_payment_method.notNull');

        // Change values to strings that contain reserved characters
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalStringFilter,
                {
                    ...originalStringFilter,
                    values: [
                        'coupon',
                        'card',
                        'bank_transfer',
                        'cry$%^&;:?pto',
                    ],
                },
            ),
        ).toBe(
            'payments_payment_method.equals:coupon,card,bank_transfer,cry$%25%5E&;:?pto',
        );
    });

    it('should override date saved filter', () => {
        const originalDateDayFilter: DashboardFilterRule = {
            id: '74229589-0f53-4df2-ab98-2654d9254626',
            operator: ConditionalOperator.EQUALS,
            target: {
                fieldId: 'orders_order_date_day',
                tableName: 'orders',
            },
            label: 'Order Date Day',
            disabled: false,
            values: ['2023-10-01'],
        };

        // Just Value changed

        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateDayFilter,
                {
                    ...originalDateDayFilter,
                    values: ['2023-10-02'],
                },
            ),
        ).toBe('orders_order_date_day.equals:2023-10-02');

        // Just operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateDayFilter,
                {
                    ...originalDateDayFilter,
                    operator: ConditionalOperator.NOT_NULL,
                },
            ),
        ).toBe('orders_order_date_day.notNull');

        // Value changed to in the next x days
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateDayFilter,
                {
                    ...originalDateDayFilter,
                    operator: ConditionalOperator.IN_THE_NEXT,
                    values: [1],
                    settings: {
                        unitOfTime: 'days',
                        completed: false,
                    },
                },
            ),
        ).toBe(
            'orders_order_date_day.inTheNext:1;unitOfTime:days;completed:false',
        );

        // Value changed to in the past x completed months
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateDayFilter,
                {
                    ...originalDateDayFilter,
                    operator: ConditionalOperator.IN_THE_PAST,
                    values: [2],
                    settings: {
                        unitOfTime: 'months',
                        completed: true,
                    },
                },
            ),
        ).toBe(
            'orders_order_date_day.inThePast:2;unitOfTime:months;completed:true',
        );

        const originalDateDayFilterWithInThePast: DashboardFilterRule = {
            id: '74229589-0f53-4df2-ab98-2654d9254626',
            operator: ConditionalOperator.IN_THE_PAST,
            values: [2],
            settings: {
                unitOfTime: 'months',
                completed: true,
            },
            target: {
                fieldId: 'orders_order_date_day',
                tableName: 'orders',
            },
            label: 'Order Date Day',
            disabled: false,
        };

        // Settings changed to in the past x non-complete months
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateDayFilterWithInThePast,
                {
                    ...originalDateDayFilterWithInThePast,
                    settings: {
                        unitOfTime: 'months',
                        completed: false,
                    },
                },
            ),
            // Should still keep the operator and all settings
        ).toBe(
            'orders_order_date_day.inThePast;unitOfTime:months;completed:false',
        );

        // Operator changed to on or after x date
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateDayFilterWithInThePast,
                {
                    ...originalDateDayFilterWithInThePast,
                    operator: ConditionalOperator.GREATER_THAN_OR_EQUAL,
                    settings: undefined,
                    values: ['2023-10-01'],
                },
            ),
        ).toBe('orders_order_date_day.greaterThanOrEqual:2023-10-01');

        // For a week date
        const originalDateWeekFilter: DashboardFilterRule = {
            id: '7a0ad8c6-f136-4b28-9b13-4a8d848e6730',
            label: 'Created Week',
            target: {
                fieldId: 'customers_created_week',
                tableName: 'customers',
            },
            values: ['2023-09-28T00:00:00.000Z'],
            disabled: false,
            operator: ConditionalOperator.EQUALS,
        };

        // Value and operator changed
        expect(
            createOverrideDashboardSavedFiltersUrlSubParam(
                originalDateWeekFilter,
                {
                    ...originalDateWeekFilter,
                    values: ['2023-10-22', '2023-11-03'],
                    operator: ConditionalOperator.IN_BETWEEN,
                },
            ),
        ).toBe('customers_created_week.inBetween:2023-10-22,2023-11-03');
    });
});
