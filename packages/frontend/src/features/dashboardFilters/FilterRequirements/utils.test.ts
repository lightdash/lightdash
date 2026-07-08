import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type FilterableItem,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getAlwaysRequiredFilters,
    getAlwaysRequiredIneligibilityReason,
    getDashboardFilterRuleLabel,
    getFilterRequirementRules,
    getRequirementIneligibilityReason,
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
    it('returns no rules when no filter has a requiredGroupId', () => {
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
        ).toEqual([{ groupId: 'g1', members: [a, c] }]);
    });

    it('returns multiple rules in first-appearance order', () => {
        const a = createRule({ id: 'a', requiredGroupId: 'g2' });
        const b = createRule({ id: 'b', requiredGroupId: 'g1' });
        const c = createRule({ id: 'c', requiredGroupId: 'g2' });

        expect(
            getFilterRequirementRules({ dimensions: [a, b, c], metrics: [] }),
        ).toEqual([
            { groupId: 'g2', members: [a, c] },
            { groupId: 'g1', members: [b] },
        ]);
    });
});

describe('getAlwaysRequiredFilters', () => {
    it('returns no filters when none are required', () => {
        expect(
            getAlwaysRequiredFilters({
                dimensions: [createRule({ id: 'a' })],
                metrics: [createRule({ id: 'b' })],
            }),
        ).toEqual([]);
    });

    it('returns required dimension and metric filters in filter order', () => {
        const a = createRule({ id: 'a', required: true });
        const b = createRule({ id: 'b' });
        const c = createRule({ id: 'c', required: true });

        expect(
            getAlwaysRequiredFilters({ dimensions: [a, b], metrics: [c] }),
        ).toEqual([a, c]);
    });

    it('does not include rule members that are not required', () => {
        const member = createRule({ id: 'a', requiredGroupId: 'g1' });

        expect(
            getAlwaysRequiredFilters({ dimensions: [member], metrics: [] }),
        ).toEqual([]);
    });
});

describe('getAlwaysRequiredIneligibilityReason', () => {
    it('is eligible when valueless and not a rule member', () => {
        expect(
            getAlwaysRequiredIneligibilityReason(createRule({ id: 'a' })),
        ).toBeNull();
    });

    it('is ineligible when already a member of a rule', () => {
        expect(
            getAlwaysRequiredIneligibilityReason(
                createRule({ id: 'a', requiredGroupId: 'g1' }),
            ),
        ).toBe('Already part of a requirement rule');
    });

    it('is ineligible when it has a default value', () => {
        expect(
            getAlwaysRequiredIneligibilityReason(
                createRule({ id: 'a', disabled: false, values: ['adam'] }),
            ),
        ).toBe(
            'Has a default value, so the requirement would always be satisfied',
        );
    });
});

describe('getRequirementIneligibilityReason', () => {
    it('is eligible when valueless and not required', () => {
        expect(
            getRequirementIneligibilityReason(createRule({ id: 'a' })),
        ).toBeNull();
    });

    it('is ineligible when already a member of a rule', () => {
        expect(
            getRequirementIneligibilityReason(
                createRule({ id: 'a', requiredGroupId: 'g1' }),
            ),
        ).toBe('Already part of a requirement rule');
    });

    it('is ineligible when individually required', () => {
        expect(
            getRequirementIneligibilityReason(
                createRule({ id: 'a', required: true }),
            ),
        ).toBe('Individually required');
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
