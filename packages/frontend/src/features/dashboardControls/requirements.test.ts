import {
    FilterOperator,
    FilterType,
    UnitOfTime,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addAlternative,
    clearRuleRequired,
    getAlternativeIds,
    isLockedRequiredMissingValue,
    removeAlternative,
    setRuleRequired,
} from './requirements';

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
    it('marks a single filter as required', () => {
        expect(setRuleRequired(rule('a'), null)).toEqual(
            expect.objectContaining({
                required: true,
                requiredGroupId: undefined,
                disabled: true,
            }),
        );
    });

    it('keeps a default value as a temporary one when it requires the filter', () => {
        expect(
            setRuleRequired(
                rule('a', { disabled: false, values: ['x'] }),
                null,
            ),
        ).toEqual(
            expect.objectContaining({
                required: true,
                disabled: false,
                values: ['x'],
            }),
        );
    });

    it('switches off a default that was on with no value when it requires the filter', () => {
        expect(
            setRuleRequired(rule('a', { disabled: false }), null).disabled,
        ).toBe(true);
    });

    it('restores the group the filter was saved in', () => {
        expect(
            setRuleRequired(
                rule('a', { disabled: false, values: ['x'] }),
                rule('a', { requiredGroupId: 'g' }),
            ),
        ).toEqual(
            expect.objectContaining({
                required: false,
                requiredGroupId: 'g',
                disabled: true,
                values: [],
            }),
        );
    });

    it('requires a filter on its own when it was saved required with no group', () => {
        expect(
            setRuleRequired(rule('a'), rule('a', { required: true })),
        ).toEqual(
            expect.objectContaining({
                required: true,
                requiredGroupId: undefined,
            }),
        );
    });

    it('clears the temporary value and settings with the requirement', () => {
        const next = clearRuleRequired(
            rule('a', {
                required: true,
                disabled: false,
                operator: FilterOperator.IN_THE_PAST,
                values: [7],
                settings: { unitOfTime: UnitOfTime.days },
            }),
            FilterType.DATE,
            null,
        );
        expect(next).toEqual(
            expect.objectContaining({
                required: false,
                requiredGroupId: undefined,
                values: [],
                settings: undefined,
                disabled: false,
            }),
        );
    });

    it('leaves a required filter with no value off when the requirement goes', () => {
        const next = clearRuleRequired(
            rule('a', { requiredGroupId: 'g' }),
            FilterType.STRING,
            null,
        );
        expect(next).toEqual(
            expect.objectContaining({
                required: false,
                requiredGroupId: undefined,
                disabled: true,
                values: [],
            }),
        );
    });

    it('groups a filter with an alternative', () => {
        const next = addAlternative(
            [rule('a', { required: true }), rule('b'), rule('c')],
            'a',
            'b',
            'g1',
        );
        expect(next[0]).toEqual(
            expect.objectContaining({ required: false, requiredGroupId: 'g1' }),
        );
        expect(next[1]).toEqual(
            expect.objectContaining({
                required: false,
                requiredGroupId: 'g1',
                disabled: true,
                values: [],
            }),
        );
        expect(next[2].requiredGroupId).toBeUndefined();
        expect(getAlternativeIds(next, 'a')).toEqual(['b']);
    });

    it('reuses the existing group for a second alternative', () => {
        const grouped = addAlternative(
            [rule('a'), rule('b'), rule('c')],
            'a',
            'b',
            'g1',
        );
        const next = addAlternative(grouped, 'a', 'c', 'g2');
        expect(next.map((r) => r.requiredGroupId)).toEqual(['g1', 'g1', 'g1']);
    });

    it('takes an alternative out and leaves the other member in the rule', () => {
        const grouped = addAlternative([rule('a'), rule('b')], 'a', 'b', 'g1');
        const next = removeAlternative(grouped, 'b');
        expect(next[0]).toBe(grouped[0]);
        expect(next[1]).toEqual(
            expect.objectContaining({
                required: false,
                requiredGroupId: undefined,
            }),
        );
    });

    it('clears the values of both filters it groups', () => {
        const next = addAlternative(
            [
                rule('a', { required: true, disabled: false, values: ['x'] }),
                rule('b'),
            ],
            'a',
            'b',
            'g1',
        );
        expect(next[0]).toEqual(
            expect.objectContaining({ disabled: true, values: [] }),
        );
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
