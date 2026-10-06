import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    addAlternative,
    clearRequired,
    getAlternativeIds,
    getRequiredIneligibilityReason,
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
        expect(setRuleRequired(rule('a', { requiredGroupId: 'g' }))).toEqual(
            expect.objectContaining({
                required: true,
                requiredGroupId: undefined,
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

    it('falls back to a single requirement when the last alternative goes', () => {
        const grouped = addAlternative([rule('a'), rule('b')], 'a', 'b', 'g1');
        const next = removeAlternative(grouped, 'b');
        expect(next[0]).toEqual(
            expect.objectContaining({
                required: true,
                requiredGroupId: undefined,
            }),
        );
        expect(next[1]).toEqual(
            expect.objectContaining({
                required: false,
                requiredGroupId: undefined,
            }),
        );
    });

    it('clears a requirement and keeps the other member required', () => {
        const grouped = addAlternative([rule('a'), rule('b')], 'a', 'b', 'g1');
        const next = clearRequired(grouped, 'a');
        expect(next[0].required).toBe(false);
        expect(next[0].requiredGroupId).toBeUndefined();
        expect(next[1].required).toBe(true);
    });

    it('explains why a filter is not eligible', () => {
        expect(getRequiredIneligibilityReason(rule('a'), ['t1'])).toBeNull();
        expect(
            getRequiredIneligibilityReason(
                rule('a', { disabled: false, values: ['x'] }),
                ['t1'],
            ),
        ).toMatch(/default value/);
        expect(
            getRequiredIneligibilityReason(
                rule('a', { lockedTabUuids: ['t1', 't2'] }),
                ['t1', 't2'],
            ),
        ).toMatch(/Locked or hidden on every tab/);
        expect(
            getRequiredIneligibilityReason(
                rule('a', { lockedTabUuids: ['t1'] }),
                ['t1', 't2'],
            ),
        ).toBeNull();
    });
});
