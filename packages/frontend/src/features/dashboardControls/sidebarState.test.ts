import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    canKeepFilterRule,
    findFilterRule,
    isFilterRuleDirty,
    isPlaceholderRule,
    PLACEHOLDER_TARGET,
    removeFilterRule,
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
    dimensions: [rule('a', ['1'])],
    metrics: [rule('m', ['2'])],
    tableCalculations: [],
};

describe('sidebarState', () => {
    it('finds a rule among dimensions and metrics', () => {
        expect(findFilterRule(filters, 'a')?.id).toBe('a');
        expect(findFilterRule(filters, 'm')?.id).toBe('m');
        expect(findFilterRule(filters, 'x')).toBeNull();
    });

    it('replaces and removes a rule by id, leaving the others', () => {
        const replaced = replaceFilterRule(filters, rule('m', ['9']));
        expect(replaced.metrics[0].values).toEqual(['9']);
        expect(replaced.dimensions).toEqual(filters.dimensions);
        expect(removeFilterRule(filters, 'a').dimensions).toEqual([]);
        expect(removeFilterRule(filters, 'a').metrics).toEqual(filters.metrics);
    });

    it('reports a rule dirty only when it differs from the snapshot', () => {
        expect(isFilterRuleDirty(filters, filters, 'a')).toBe(false);
        expect(
            isFilterRuleDirty(
                filters,
                replaceFilterRule(filters, rule('a', ['9'])),
                'a',
            ),
        ).toBe(true);
    });

    it('recognises a placeholder by its empty target', () => {
        expect(isPlaceholderRule(rule('a', []))).toBe(false);
        expect(
            isPlaceholderRule({ ...rule('a', []), target: PLACEHOLDER_TARGET }),
        ).toBe(true);
    });

    it('a filter is kept once it has a field, with or without a label', () => {
        expect(canKeepFilterRule(rule('a', []))).toBe(true);
        expect(canKeepFilterRule({ ...rule('a', []), label: 'A' })).toBe(true);
        expect(
            canKeepFilterRule({
                ...rule('a', []),
                label: 'A',
                target: PLACEHOLDER_TARGET,
            }),
        ).toBe(false);
    });
});
