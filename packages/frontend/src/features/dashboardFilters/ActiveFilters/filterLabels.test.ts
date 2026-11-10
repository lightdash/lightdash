import {
    DimensionType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getFilterRuleLabels, showsComposedFilterValue } from './filterLabels';

const rule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'a',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
    ...overrides,
});

const statusField = {
    name: 'status',
    table: 'orders',
    tableLabel: 'Orders',
    label: 'Status',
    type: DimensionType.STRING,
    fieldType: 'dimension',
} as DashboardFilterableField;

const getUiString = (key: string) => key;

describe('getFilterRuleLabels', () => {
    it('names a field by its label', () => {
        expect(
            getFilterRuleLabels(rule(), statusField, {}, getUiString).field,
        ).toBe('Status');
    });

    it('names a SQL column a tile reported, with its type', () => {
        const labels = getFilterRuleLabels(
            rule({
                operator: FilterOperator.GREATER_THAN,
                target: {
                    fieldId: 'amount',
                    tableName: 'sql',
                    isSqlColumn: true,
                },
                values: [10],
            }),
            undefined,
            {
                'tile-1': {
                    columns: [
                        { reference: 'amount', type: DimensionType.NUMBER },
                    ],
                },
            },
            getUiString,
        );

        expect(labels.field).toBe('amount');
        expect(labels.value).toBe('10');
    });

    it('falls back to the field id and the type on the target', () => {
        const labels = getFilterRuleLabels(
            rule({
                target: {
                    fieldId: 'created',
                    tableName: 'sql',
                    isSqlColumn: true,
                    fallbackType: DimensionType.DATE,
                },
                values: ['2025-07-06'],
            }),
            undefined,
            {},
            getUiString,
        );

        expect(labels.field).toBe('created');
    });
});

describe('showsComposedFilterValue', () => {
    it('is true for dates and booleans, from the field or the target', () => {
        expect(showsComposedFilterValue(DimensionType.STRING, undefined)).toBe(
            false,
        );
        expect(showsComposedFilterValue(undefined, undefined)).toBe(false);
        expect(showsComposedFilterValue(DimensionType.BOOLEAN, undefined)).toBe(
            true,
        );
        expect(showsComposedFilterValue(DimensionType.DATE, undefined)).toBe(
            true,
        );
        expect(
            showsComposedFilterValue(undefined, DimensionType.TIMESTAMP),
        ).toBe(true);
    });
});
