import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    canKeepFilterRule,
    findFilterRule,
    isDefaultValueIncomplete,
    isFilterRuleDirty,
    isPlaceholderRule,
    PLACEHOLDER_TARGET,
    haveFiltersChangedSince,
    removeFilterRule,
    replaceFilterRule,
    restoreFilterRule,
    withFilterRuleLabel,
} from './sidebarState';

const rule = (id: string, values: unknown[]): DashboardFilterRule => ({
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

    it('restores one rule and leaves what was written to the others', () => {
        const snapshot = filters;
        const current = replaceFilterRule(
            replaceFilterRule(filters, rule('a', ['edited'])),
            rule('m', ['written elsewhere']),
        );
        const restored = restoreFilterRule(current, snapshot, 'a');
        expect(findFilterRule(restored, 'a')).toBe(
            findFilterRule(snapshot, 'a'),
        );
        expect(findFilterRule(restored, 'm')?.values).toEqual([
            'written elsewhere',
        ]);
    });

    it('restoring a rule the snapshot does not hold removes it', () => {
        const added = {
            ...filters,
            dimensions: [...filters.dimensions, rule('new', [])],
        };
        expect(restoreFilterRule(added, filters, 'new')).toEqual(filters);
    });

    it('stays changed when anything but the undone rule differs', () => {
        const snapshot = {
            dashboardFilters: filters,
            haveFiltersChanged: false,
        };
        expect(haveFiltersChangedSince(snapshot, filters)).toBe(false);
        expect(
            haveFiltersChangedSince(
                snapshot,
                replaceFilterRule(filters, rule('m', ['other'])),
            ),
        ).toBe(true);
        expect(
            haveFiltersChangedSince(
                { ...snapshot, haveFiltersChanged: true },
                filters,
            ),
        ).toBe(true);
    });

    it('an emptied label leaves the rule as it was found', () => {
        const withKey = rule('a', []);
        // As a saved rule arrives: JSON has no undefined
        const withoutKey: DashboardFilterRule = JSON.parse(
            JSON.stringify(withKey),
        );

        const typed = withFilterRuleLabel(withoutKey, 'Status', false);
        expect(typed.label).toBe('Status');
        const reverted = withFilterRuleLabel(typed, '', false);
        expect(reverted).toEqual(withoutKey);
        expect('label' in reverted).toBe(false);

        expect(
            withFilterRuleLabel(
                withFilterRuleLabel(withKey, 'Status', true),
                '   ',
                true,
            ),
        ).toEqual(withKey);
    });

    it('trims the outer spaces of a label', () => {
        expect(
            withFilterRuleLabel(rule('a', []), '  Order status ', true).label,
        ).toBe('Order status');
    });

    it('reads a default value as the shipped form does', () => {
        // "(null)" alone is a value
        expect(
            isDefaultValueIncomplete({ ...rule('a', []), includeNull: true }),
        ).toBe(false);
        // Half a range is not
        expect(
            isDefaultValueIncomplete({
                ...rule('a', [5, undefined]),
                operator: FilterOperator.IN_BETWEEN,
            }),
        ).toBe(true);
        // Neither is a relative date with no unit
        expect(
            isDefaultValueIncomplete({
                ...rule('a', [3]),
                operator: FilterOperator.IN_THE_PAST,
            }),
        ).toBe(true);
    });

    it('a default value is incomplete only when enabled and empty', () => {
        expect(isDefaultValueIncomplete(rule('a', []))).toBe(true);
        expect(isDefaultValueIncomplete(rule('a', ['1']))).toBe(false);
        expect(
            isDefaultValueIncomplete({ ...rule('a', []), disabled: true }),
        ).toBe(false);
        expect(
            isDefaultValueIncomplete({
                ...rule('a', []),
                operator: FilterOperator.NULL,
            }),
        ).toBe(false);
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
