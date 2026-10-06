import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    findFilterRule,
    isFilterRuleDirty,
    replaceFilterRule,
} from './sidebarState';

const rule = (id: string, values: string[]): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    values,
});

const filters: DashboardFilters = {
    dimensions: [rule('a', ['1']), rule('b', ['2'])],
    metrics: [rule('m', ['3'])],
    tableCalculations: [],
};

describe('sidebarState', () => {
    it('finds dimension and metric rules by id, null when missing', () => {
        expect(findFilterRule(filters, 'b')?.values).toEqual(['2']);
        expect(findFilterRule(filters, 'm')?.values).toEqual(['3']);
        expect(findFilterRule(filters, 'missing')).toBeNull();
    });

    it('replaces only the rule with the same id and keeps the input intact', () => {
        const next = replaceFilterRule(filters, rule('m', ['9']));
        expect(next.metrics[0].values).toEqual(['9']);
        expect(next.dimensions).toEqual(filters.dimensions);
        expect(filters.metrics[0].values).toEqual(['3']);
    });

    it('reports dirty only when the edited rule differs from the snapshot', () => {
        expect(isFilterRuleDirty(filters, filters, 'a')).toBe(false);
        const edited = replaceFilterRule(filters, {
            ...rule('a', ['1']),
            label: 'Order',
        });
        expect(isFilterRuleDirty(filters, edited, 'a')).toBe(true);
        expect(isFilterRuleDirty(filters, edited, 'b')).toBe(false);
    });
});
