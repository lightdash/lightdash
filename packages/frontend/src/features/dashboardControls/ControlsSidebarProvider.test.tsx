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
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { useControlsSidebar } from './useControlsSidebar';

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

// Real state behind the mocked dashboard context so edits re-render
const Wrapper: FC<PropsWithChildren> = ({ children }) => {
    const [dashboardFilters, setDashboardFilters] = useState(initialFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] = useState(false);
    mockDashboardContext.current = {
        dashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        filterableFieldsByTileUuid: {},
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

    it('previews edits and restores them on cancel', () => {
        const { result } = setup();
        expect(result.current.editing).toBeNull();

        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(result.current.isDirty).toBe(false);

        act(() => result.current.updateFilter(rule('a', ['9'])));
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
        expect(latest.changed).toBe(true);
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.cancel());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
        expect(result.current.isSidebarOpen).toBe(false);
    });

    it('keeps edits on apply', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.apply());
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
        expect(result.current.editing).toBeNull();
    });

    it('moves to another filter keeping the edits made so far', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.open('b'));
        expect(result.current.editing).toEqual({ filterId: 'b' });

        act(() => result.current.cancel());
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
    });

    it('Add opens a placeholder that stays out of the dashboard filters', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editingRule?.target.fieldId).toBe('');
        expect(result.current.activeSection).toBe('fields');
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('a placeholder cannot be applied and cancel discards it', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.apply());
        expect(result.current.isSidebarOpen).toBe(true);

        act(() => result.current.cancel());
        expect(result.current.isSidebarOpen).toBe(false);
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('the first field turns the placeholder into a filter, keeping id and label', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const placeholder = result.current.editingRule;
        if (!placeholder) throw new Error('expected a placeholder');
        act(() => result.current.updateFilter({ ...placeholder, label: 'S' }));
        expect(latest.filters).toEqual(initialFilters);

        act(() => result.current.addFirstField(statusField));
        expect(result.current.isPlaceholder).toBe(false);
        expect(result.current.isNew).toBe(true);
        const added = latest.filters.dimensions[2];
        expect(added.id).toBe(placeholder.id);
        expect(added.label).toBe('S');
        expect(added.target.fieldId).toBe('orders_status');
        expect(latest.changed).toBe(true);

        act(() => result.current.cancel());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('ignores Add and open while a new control is being edited', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const id = result.current.editing?.filterId;
        act(() => result.current.openNew());
        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: id });
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
});
