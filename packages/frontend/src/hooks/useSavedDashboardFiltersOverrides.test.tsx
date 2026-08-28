import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
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

    it('reconciles a stale URL override before the saved filter is edited', () => {
        const staleRule = {
            ...sanitizedRule,
            id: 'stale-filter-id',
            values: ['pending'],
        };
        const param = encodeURIComponent(
            JSON.stringify({ dimensions: [staleRule] }),
        );
        const savedFilters = {
            dimensions: [
                {
                    ...sanitizedRule,
                    tileTargets: {},
                    values: [],
                },
            ],
            metrics: [],
            tableCalculations: [],
        } satisfies DashboardFilters;
        const { result, rerender } = renderHook(
            ({ filters }: { filters?: DashboardFilters }) =>
                useSavedDashboardFiltersOverrides(filters),
            {
                initialProps: { filters: undefined },
                wrapper: createWrapper(`?filters=${param}`),
            },
        );

        rerender({ filters: savedFilters });
        act(() => {
            result.current.addSavedFilterOverride({
                ...savedFilters.dimensions[0],
                values: ['completed'],
            });
        });

        expect(
            result.current.overridesForSavedDashboardFilters.dimensions,
        ).toStrictEqual([
            {
                ...sanitizedRule,
                values: ['completed'],
            },
        ]);
    });

    it('keeps stale overrides distinct for saved filters sharing a field', () => {
        const param = encodeURIComponent(
            JSON.stringify({
                dimensions: [
                    {
                        ...sanitizedRule,
                        id: 'stale-filter-1',
                        values: ['pending'],
                    },
                    {
                        ...sanitizedRule,
                        id: 'stale-filter-2',
                        values: ['shipped'],
                    },
                ],
            }),
        );
        const savedFilters = {
            dimensions: [
                { ...sanitizedRule, id: 'saved-filter-1', tileTargets: {} },
                { ...sanitizedRule, id: 'saved-filter-2', tileTargets: {} },
            ],
            metrics: [],
            tableCalculations: [],
        } satisfies DashboardFilters;
        const { result } = renderHook(
            () => useSavedDashboardFiltersOverrides(savedFilters),
            { wrapper: createWrapper(`?filters=${param}`) },
        );

        act(() => {
            result.current.addSavedFilterOverride({
                ...savedFilters.dimensions[1],
                values: ['completed'],
            });
        });

        expect(
            result.current.overridesForSavedDashboardFilters.dimensions,
        ).toStrictEqual([
            {
                ...sanitizedRule,
                id: 'saved-filter-1',
                values: ['pending'],
            },
            {
                ...sanitizedRule,
                id: 'saved-filter-2',
                values: ['completed'],
            },
        ]);
    });

    it('preserves override state identity when ids are already current', () => {
        const param = encodeURIComponent(
            JSON.stringify({ dimensions: [sanitizedRule] }),
        );
        const savedFilters = {
            dimensions: [{ ...sanitizedRule, tileTargets: {} }],
            metrics: [],
            tableCalculations: [],
        } satisfies DashboardFilters;
        const { result, rerender } = renderHook(
            ({ filters }: { filters: DashboardFilters }) =>
                useSavedDashboardFiltersOverrides(filters),
            {
                initialProps: { filters: savedFilters },
                wrapper: createWrapper(`?filters=${param}`),
            },
        );
        const overrides = result.current.overridesForSavedDashboardFilters;

        rerender({
            filters: {
                ...savedFilters,
                dimensions: [...savedFilters.dimensions],
            },
        });

        expect(result.current.overridesForSavedDashboardFilters).toBe(
            overrides,
        );
    });
});
