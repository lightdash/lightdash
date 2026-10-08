import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { act, render, renderHook } from '@testing-library/react';
import { useState, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import {
    useControlsSidebar,
    useControlsSidebarSelector,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockParams = vi.hoisted(() => ({ current: { mode: 'edit' } }));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('react-router', () => ({
    useParams: () => mockParams.current,
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

const latest: {
    filters: DashboardFilters;
    changed: boolean;
} = {
    filters: initialFilters,
    changed: false,
};

// Real state behind the mocked dashboard context so edits re-render
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
    return <ControlsSidebarProvider>{children}</ControlsSidebarProvider>;
};

const setup = () =>
    renderHook(() => useControlsSidebar(), { wrapper: Wrapper });

describe('ControlsSidebarProvider', () => {
    beforeEach(() => {
        latest.filters = initialFilters;
        latest.changed = false;
        mockParams.current = { mode: 'edit' };
    });

    it('previews edits and restores them on discard', () => {
        const { result } = setup();
        expect(result.current.editing).toBeNull();

        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(result.current.isDirty).toBe(false);

        act(() => result.current.updateFilter(rule('a', ['9'])));
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
        expect(latest.changed).toBe(true);
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.discard());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
        expect(result.current.isSidebarOpen).toBe(false);
    });

    it('keeps edits on close', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.close());
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
        expect(result.current.editing).toBeNull();
    });

    it('moves to another filter keeping the edits made so far', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.open('b'));
        expect(result.current.editing).toEqual({ filterId: 'b' });

        act(() => result.current.discard());
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
    });

    it('removes the edited filter starting from the snapshot', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.removeFilter());
        expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
        expect(latest.changed).toBe(true);
        expect(result.current.editing).toBeNull();
    });

    it('closes when the dashboard leaves edit mode', () => {
        const { result, rerender } = setup();
        act(() => result.current.open('a'));
        mockParams.current = { mode: 'view' };
        rerender();
        expect(result.current.editing).toBeNull();
    });

    it('keeps every callback stable across edits and other controls', () => {
        const { result } = setup();
        const callbacks = () =>
            Object.fromEntries(
                Object.entries(result.current).filter(
                    ([, value]) => typeof value === 'function',
                ),
            );
        const initial = callbacks();
        expect(Object.keys(initial)).toHaveLength(6);
        expect(initial).not.toHaveProperty('clearFields');

        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));

        const changed = Object.entries(callbacks())
            .filter(([name, callback]) => callback !== initial[name])
            .map(([name]) => name);
        expect(changed).toEqual([]);
    });

    it('re-renders below a selector only when its slice changes', () => {
        const renders = { whole: 0, sliced: 0 };
        const sidebar: { current: ControlsSidebarContextValue | null } = {
            current: null,
        };
        // A bailed-out consumer never reaches its children
        const Probe: FC<{ name: 'whole' | 'sliced' }> = ({ name }) => {
            renders[name] += 1;
            return null;
        };
        const Whole: FC = () => {
            sidebar.current = useControlsSidebar();
            return <Probe name="whole" />;
        };
        const Sliced: FC = () => {
            useControlsSidebarSelector((c) => c.editing);
            useControlsSidebarSelector((c) => c.updateFilter);
            return <Probe name="sliced" />;
        };
        render(
            <Wrapper>
                <Whole />
                <Sliced />
            </Wrapper>,
        );
        const current = () => {
            if (sidebar.current === null) throw new Error('not rendered');
            return sidebar.current;
        };

        act(() => current().open('a'));
        const afterOpen = { ...renders };
        expect(afterOpen.sliced).toBe(2);

        act(() => current().updateFilter({ ...rule('a', ['1']), label: 'A' }));

        expect(renders.sliced).toBe(afterOpen.sliced);
        expect(renders.whole).toBe(afterOpen.whole + 1);
    });
});
