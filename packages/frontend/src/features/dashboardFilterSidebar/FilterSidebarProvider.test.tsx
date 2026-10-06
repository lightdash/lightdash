import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { act, renderHook } from '@testing-library/react';
import { useState, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FilterSidebarProvider } from './FilterSidebarProvider';
import { useFilterSidebar } from './useFilterSidebar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

const rule = (id: string, values: string[]): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    values,
});

const initialFilters: DashboardFilters = {
    dimensions: [rule('a', ['1']), rule('b', ['2'])],
    metrics: [],
    tableCalculations: [],
};

const latest: { filters: DashboardFilters; changed: boolean } = {
    filters: initialFilters,
    changed: false,
};

// Real state behind the mocked dashboard context so edits re-render.
const Wrapper: FC<PropsWithChildren> = ({ children }) => {
    const [dashboardFilters, setDashboardFilters] = useState(initialFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] = useState(false);
    mockDashboardContext.current = {
        dashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
    };
    latest.filters = dashboardFilters;
    latest.changed = haveFiltersChanged;
    return <FilterSidebarProvider>{children}</FilterSidebarProvider>;
};

describe('FilterSidebarProvider', () => {
    beforeEach(() => {
        latest.filters = initialFilters;
        latest.changed = false;
    });

    it('opens on a filter and ignores a second open while editing', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        expect(result.current.editing).toBeNull();

        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(result.current.originalFilterRule).toEqual(rule('a', ['1']));
        expect(result.current.isDirty).toBe(false);

        act(() => result.current.open('b'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
    });

    it('previews edits in the dashboard context and restores them on cancel', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));

        expect(latest.filters.dimensions[0].values).toEqual(['9']);
        expect(latest.changed).toBe(true);
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.cancel());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
        expect(result.current.editing).toBeNull();
    });

    it('keeps edits on apply', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open('b'));
        act(() => result.current.updateFilter(rule('b', ['7'])));
        act(() => result.current.apply());

        expect(latest.filters.dimensions[1].values).toEqual(['7']);
        expect(latest.changed).toBe(true);
        expect(result.current.editing).toBeNull();
        expect(result.current.isDirty).toBe(false);
    });
});
