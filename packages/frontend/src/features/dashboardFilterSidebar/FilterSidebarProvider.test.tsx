import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
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

const statusField: DashboardFilterableField = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
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

    it('restores session settings on cancel and keeps them on apply', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open('a'));
        act(() =>
            result.current.updateSessionSettings('a', { placement: 'more' }),
        );
        expect(result.current.getSessionSettings('a').placement).toBe('more');
        act(() => result.current.cancel());
        expect(result.current.getSessionSettings('a').placement).toBe('bar');

        act(() => result.current.open('a'));
        act(() =>
            result.current.updateSessionSettings('a', { placement: 'more' }),
        );
        act(() => result.current.apply());
        expect(result.current.getSessionSettings('a').placement).toBe('more');
    });

    it('opens a new filter with no field and drops the draft on cancel', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.openNew());
        expect(result.current.editing).toEqual({ filterId: null });
        expect(result.current.isNew).toBe(true);
        expect(result.current.editingRule).toBeNull();
        expect(latest.filters).toEqual(initialFilters);

        act(() => result.current.addFirstField(statusField));
        expect(latest.filters.dimensions).toHaveLength(3);
        const draft = latest.filters.dimensions[2];
        expect(draft.target.fieldId).toBe('orders_status');
        expect(draft.label).toBeUndefined();
        expect(draft.disabled).toBe(true);
        expect(result.current.editing).toEqual({ filterId: draft.id });
        expect(result.current.isNew).toBe(true);
        expect(latest.changed).toBe(true);

        act(() => result.current.cancel());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
        expect(result.current.editing).toBeNull();
        expect(result.current.isNew).toBe(false);
    });

    it('backToPicker drops the draft but keeps the new filter open', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        act(() => result.current.listFieldId('orders_amount'));
        expect(latest.filters.dimensions).toHaveLength(3);

        act(() => result.current.backToPicker());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
        expect(result.current.editing).toEqual({ filterId: null });
        expect(result.current.isNew).toBe(true);
        expect(result.current.listedFieldIds).toEqual([]);

        act(() => result.current.addFirstField(statusField));
        expect(latest.filters.dimensions).toHaveLength(3);
    });

    it('clearFields empties the filter and addFirstField keeps its identity', () => {
        const original = initialFilters.dimensions[0];
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open(original.id));
        act(() => result.current.clearFields());
        expect(result.current.isEmpty).toBe(true);
        expect(result.current.isDirty).toBe(true);
        expect(result.current.editingRule).toBeNull();
        expect(result.current.editing).toEqual({ filterId: original.id });
        expect(
            latest.filters.dimensions.find((r) => r.id === original.id),
        ).toBeUndefined();
        expect(latest.changed).toBe(true);

        act(() => result.current.addFirstField(statusField));
        expect(result.current.isEmpty).toBe(false);
        const restored = latest.filters.dimensions.find(
            (r) => r.id === original.id,
        );
        expect(restored?.target.fieldId).toBe('orders_status');
        expect(restored?.label).toBe(original.label);
        expect(restored?.lockedTabUuids).toEqual(original.lockedTabUuids);
        expect(result.current.editing).toEqual({ filterId: original.id });
    });

    it('cancel after clearFields restores the original rule', () => {
        const original = initialFilters.dimensions[0];
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open(original.id));
        act(() => result.current.clearFields());
        act(() => result.current.cancel());
        expect(latest.filters).toEqual(initialFilters);
        expect(result.current.isEmpty).toBe(false);
        expect(result.current.editing).toBeNull();
    });

    it('ignores openNew while a filter is being edited', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open('a'));
        act(() => result.current.openNew());
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(result.current.isNew).toBe(false);
    });

    it('removes the editing filter and closes without restoring', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.open('a'));
        act(() => result.current.removeFilter());

        expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
        expect(latest.changed).toBe(true);
        expect(result.current.editing).toBeNull();
    });

    it('removes a filter by id without opening the sidebar', () => {
        const { result } = renderHook(() => useFilterSidebar(), {
            wrapper: Wrapper,
        });
        act(() => result.current.removeFilterById('b'));

        expect(latest.filters.dimensions).toEqual([rule('a', ['1'])]);
        expect(latest.changed).toBe(true);
        expect(result.current.editing).toBeNull();
    });
});
