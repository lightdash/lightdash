import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isLockedRequiredMissingValue } from '../dashboardFilters/FilterConfiguration/utils';
import { getAlternativeIds, isRuleRequired } from './requirements';

const rule = (
    id: string,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `field_${id}`, tableName: 'orders' },
    tileTargets: {},
    disabled: true,
    values: [],
    ...overrides,
});

describe('requirements', () => {
    it('reads a filter in a shared rule as required', () => {
        expect(isRuleRequired(rule('a', { required: true }))).toBe(true);
        expect(isRuleRequired(rule('a', { requiredGroupId: 'g' }))).toBe(true);
        expect(isRuleRequired(rule('a'))).toBe(false);
    });

    it('lists the other members of the rule a filter is in', () => {
        const rules = [
            rule('a', { requiredGroupId: 'g' }),
            rule('b', { requiredGroupId: 'g' }),
            rule('c', { requiredGroupId: 'h' }),
            rule('d'),
        ];
        expect(getAlternativeIds(rules, 'a')).toEqual(['b']);
        expect(getAlternativeIds(rules, 'd')).toEqual([]);
    });

    it('knows a filter no viewer can satisfy, by the shipped rule', () => {
        const locked = { lockedTabUuids: ['t1'] };
        expect(
            isLockedRequiredMissingValue(
                rule('a', { ...locked, required: true }),
            ),
        ).toBe(true);
        expect(
            isLockedRequiredMissingValue(rule('a', { required: true })),
        ).toBe(false);
        expect(isLockedRequiredMissingValue(rule('a', locked))).toBe(false);
        expect(
            isLockedRequiredMissingValue(
                rule('a', {
                    ...locked,
                    required: true,
                    disabled: false,
                    values: ['x'],
                }),
            ),
        ).toBe(false);
        expect(
            isLockedRequiredMissingValue(
                rule('a', {
                    ...locked,
                    required: true,
                    operator: FilterOperator.NULL,
                }),
            ),
        ).toBe(false);
        // As shipped, a member of a shared rule is not covered
        expect(
            isLockedRequiredMissingValue(
                rule('a', { ...locked, requiredGroupId: 'g' }),
            ),
        ).toBe(false);
    });
});
