import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { useSavedDashboardFiltersOverrides } from './useSavedDashboardFiltersOverrides';

vi.mock('./toaster/useToaster', () => ({
    default: () => ({
        showToastWarning: vi.fn(),
    }),
}));

const sanitizedRule = {
    id: 'filter-1',
    label: 'Status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['completed'],
    disabled: false,
};

// Carries every saved-dashboard-owned field the hook must strip
const urlOverrideRule = {
    ...sanitizedRule,
    lockedTabUuids: ['tab-1'],
    required: true,
    requiredGroupId: 'group-1',
};

const createWrapper = (search: string) =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <MemoryRouter initialEntries={[`/dashboard${search}`]}>
                {children}
            </MemoryRouter>
        );
    };

describe('useSavedDashboardFiltersOverrides', () => {
    it('strips saved-dashboard-owned fields from URL override rules', () => {
        const param = encodeURIComponent(
            JSON.stringify({ dimensions: [urlOverrideRule] }),
        );
        const { result } = renderHook(
            () => useSavedDashboardFiltersOverrides(),
            { wrapper: createWrapper(`?filters=${param}`) },
        );

        expect(
            result.current.overridesForSavedDashboardFilters.dimensions,
        ).toStrictEqual([sanitizedRule]);
    });

    it('strips saved-dashboard-owned fields when adding an override', () => {
        const { result } = renderHook(
            () => useSavedDashboardFiltersOverrides(),
            { wrapper: createWrapper('') },
        );

        const savedRule: DashboardFilterRule = {
            ...urlOverrideRule,
            tileTargets: {},
        };
        act(() => {
            result.current.addSavedFilterOverride(savedRule);
        });

        expect(
            result.current.overridesForSavedDashboardFilters.dimensions,
        ).toStrictEqual([sanitizedRule]);
    });
});
