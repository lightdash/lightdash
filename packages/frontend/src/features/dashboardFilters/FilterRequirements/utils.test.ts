import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getDashboardFilterRuleLabel,
    getFilterRequirementRules,
    getRequirementIneligibilityReason,
    isRequirementRuleSatisfied,
    shouldShowLegacyLockedState,
} from './utils';

const createRule = (
    overrides: Partial<DashboardFilterRule> & { id: string },
): DashboardFilterRule => ({
    target: {
        fieldId: 'customers_first_name',
        tableName: 'customers',
    },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
    ...overrides,
});

describe('getFilterRequirementRules', () => {
    it('returns no rules when no filter is required or grouped', () => {
        expect(
            getFilterRequirementRules({
                dimensions: [createRule({ id: 'a' })],
                metrics: [createRule({ id: 'b' })],
            }),
        ).toEqual([]);
    });

    it('groups dimension and metric filters sharing a requiredGroupId', () => {
        const a = createRule({ id: 'a', requiredGroupId: 'g1' });
        const b = createRule({ id: 'b' });
        const c = createRule({ id: 'c', requiredGroupId: 'g1' });

        expect(
            getFilterRequirementRules({ dimensions: [a, b], metrics: [c] }),
        ).toEqual([{ type: 'group', id: 'g1', members: [a, c] }]);
    });

    it('returns a required filter as a one-member rule', () => {
        const a = createRule({ id: 'a', required: true });

        expect(
            getFilterRequirementRules({ dimensions: [a], metrics: [] }),
        ).toEqual([{ type: 'single', id: 'a', members: [a] }]);
    });

    it('returns rules in first-appearance order, interleaving required filters and groups', () => {
        const a = createRule({ id: 'a', requiredGroupId: 'g2' });
        const b = createRule({ id: 'b', required: true });
        const c = createRule({ id: 'c', requiredGroupId: 'g2' });

        expect(
            getFilterRequirementRules({ dimensions: [a, b, c], metrics: [] }),
        ).toEqual([
            { type: 'group', id: 'g2', members: [a, c] },
            { type: 'single', id: 'b', members: [b] },
        ]);
    });

    it('treats a filter with both flags as required, not a group member', () => {
        const a = createRule({
            id: 'a',
            required: true,
            requiredGroupId: 'g1',
        });
        const b = createRule({ id: 'b', requiredGroupId: 'g1' });

        expect(
            getFilterRequirementRules({ dimensions: [a, b], metrics: [] }),
        ).toEqual([
            { type: 'single', id: 'a', members: [a] },
            { type: 'group', id: 'g1', members: [b] },
        ]);
    });
});

describe('getRequirementIneligibilityReason', () => {
    it('is eligible when valueless and not in a rule', () => {
        expect(
            getRequirementIneligibilityReason(createRule({ id: 'a' })),
        ).toBeNull();
    });

    it('is eligible when enabled but valueless', () => {
        expect(
            getRequirementIneligibilityReason(
                createRule({ id: 'a', disabled: false }),
            ),
        ).toBeNull();
    });

    it('is ineligible when already a member of a rule', () => {
        expect(
            getRequirementIneligibilityReason(
                createRule({ id: 'a', requiredGroupId: 'g1' }),
            ),
        ).toBe('Already part of a filter rule');
    });

    it('is ineligible when individually required', () => {
        expect(
            getRequirementIneligibilityReason(
                createRule({ id: 'a', required: true }),
            ),
        ).toBe('Already part of a filter rule');
    });

    it('is ineligible when it has a default value', () => {
        expect(
            getRequirementIneligibilityReason(
                createRule({ id: 'a', disabled: false, values: ['adam'] }),
            ),
        ).toBe('Has a default value, so the rule would always be satisfied');
    });
});

describe('getDashboardFilterRuleLabel', () => {
    const field = {
        name: 'first_name',
        type: DimensionType.STRING,
        table: 'customers',
        tableLabel: 'Customers',
        label: 'First name',
        fieldType: FieldType.DIMENSION,
        sql: 'first_name',
        hidden: false,
    } as unknown as FilterableItem;

    it('prefers the custom filter label', () => {
        expect(
            getDashboardFilterRuleLabel(
                createRule({ id: 'a', label: 'My label' }),
                { customers_first_name: field },
            ),
        ).toBe('My label');
    });

    it('falls back to the field label', () => {
        expect(
            getDashboardFilterRuleLabel(createRule({ id: 'a' }), {
                customers_first_name: field,
            }),
        ).toBe('First name');
    });

    it('falls back to the field id when the field is unknown', () => {
        expect(getDashboardFilterRuleLabel(createRule({ id: 'a' }), {})).toBe(
            'customers_first_name',
        );
    });
});

describe('isRequirementRuleSatisfied', () => {
    it('is unsatisfied while every member is disabled', () => {
        expect(
            isRequirementRuleSatisfied({
                type: 'group',
                id: 'g1',
                members: [createRule({ id: 'a' }), createRule({ id: 'b' })],
            }),
        ).toBe(false);
    });

    it('is satisfied when any member has a value', () => {
        expect(
            isRequirementRuleSatisfied({
                type: 'group',
                id: 'g1',
                members: [
                    createRule({ id: 'a' }),
                    createRule({ id: 'b', disabled: false, values: ['x'] }),
                ],
            }),
        ).toBe(true);
    });
});

describe('shouldShowLegacyLockedState', () => {
    it('never shows while the flag query is unresolved', () => {
        expect(
            shouldShowLegacyLockedState({
                isFlagResolved: false,
                isFilterRequirementsEnabled: false,
            }),
        ).toBe(false);
        expect(
            shouldShowLegacyLockedState({
                isFlagResolved: false,
                isFilterRequirementsEnabled: true,
            }),
        ).toBe(false);
    });

    it('shows once the flag resolves disabled', () => {
        expect(
            shouldShowLegacyLockedState({
                isFlagResolved: true,
                isFilterRequirementsEnabled: false,
            }),
        ).toBe(true);
    });

    it('does not show when the flag resolves enabled', () => {
        expect(
            shouldShowLegacyLockedState({
                isFlagResolved: true,
                isFilterRequirementsEnabled: true,
            }),
        ).toBe(false);
    });
});
