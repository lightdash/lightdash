import {
    FilterOperator,
    type DashboardFilterRule,
    type UnmetFilterRequirement,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithProviders } from '../../../testing/testUtils';
import { useFilterChipRequirementState } from './useFilterChipRequirementState';

const buildRule = (
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id: 'filter-1',
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

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

const setContext = (unmetFilterRequirements: UnmetFilterRequirement[] = []) => {
    mockDashboardContext.current = { unmetFilterRequirements };
};

const unmetGroupWith = (rule: DashboardFilterRule): UnmetFilterRequirement => ({
    type: 'group',
    groupId: 'group-1',
    filters: [rule],
});

const renderState = (rule: DashboardFilterRule) =>
    renderHookWithProviders(() => useFilterChipRequirementState(rule)).result
        .current;

const SINGLE_TOOLTIP = 'Required: set a value to run this dashboard';
const GROUP_TOOLTIP =
    'Required: set a value on this or an alternative filter to run this dashboard';

describe('useFilterChipRequirementState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('required without a value is unmet with the single-filter wording', () => {
        const rule = buildRule({ required: true });
        setContext([{ type: 'single', filter: rule }]);
        const state = renderState(rule);

        expect(state).toEqual({
            showRequirementIcon: true,
            isRequirementUnmet: true,
            requirementTooltip: SINGLE_TOOLTIP,
        });
    });

    it('required but disabled with stale values is unmet when the lock says so', () => {
        const rule = buildRule({
            required: true,
            disabled: true,
            values: ['Alice'],
        });
        setContext([{ type: 'single', filter: rule }]);
        const state = renderState(rule);

        expect(state.isRequirementUnmet).toBe(true);
    });

    it('a rule with both flags is a single: met when not in the unmet list, with single wording', () => {
        const rule = buildRule({
            required: true,
            requiredGroupId: 'group-1',
            disabled: false,
            values: ['Alice'],
        });
        setContext([]);
        const state = renderState(rule);

        expect(state).toEqual({
            showRequirementIcon: true,
            isRequirementUnmet: false,
            requirementTooltip: SINGLE_TOOLTIP,
        });
    });

    it('group-only member of an unmet group is unmet with the group wording', () => {
        const rule = buildRule({ requiredGroupId: 'group-1' });
        setContext([unmetGroupWith(rule)]);
        const state = renderState(rule);

        expect(state).toEqual({
            showRequirementIcon: true,
            isRequirementUnmet: true,
            requirementTooltip: GROUP_TOOLTIP,
        });
    });

    it('group member not in any unmet group shows the icon but is met', () => {
        const rule = buildRule({ requiredGroupId: 'group-1' });
        setContext([unmetGroupWith(buildRule({ id: 'other-filter' }))]);
        const state = renderState(rule);

        expect(state.showRequirementIcon).toBe(true);
        expect(state.isRequirementUnmet).toBe(false);
    });

    it('nothing required shows no requirement state at all', () => {
        setContext();
        const state = renderState(buildRule());

        expect(state.showRequirementIcon).toBe(false);
        expect(state.isRequirementUnmet).toBe(false);
    });
});
