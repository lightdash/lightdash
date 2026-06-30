import {
    FilterOperator,
    type ModelRequiredFilterRule,
} from '@lightdash/common';
import { getExploreRequiredFilters } from './requiredFilters';

describe('requiredFilters', () => {
    it('rehydrates base-table and join required filters with field ids', () => {
        const requiredFilters: ModelRequiredFilterRule[] = [
            {
                id: 'filter-1',
                target: { fieldRef: 'status' },
                operator: FilterOperator.EQUALS,
                values: ['active'],
            },
            {
                id: 'filter-2',
                target: {
                    tableName: 'users',
                    fieldRef: 'country',
                },
                operator: FilterOperator.INCLUDE,
                values: ['US', 'CA'],
                settings: { completed: true },
                required: false,
            },
        ];

        expect(
            getExploreRequiredFilters({
                baseTable: 'orders',
                tables: {
                    orders: { requiredFilters },
                },
            }),
        ).toEqual([
            {
                fieldId: 'orders_status',
                fieldRef: 'status',
                tableName: 'orders',
                operator: FilterOperator.EQUALS,
                values: ['active'],
                settings: undefined,
                required: true,
            },
            {
                fieldId: 'users_country',
                fieldRef: 'country',
                tableName: 'users',
                operator: FilterOperator.INCLUDE,
                values: ['US', 'CA'],
                settings: { completed: true },
                required: false,
            },
        ]);
    });

    it('returns an empty array when an explore has no required filters', () => {
        expect(
            getExploreRequiredFilters({
                baseTable: 'orders',
                tables: {
                    orders: {},
                },
            }),
        ).toEqual([]);
    });
});
