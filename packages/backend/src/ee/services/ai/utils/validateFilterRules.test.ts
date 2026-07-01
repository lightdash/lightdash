import { FilterOperator, type FilterRule } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { mockOrdersExplore } from './validationExplore.mock';
import { validateFilterRules } from './validators';

const filterOn = (fieldId: string): FilterRule =>
    ({
        id: 'rule-1',
        target: { fieldId },
        operator: FilterOperator.EQUALS,
        values: ['x'],
    }) as FilterRule;

describe('validateFilterRules — unknown field suggestions', () => {
    it('names the closest existing field when a filter targets an unknown one', () => {
        // "orders_revenue_total" does not exist; the real field is
        // "orders_total_revenue" (same tokens, reordered).
        expect(() =>
            validateFilterRules(mockOrdersExplore, [
                filterOn('orders_revenue_total'),
            ]),
        ).toThrowError(/orders_total_revenue/);
    });

    it('still reports the field does not exist', () => {
        expect(() =>
            validateFilterRules(mockOrdersExplore, [
                filterOn('orders_revenue_total'),
            ]),
        ).toThrowError(/does not exist/);
    });

    it('accepts a valid filter field without throwing', () => {
        expect(() =>
            validateFilterRules(mockOrdersExplore, [
                filterOn('orders_customer_name'),
            ]),
        ).not.toThrow();
    });
});
