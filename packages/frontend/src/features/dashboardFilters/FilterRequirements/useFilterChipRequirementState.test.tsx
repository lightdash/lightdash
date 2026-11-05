import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    type DashboardStoreTestValues,
} from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
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

let storeValues: DashboardStoreTestValues = {};

// Unmet requirements derive from the dashboard filters in the store
const setDashboardDimensionFilters = (
    dimensions: DashboardFilterRule[] = [],
) => {
    mockDashboardContext.current = {
        filterableFieldsByTileUuid: undefined,
        hiddenFilterableFieldIds: new Set<string>(),
    };
    storeValues = {
        dashboardFilters: { dimensions, metrics: [], tableCalculations: [] },
    };
};

const renderState = (rule: DashboardFilterRule) => {
    const store = createDashboardTestStore(storeValues);
    return renderHookWithProviders(
        () => useFilterChipRequirementState(rule),
        undefined,
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <DashboardStoreTestProvider store={store}>
                    {children}
                </DashboardStoreTestProvider>
            ),
        },
    ).result.current;
};

const SINGLE_TOOLTIP = 'Required: set a value to run this dashboard';
const GROUP_TOOLTIP =
    'Required: set a value on this or an alternative filter to run this dashboard';

describe('useFilterChipRequirementState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('required without a value is unmet with the single-filter wording', () => {
        const rule = buildRule({ required: true });
        setDashboardDimensionFilters([rule]);
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
        setDashboardDimensionFilters([rule]);
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
        setDashboardDimensionFilters([rule]);
        const state = renderState(rule);

        expect(state).toEqual({
            showRequirementIcon: true,
            isRequirementUnmet: false,
            requirementTooltip: SINGLE_TOOLTIP,
        });
    });

    it('group-only member of an unmet group is unmet with the group wording', () => {
        const rule = buildRule({ requiredGroupId: 'group-1' });
        setDashboardDimensionFilters([rule]);
        const state = renderState(rule);

        expect(state).toEqual({
            showRequirementIcon: true,
            isRequirementUnmet: true,
            requirementTooltip: GROUP_TOOLTIP,
        });
    });

    it('group member not in any unmet group shows the icon but is met', () => {
        const rule = buildRule({ requiredGroupId: 'group-1' });
        // Another group's member is unmet; this rule's group is satisfied
        setDashboardDimensionFilters([
            rule,
            buildRule({
                id: 'group-1-member-with-value',
                requiredGroupId: 'group-1',
                disabled: false,
                values: ['Alice'],
            }),
            buildRule({ id: 'other-filter', requiredGroupId: 'group-2' }),
        ]);
        const state = renderState(rule);

        expect(state.showRequirementIcon).toBe(true);
        expect(state.isRequirementUnmet).toBe(false);
    });

    it('nothing required shows no requirement state at all', () => {
        setDashboardDimensionFilters();
        const state = renderState(buildRule());

        expect(state.showRequirementIcon).toBe(false);
        expect(state.isRequirementUnmet).toBe(false);
    });
});
