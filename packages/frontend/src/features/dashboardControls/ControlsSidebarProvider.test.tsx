import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardParameterControl,
    type ParametersValuesMap,
    type ParameterValue,
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

const savedControl: DashboardParameterControl = {
    id: 'c1',
    label: 'Reporting date',
    parameterKeys: ['order_date'],
    tileTargets: {},
};
const initialValues: ParametersValuesMap = { order_date: '2026-01-01' };

const latest: {
    filters: DashboardFilters;
    changed: boolean;
    controls: DashboardParameterControl[];
    values: ParametersValuesMap;
} = {
    filters: initialFilters,
    changed: false,
    controls: [savedControl],
    values: initialValues,
};

// Real state behind the mocked dashboard context so edits re-render
const Wrapper: FC<PropsWithChildren> = ({ children }) => {
    const [dashboardFilters, setDashboardFilters] = useState(initialFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] = useState(false);
    const [parameterControls, setParameterControls] = useState([savedControl]);
    const [parameterValues, setParameterValues] = useState(initialValues);
    mockDashboardContext.current = {
        dashboardFilters,
        setDashboardFilters,
        haveFiltersChanged,
        setHaveFiltersChanged,
        filterableFieldsByTileUuid: {},
        parameterControls,
        setParameterControls,
        parameterValues,
        setParameter: (key: string, value: ParameterValue | null) =>
            setParameterValues((values) => {
                const { [key]: _removed, ...rest } = values;
                return value === null ? rest : { ...rest, [key]: value };
            }),
    };
    latest.filters = dashboardFilters;
    latest.changed = haveFiltersChanged;
    latest.controls = parameterControls;
    latest.values = parameterValues;
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

    it('clearFields turns a filter into a placeholder that keeps its label and settings', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() =>
            result.current.updateFilter({
                ...rule('a', ['1']),
                label: 'A',
                lockedTabUuids: ['t1'],
            }),
        );
        act(() => result.current.clearFields());
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editingRule?.label).toBe('A');
        expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);

        act(() => result.current.addFirstField(statusField));
        const placed = latest.filters.dimensions.find((r) => r.id === 'a');
        expect(placed?.target.fieldId).toBe('orders_status');
        expect(placed?.label).toBe('A');
        expect(placed?.lockedTabUuids).toEqual(['t1']);
    });

    it('cancel after clearFields restores the original filter', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.clearFields());
        act(() => result.current.cancel());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('keeps an added field waiting until it is removed or another filter opens', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.addWaitingField('orders_region'));
        expect(result.current.waitingFieldIds).toEqual(['orders_region']);
        expect(latest.filters).toEqual(initialFilters);

        act(() => result.current.removeWaitingField('orders_region'));
        expect(result.current.waitingFieldIds).toEqual([]);

        act(() => result.current.addWaitingField('orders_region'));
        act(() => result.current.open('b'));
        expect(result.current.waitingFieldIds).toEqual([]);
    });

    it('keeps a field listed as waiting when it loses its last tile', () => {
        const { result } = setup();
        const peer = { fieldId: 'orders_region', tableName: 'orders' };
        act(() => result.current.open('a'));
        act(() =>
            result.current.updateFilter({
                ...rule('a', ['1']),
                tileTargets: { t1: peer },
            }),
        );
        expect(result.current.waitingFieldIds).toEqual([]);

        act(() => result.current.updateFilter(rule('a', ['1'])));
        expect(result.current.waitingFieldIds).toEqual(['orders_region']);

        // Back on a tile, it is a field of the filter again
        act(() =>
            result.current.updateFilter({
                ...rule('a', ['1']),
                tileTargets: { t1: peer },
            }),
        );
        expect(result.current.waitingFieldIds).toEqual([]);
    });

    it('the hovered field wins over the highlighted one', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.setHighlightedFieldId('x'));
        expect(result.current.activeFieldId).toBe('x');
        act(() => result.current.setHoveredFieldId('y'));
        expect(result.current.activeFieldId).toBe('y');
        act(() => result.current.apply());
        expect(result.current.activeFieldId).toBeNull();
    });

    it('closes when the dashboard leaves edit mode', () => {
        const { result, rerender } = setup();
        act(() => result.current.open('a'));
        mockParams.current = { mode: 'view' };
        rerender();
        expect(result.current.editing).toBeNull();
    });

    describe('parameter controls', () => {
        it('edits a control live and restores it and its value on cancel', () => {
            const { result } = setup();
            act(() => result.current.openControl('c1'));
            expect(result.current.editingControl?.id).toBe('c1');
            expect(result.current.isSidebarOpen).toBe(true);
            expect(result.current.isDirty).toBe(false);

            act(() =>
                result.current.updateControl({
                    ...savedControl,
                    label: 'Period',
                    tileTargets: { t1: false },
                }),
            );
            act(() => result.current.setControlValue('2026-06-01'));
            expect(latest.controls[0].label).toBe('Period');
            expect(latest.values.order_date).toBe('2026-06-01');
            expect(result.current.isDirty).toBe(true);

            act(() => result.current.cancel());
            expect(latest.controls).toEqual([savedControl]);
            expect(latest.values).toEqual(initialValues);
            expect(result.current.isSidebarOpen).toBe(false);
        });

        it('keeps the edits on apply', () => {
            const { result } = setup();
            act(() => result.current.openControl('c1'));
            act(() =>
                result.current.updateControl({ ...savedControl, label: 'P' }),
            );
            act(() => result.current.apply());
            expect(latest.controls[0].label).toBe('P');
            expect(result.current.editingControl).toBeNull();
        });

        it('a parameter turns the placeholder into a new control that cancel discards', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addParameterControl('ship_date'));
            expect(result.current.isPlaceholder).toBe(false);
            expect(result.current.editing).toBeNull();
            expect(result.current.isNewControl).toBe(true);
            expect(result.current.editingControl?.parameterKeys).toEqual([
                'ship_date',
            ]);
            expect(latest.controls).toHaveLength(2);
            expect(latest.filters).toEqual(initialFilters);

            act(() => result.current.cancel());
            expect(latest.controls).toEqual([savedControl]);
            expect(result.current.isSidebarOpen).toBe(false);
        });

        it('removing a control keeps the values of its parameters', () => {
            const { result } = setup();
            act(() => result.current.openControl('c1'));
            act(() => result.current.removeControl());
            expect(latest.controls).toEqual([]);
            expect(latest.values).toEqual(initialValues);
            expect(result.current.isSidebarOpen).toBe(false);
        });

        it('moving from a filter to a control keeps the filter edits', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(rule('a', ['9'])));
            act(() => result.current.openControl('c1'));
            expect(result.current.editing).toBeNull();
            expect(result.current.editingControl?.id).toBe('c1');
            expect(latest.filters.dimensions[0].values).toEqual(['9']);
        });

        it('ignores Add and other pills while a new control is being edited', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addParameterControl('ship_date'));
            const id = result.current.editingControl?.id;
            act(() => result.current.openNew());
            act(() => result.current.open('a'));
            act(() => result.current.openControl('c1'));
            expect(result.current.editingControl?.id).toBe(id);
            expect(result.current.editing).toBeNull();
        });
    });
});
