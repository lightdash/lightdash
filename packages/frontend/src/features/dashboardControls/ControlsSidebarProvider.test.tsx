import {
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type ResultColumn,
} from '@lightdash/common';
import { act, render, renderHook } from '@testing-library/react';
import { useState, type FC, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventName } from '../../types/Events';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import { getFieldCount, getTileField, type FieldsByTile } from './peers';
import {
    useControlsSidebar,
    useControlsSidebarSelector,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockParams = vi.hoisted(() => ({ current: { mode: 'edit' } }));
const mockTiles = vi.hoisted(() => ({
    saved: [{ uuid: 't1' }],
    current: [{ uuid: 't1' }],
}));
const mockFieldsByTile = vi.hoisted(() => ({
    current: {} as Record<string, unknown[]>,
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('react-router', () => ({
    useParams: () => mockParams.current,
}));
const mockTrack = vi.hoisted(() => vi.fn());
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mockTrack }),
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

// What shipped code holds beside the saved filters: a viewer's own filters
const NO_TEMPORARY_FILTERS: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};
const mockTemporaryFilters = vi.hoisted(() => ({
    current: null as DashboardFilters | null,
}));

const revenueField: DashboardFilterableField = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: 'x',
    hidden: false,
};

const latest: {
    filters: DashboardFilters;
    changed: boolean;
} = {
    filters: initialFilters,
    changed: false,
};

// What the dashboard holds when the test starts
const saved = { filters: initialFilters };

// Real state behind the mocked dashboard context so edits re-render
const Wrapper: FC<PropsWithChildren> = ({ children }) => {
    const [dashboardFilters, setDashboardFilters] = useState(saved.filters);
    const [haveFiltersChanged, setHaveFiltersChanged] = useState(false);
    mockDashboardContext.current = {
        dashboardFilters,
        setDashboardFilters,
        dashboardTemporaryFilters:
            mockTemporaryFilters.current ?? NO_TEMPORARY_FILTERS,
        haveFiltersChanged,
        setHaveFiltersChanged,
        filterableFieldsByTileUuid: mockFieldsByTile.current,
        dashboard: { tiles: mockTiles.saved },
        dashboardTiles: mockTiles.current,
    };
    latest.filters = dashboardFilters;
    latest.changed = haveFiltersChanged;
    return <ControlsSidebarProvider>{children}</ControlsSidebarProvider>;
};

const setup = () =>
    renderHook(() => useControlsSidebar(), { wrapper: Wrapper });

type FiltersUpdate = (filters: DashboardFilters) => DashboardFilters;
const lag: { pending: FiltersUpdate[]; show: (update: FiltersUpdate) => void } =
    { pending: [], show: () => {} };

// A dashboard context whose filters reach the provider a render late, as a
// selector read can: writes wait in `lag.pending` until they are shown
const LaggingWrapper: FC<PropsWithChildren> = ({ children }) => {
    const [dashboardFilters, setShownFilters] = useState(initialFilters);
    const [haveFiltersChanged, setHaveFiltersChanged] = useState(false);
    lag.show = setShownFilters;
    mockDashboardContext.current = {
        dashboardFilters,
        setDashboardFilters: (update: FiltersUpdate) => {
            lag.pending.push(update);
        },
        haveFiltersChanged,
        setHaveFiltersChanged,
        filterableFieldsByTileUuid: mockFieldsByTile.current,
        dashboard: { tiles: mockTiles.saved },
        dashboardTiles: mockTiles.current,
    };
    return <ControlsSidebarProvider>{children}</ControlsSidebarProvider>;
};
const showPendingFilters = () =>
    act(() => {
        const updates = lag.pending.splice(0);
        lag.show((filters) =>
            updates.reduce((next, update) => update(next), filters),
        );
    });

// A write the editor did not make: another tile, tab or pill action
const writeOutsideTheEditor = (
    update: (filters: DashboardFilters) => DashboardFilters,
) =>
    act(() => {
        const context = mockDashboardContext.current as {
            setDashboardFilters: (
                next: (filters: DashboardFilters) => DashboardFilters,
            ) => void;
            setHaveFiltersChanged: (changed: boolean) => void;
        };
        context.setDashboardFilters(update);
        context.setHaveFiltersChanged(true);
    });
const excludeTileFromB = (filters: DashboardFilters): DashboardFilters => ({
    ...filters,
    dimensions: filters.dimensions.map((r) =>
        r.id === 'b' ? { ...r, tileTargets: { t2: false } } : r,
    ),
});

describe('ControlsSidebarProvider', () => {
    beforeEach(() => {
        saved.filters = initialFilters;
        lag.pending = [];
        latest.filters = initialFilters;
        latest.changed = false;
        mockParams.current = { mode: 'edit' };
        mockTiles.current = [{ uuid: 't1' }];
        mockFieldsByTile.current = {};
        mockTrack.mockClear();
        mockTemporaryFilters.current = null;
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

    it('closing a placeholder discards it', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.close());
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

        act(() => result.current.discard());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('a first metric makes a metric filter', () => {
        const revenue = {
            ...statusField,
            fieldType: FieldType.METRIC,
            type: MetricType.SUM,
            name: 'revenue',
            label: 'Revenue',
        } as DashboardFilterableField;
        mockFieldsByTile.current = { t1: [revenue] };
        const { result } = setup();
        act(() => result.current.openNew());
        const placeholder = result.current.editingRule;

        act(() => result.current.addFirstField(revenue));

        expect(latest.filters.dimensions).toEqual(initialFilters.dimensions);
        expect(latest.filters.metrics).toHaveLength(1);
        expect(latest.filters.metrics[0].id).toBe(placeholder?.id);
        expect(latest.filters.metrics[0].target.fieldId).toBe('orders_revenue');
        expect(result.current.editingRule).toBe(latest.filters.metrics[0]);
        expect(result.current.isPlaceholder).toBe(false);

        act(() => result.current.discard());
        expect(latest.filters).toEqual(initialFilters);
    });

    it('a first SQL column makes a filter on every SQL chart tile that has it', () => {
        const country: ResultColumn = {
            reference: 'country',
            type: DimensionType.STRING,
        };
        const total: ResultColumn = {
            reference: 'total',
            type: DimensionType.NUMBER,
        };
        const { result } = setup();
        act(() => result.current.openNew());
        const placeholder = result.current.editingRule;
        if (!placeholder) throw new Error('expected a placeholder');
        act(() => result.current.updateFilter({ ...placeholder, label: 'S' }));

        act(() =>
            result.current.addFirstSqlColumn(total, {
                s1: [country, total],
                s2: [country],
                s3: [total],
            }),
        );

        const added = latest.filters.dimensions[2];
        expect(added.id).toBe(placeholder.id);
        expect(added.label).toBe('S');
        expect(added.target).toEqual({
            fieldId: 'total',
            tableName: 'sql_chart',
            isSqlColumn: true,
            fallbackType: DimensionType.NUMBER,
        });
        expect(Object.keys(added.tileTargets ?? {})).toEqual(['s1', 's3']);
        expect(added.disabled).toBe(true);
        expect(result.current.isPlaceholder).toBe(false);
        expect(result.current.isNew).toBe(true);
        expect(latest.changed).toBe(true);

        act(() => result.current.discard());
        expect(latest.filters).toEqual(initialFilters);
    });

    it('a SQL column does nothing once the control has a field', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        act(() =>
            result.current.addFirstSqlColumn(
                { reference: 'total', type: DimensionType.NUMBER },
                {},
            ),
        );

        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].target.fieldId).toBe(
            'orders_status',
        );
    });

    it('tracks a filter where it is created, not where Add is clicked', () => {
        const event = {
            name: EventName.ADD_FILTER_CLICKED,
            properties: { mode: 'edit' },
        };
        const { result } = setup();
        act(() => result.current.openNew());
        expect(mockTrack).not.toHaveBeenCalled();

        act(() => result.current.addFirstField(statusField));
        expect(mockTrack).toHaveBeenCalledTimes(1);
        expect(mockTrack).toHaveBeenLastCalledWith(event);

        // Nothing is created by a second pick, or by a discarded placeholder
        act(() => result.current.addFirstField(statusField));
        act(() => result.current.close());
        act(() => result.current.openNew());
        act(() => result.current.close());
        expect(mockTrack).toHaveBeenCalledTimes(1);

        mockFieldsByTile.current = { t1: [statusField] };
        act(() => result.current.openNew());
        act(() => result.current.addFirstFieldOnTile(statusField, 't1'));
        expect(mockTrack).toHaveBeenCalledTimes(2);

        act(() => result.current.close());
        act(() => result.current.openNew());
        act(() =>
            result.current.addFirstSqlColumn(
                { reference: 'total', type: DimensionType.NUMBER },
                {},
            ),
        );
        expect(mockTrack).toHaveBeenCalledTimes(3);
        expect(mockTrack).toHaveBeenLastCalledWith(event);
    });

    describe('a first field', () => {
        const regionField: DashboardFilterableField = {
            ...statusField,
            name: 'region',
            label: 'Region',
        };
        const tiles = ['t1', 't2', 't3', 't4'].map(
            (uuid) => ({ uuid, properties: {} }) as DashboardTile,
        );
        const start = () => {
            const view = setup();
            act(() => view.result.current.openNew());
            const placeholder = view.result.current.editingRule;
            if (!placeholder) throw new Error('expected a placeholder');
            act(() =>
                view.result.current.updateFilter({
                    ...placeholder,
                    label: 'S',
                }),
            );
            return { ...view, placeholder };
        };

        beforeEach(() => {
            mockTiles.current = tiles;
            mockFieldsByTile.current = {
                t1: [statusField],
                t2: [statusField, regionField],
                t3: [regionField],
                t4: [statusField],
            };
        });

        it('picked on a tile filters that tile only, keeping id and label', () => {
            const { result, placeholder } = start();

            act(() => result.current.addFirstFieldOnTile(statusField, 't2'));

            expect(result.current.isPlaceholder).toBe(false);
            expect(result.current.isNew).toBe(true);
            const added = latest.filters.dimensions[2];
            expect(added.id).toBe(placeholder.id);
            expect(added.label).toBe('S');
            expect(added.target.fieldId).toBe('orders_status');
            // The clicked tile follows the default; t3 does not offer the field
            expect(added.tileTargets).toEqual({ t1: false, t4: false });
            expect(
                tiles
                    .filter(
                        (tile) =>
                            getTileField(
                                added,
                                tile,
                                mockFieldsByTile.current as FieldsByTile,
                            ) !== null,
                    )
                    .map((tile) => tile.uuid),
            ).toEqual(['t2']);
            // What the sidebar row reads: "1 of 3 tiles", "All tiles" for 3
            expect(
                getFieldCount(
                    added,
                    'orders_status',
                    tiles,
                    mockFieldsByTile.current as FieldsByTile,
                ),
            ).toEqual({ applied: 1, possible: 3 });
            expect(latest.changed).toBe(true);

            act(() => result.current.discard());
            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('picked in the sidebar filters every tile that offers it', () => {
            const { result } = start();

            act(() => result.current.addFirstField(statusField));

            const added = latest.filters.dimensions[2];
            expect(added.label).toBe('S');
            expect(
                getFieldCount(
                    added,
                    'orders_status',
                    tiles,
                    mockFieldsByTile.current as FieldsByTile,
                ),
            ).toEqual({ applied: 3, possible: 3 });
        });

        it('picked on a tile does nothing while the tile fields are not loaded', () => {
            const { result } = start();
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: undefined,
            };
            // Any change hands the provider the fields as they are now
            act(() => result.current.setHoveredFieldId('x'));

            act(() => result.current.addFirstFieldOnTile(statusField, 't2'));

            expect(result.current.isPlaceholder).toBe(true);
            expect(latest.filters).toEqual(initialFilters);
        });

        it('picked on a tile does nothing once the control has a field', () => {
            const { result } = start();
            act(() => result.current.addFirstFieldOnTile(statusField, 't2'));
            act(() => result.current.addFirstFieldOnTile(regionField, 't3'));

            expect(latest.filters.dimensions).toHaveLength(3);
            expect(latest.filters.dimensions[2].target.fieldId).toBe(
                'orders_status',
            );
        });
    });

    it('Add on an untouched placeholder leaves it open', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const id = result.current.editing?.filterId;
        act(() => result.current.openNew());
        expect(result.current.editing).toEqual({ filterId: id });
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.isSidebarOpen).toBe(true);
    });

    it('Add leaves a placeholder with a typed label as it is', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const placeholder = result.current.editingRule;
        if (!placeholder) throw new Error('expected a placeholder');
        act(() => result.current.updateFilter({ ...placeholder, label: 'S' }));

        act(() => result.current.openNew());
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editing?.filterId).toBe(placeholder.id);
        expect(result.current.editingRule?.label).toBe('S');
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('Add keeps the edits to an existing filter and opens a placeholder', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.setActiveSection('settings'));
        act(() => result.current.setHighlightedFieldId('orders_a'));
        act(() => result.current.setHoveredFieldId('orders_a'));

        act(() => result.current.openNew());
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editing?.filterId).not.toBe('a');
        expect(result.current.activeSection).toBe('fields');
        expect(result.current.activeFieldId).toBeNull();
        expect(latest.filters.dimensions[0].values).toEqual(['9']);

        // The snapshot is the dashboard with the kept edit
        act(() => result.current.discard());
        expect(latest.filters.dimensions[0].values).toEqual(['9']);
        expect(latest.changed).toBe(true);
        expect(result.current.isSidebarOpen).toBe(false);
    });

    it('Add turns off an empty default value on the filter it closes', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() =>
            result.current.updateFilter({ ...rule('a', []), disabled: false }),
        );
        act(() => result.current.openNew());
        expect(result.current.isPlaceholder).toBe(true);
        expect(latest.filters.dimensions[0].disabled).toBe(true);
    });

    it('Add keeps a new filter that has a field but no label', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const id = result.current.editing?.filterId;
        act(() => result.current.addFirstField(statusField));
        expect(latest.filters.dimensions).toHaveLength(3);

        act(() => result.current.openNew());
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editing?.filterId).not.toBe(id);
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].id).toBe(id);
        expect(latest.filters.dimensions[2].label).toBeUndefined();

        // Discarding the new one leaves the kept one alone
        act(() => result.current.discard());
        expect(latest.filters.dimensions).toHaveLength(3);
    });

    it('Add keeps a new filter that has a field and a label', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        const added = result.current.editingRule;
        if (!added) throw new Error('expected a filter');
        act(() => result.current.updateFilter({ ...added, label: 'S' }));

        act(() => result.current.openNew());
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editing?.filterId).not.toBe(added.id);
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].label).toBe('S');

        act(() => result.current.discard());
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].label).toBe('S');
    });

    it('opening another filter drops a new control that has no field', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const placeholder = result.current.editingRule;
        if (!placeholder) throw new Error('expected a placeholder');
        act(() => result.current.updateFilter({ ...placeholder, label: 'S' }));

        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(result.current.isNew).toBe(false);
        expect(result.current.isPlaceholder).toBe(false);
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('opening another filter keeps a new control that has a field but no label', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));

        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(result.current.isNew).toBe(false);
        expect(latest.filters.dimensions).toHaveLength(3);

        // The snapshot is the dashboard with the kept control
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.discard());
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[0].values).toEqual(['1']);
    });

    it('opening another filter keeps a new control that has a field and a label', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        const added = result.current.editingRule;
        if (!added) throw new Error('expected a filter');
        act(() => result.current.updateFilter({ ...added, label: 'S' }));

        act(() => result.current.open('a'));
        expect(result.current.editing).toEqual({ filterId: 'a' });
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].label).toBe('S');

        // Discarding the second edit does not take the kept control with it
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.discard());
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[0].values).toEqual(['1']);
    });

    describe('writes made outside the editor while it is open', () => {
        it('survive Discard, which only puts the edited rule back', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(rule('a', ['9'])));
            writeOutsideTheEditor(excludeTileFromB);

            act(() => result.current.discard());

            expect(latest.filters.dimensions[0]).toBe(
                initialFilters.dimensions[0],
            );
            expect(latest.filters.dimensions[1].tileTargets).toEqual({
                t2: false,
            });
            // Something else did change, so the dashboard still has to save
            expect(latest.changed).toBe(true);
        });

        it('survive discarding a new control, which only takes that control out', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            writeOutsideTheEditor(excludeTileFromB);

            act(() => result.current.discard());

            expect(latest.filters.dimensions.map((r) => r.id)).toEqual([
                'a',
                'b',
            ]);
            expect(latest.filters.dimensions[1].tileTargets).toEqual({
                t2: false,
            });
            expect(latest.changed).toBe(true);
        });

        it('survive Remove, which only takes the edited rule out', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            writeOutsideTheEditor(excludeTileFromB);

            act(() => result.current.removeFilter());

            expect(latest.filters.dimensions).toEqual([
                { ...initialFilters.dimensions[1], tileTargets: { t2: false } },
            ]);
            expect(latest.changed).toBe(true);
        });

        it('close the sidebar when they take the edited rule away', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            expect(result.current.isSidebarOpen).toBe(true);

            writeOutsideTheEditor((filters) => ({
                ...filters,
                dimensions: filters.dimensions.filter((r) => r.id !== 'a'),
            }));

            expect(result.current.editingRule).toBeNull();
            expect(result.current.isSidebarOpen).toBe(false);

            // The next open starts over, and the rule that was taken away
            // stays away
            act(() => result.current.open('b'));
            expect(result.current.editing).toEqual({ filterId: 'b' });
            expect(result.current.isSidebarOpen).toBe(true);
            expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
            expect(latest.changed).toBe(true);
        });

        it('are kept by Add after they took the edited rule away', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter({
                    ...rule('a', ['1']),
                    label: 'x',
                }),
            );
            writeOutsideTheEditor((filters) => ({
                ...filters,
                dimensions: filters.dimensions.filter((r) => r.id !== 'a'),
            }));

            act(() => result.current.openNew());

            expect(result.current.isPlaceholder).toBe(true);
            expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
            expect(latest.changed).toBe(true);
        });
    });

    describe('the first field, while the dashboard filters do not show it yet', () => {
        it('keeps the sidebar open on the rule it just wrote', () => {
            const { result } = renderHook(() => useControlsSidebar(), {
                wrapper: LaggingWrapper,
            });
            act(() => result.current.openNew());
            const id = result.current.editing?.filterId;

            act(() => result.current.addFirstField(statusField));
            // The write has not come back: the placeholder is gone and the
            // filters do not hold the rule
            expect(lag.pending).toHaveLength(1);
            expect(result.current.isPlaceholder).toBe(false);
            expect(result.current.isSidebarOpen).toBe(true);
            expect(result.current.editingRule).toMatchObject({
                id,
                target: { fieldId: 'orders_status' },
            });

            showPendingFilters();
            expect(result.current.isSidebarOpen).toBe(true);
            expect(result.current.editingRule?.id).toBe(id);
        });

        it('still closes once the rule was there and something removed it', () => {
            const { result } = renderHook(() => useControlsSidebar(), {
                wrapper: LaggingWrapper,
            });
            act(() => result.current.openNew());
            const id = result.current.editing?.filterId;
            act(() => result.current.addFirstField(statusField));
            showPendingFilters();

            act(() =>
                lag.show((filters) => ({
                    ...filters,
                    dimensions: filters.dimensions.filter((r) => r.id !== id),
                })),
            );
            expect(result.current.editingRule).toBeNull();
            expect(result.current.isSidebarOpen).toBe(false);
        });
    });

    describe("the editor's own writes to other filters", () => {
        // What adding B as a required alternative of A writes on B
        const asAlternative = (other: DashboardFilterRule) => ({
            ...other,
            requiredGroupId: 'group',
            disabled: true,
            values: [],
        });

        it('are undone by Discard, with the edited rule', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => {
                result.current.updateOtherFilters([
                    asAlternative(initialFilters.dimensions[1]),
                ]);
                result.current.updateFilter({
                    ...rule('a', ['1']),
                    requiredGroupId: 'group',
                });
            });
            expect(latest.filters.dimensions[1].values).toEqual([]);
            expect(latest.changed).toBe(true);

            act(() => result.current.discard());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.filters.dimensions[1]).toBe(
                initialFilters.dimensions[1],
            );
            expect(latest.changed).toBe(false);
        });

        it('are undone by Remove', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateOtherFilters([
                    asAlternative(initialFilters.dimensions[1]),
                ]),
            );

            act(() => result.current.removeFilter());

            expect(latest.filters.dimensions).toEqual([
                initialFilters.dimensions[1],
            ]);
        });

        it('are undone when a new control with no field is closed', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() =>
                result.current.updateOtherFilters([
                    asAlternative(initialFilters.dimensions[1]),
                ]),
            );

            act(() => result.current.close());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('are kept by Done', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateOtherFilters([
                    asAlternative(initialFilters.dimensions[1]),
                ]),
            );

            act(() => result.current.close());

            expect(latest.filters.dimensions[1].requiredGroupId).toBe('group');
            expect(latest.changed).toBe(true);
        });

        it('leave a rule written from outside the editor alone', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            writeOutsideTheEditor(excludeTileFromB);

            act(() => result.current.discard());

            expect(latest.filters.dimensions[1].tileTargets).toEqual({
                t2: false,
            });
        });

        it('are forgotten once another control opens', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateOtherFilters([
                    asAlternative(initialFilters.dimensions[1]),
                ]),
            );
            act(() => result.current.open('b'));

            act(() => result.current.discard());

            // B is the edited rule now, and it was opened as an alternative
            expect(latest.filters.dimensions[1].requiredGroupId).toBe('group');
        });
    });

    describe('the changed flag on close', () => {
        it('stays off when an edit was put back by hand', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter({
                    ...rule('a', ['1']),
                    label: 'x',
                }),
            );
            expect(latest.changed).toBe(true);
            act(() => result.current.updateFilter(rule('a', ['1'])));

            act(() => result.current.close());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('goes on when closing turns an empty default off', () => {
            saved.filters = {
                ...initialFilters,
                dimensions: [rule('a', []), rule('b', ['2'])],
            };
            const { result } = setup();
            act(() => result.current.open('a'));
            expect(latest.changed).toBe(false);

            act(() => result.current.close());

            expect(latest.filters.dimensions[0].disabled).toBe(true);
            expect(latest.changed).toBe(true);
        });

        // Shipped code raises the flag for a viewer's temporary filter too,
        // with the saved filters as they were
        const raiseForATemporaryFilter = (rerender: () => void) => {
            mockTemporaryFilters.current = {
                ...NO_TEMPORARY_FILTERS,
                dimensions: [rule('temporary', ['x'])],
            };
            act(() => {
                (
                    mockDashboardContext.current as {
                        setHaveFiltersChanged: (changed: boolean) => void;
                    }
                ).setHaveFiltersChanged(true);
            });
            rerender();
        };

        it('is not lowered when something else raised it while the editor was open', () => {
            const { result, rerender } = setup();
            act(() => result.current.open('a'));
            raiseForATemporaryFilter(rerender);
            expect(latest.changed).toBe(true);

            act(() => result.current.close());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(true);
        });

        it('is not lowered by Discard either', () => {
            const { result, rerender } = setup();
            act(() => result.current.open('a'));
            raiseForATemporaryFilter(rerender);

            act(() => result.current.discard());

            expect(latest.changed).toBe(true);
        });

        it('is not lowered when a temporary filter changed after the editor raised it', () => {
            const { result, rerender } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter({
                    ...rule('a', ['1']),
                    label: 'x',
                }),
            );
            raiseForATemporaryFilter(rerender);
            act(() => result.current.updateFilter(rule('a', ['1'])));

            act(() => result.current.close());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(true);
        });

        it('stays on when it was on before the control opened', () => {
            const { result } = setup();
            writeOutsideTheEditor((filters) => ({ ...filters }));
            act(() => result.current.open('a'));

            act(() => result.current.close());

            expect(latest.changed).toBe(true);
        });
    });

    it('opening another filter turns off an empty default on the one it leaves', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() =>
            result.current.updateFilter({ ...rule('a', []), disabled: false }),
        );

        act(() => result.current.open('b'));

        expect(result.current.editing).toEqual({ filterId: 'b' });
        expect(latest.filters.dimensions[0].disabled).toBe(true);
    });

    it('opening the control that is already open changes nothing', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.setActiveSection('settings'));
        act(() => result.current.addWaitingField('orders_region'));

        act(() => result.current.open('a'));

        // Same snapshot, so the edit can still be discarded
        expect(result.current.isDirty).toBe(true);
        expect(result.current.activeSection).toBe('settings');
        expect(result.current.waitingFieldIds).toEqual(['orders_region']);
        act(() => result.current.discard());
        expect(latest.filters).toEqual(initialFilters);
    });

    it('opening the new control that is already open keeps it new', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        const { id } = latest.filters.dimensions[2];

        act(() => result.current.open(id));

        expect(result.current.isNew).toBe(true);
        expect(result.current.editing).toEqual({ filterId: id });
        // Still a control that Discard drops
        act(() => result.current.discard());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('drops the waiting fields of a filter when another one opens', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.addWaitingField('orders_region'));

        act(() => result.current.open('b'));
        act(() => result.current.open('a'));

        expect(result.current.waitingFieldIds).toEqual([]);
    });

    it('a first field carries over no setting the placeholder did not have', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));

        const added = latest.filters.dimensions[2];
        expect(
            [
                'lockedTabUuids',
                'required',
                'requiredGroupId',
                'singleValue',
            ].filter((key) => key in added),
        ).toEqual([]);
    });

    it('discarding a first field leaves the filters and the flag as they were', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.changed).toBe(true);

        act(() => result.current.discard());

        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);
    });

    it('removes the edited filter, edits and all', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.removeFilter());
        expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
        expect(latest.changed).toBe(true);
        expect(result.current.editing).toBeNull();
    });

    describe('removing the last field', () => {
        const setting: DashboardFilterRule = {
            ...rule('a', ['1']),
            label: 'A',
            required: true,
            singleValue: true,
            tileTargets: { t1: false },
        };
        const openEmptied = (edited: DashboardFilterRule = setting) => {
            const hook = setup();
            act(() => hook.result.current.open('a'));
            act(() => hook.result.current.updateFilter(edited));
            act(() => hook.result.current.setHighlightedFieldId('orders_a'));
            act(() => hook.result.current.addWaitingField('orders_region'));
            act(() => hook.result.current.removeLastField('A'));
            return hook;
        };

        it('leaves the control open and empty, with its id and label', () => {
            const { result } = openEmptied();

            expect(result.current.isSidebarOpen).toBe(true);
            expect(result.current.editing).toEqual({ filterId: 'a' });
            expect(result.current.isPlaceholder).toBe(true);
            expect(result.current.isNew).toBe(false);
            expect(result.current.isDirty).toBe(true);
            expect(result.current.editingRule).toEqual({
                id: 'a',
                label: 'A',
                target: { fieldId: '', tableName: '' },
                operator: FilterOperator.EQUALS,
                values: [],
                tileTargets: {},
                disabled: true,
                required: true,
                requiredGroupId: undefined,
                lockedTabUuids: undefined,
            });
            // Off the dashboard until it has a field again
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
            expect(latest.changed).toBe(true);
            expect(result.current.highlightedFieldId).toBeNull();
            expect(result.current.waitingFieldIds).toEqual([]);
        });

        it('takes a label typed while it is empty', () => {
            const { result } = openEmptied();
            const empty = result.current.editingRule;
            if (!empty) throw new Error('expected an empty control');
            act(() => result.current.updateFilter({ ...empty, label: 'B' }));
            expect(result.current.editingRule?.label).toBe('B');
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
        });

        it('picking a field keeps the id, the label and the place on the bar', () => {
            const { result } = openEmptied();
            act(() => result.current.addFirstField(statusField));

            expect(result.current.isPlaceholder).toBe(false);
            expect(result.current.editing).toEqual({ filterId: 'a' });
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual([
                'a',
                'b',
            ]);
            const picked = latest.filters.dimensions[0];
            expect(picked.label).toBe('A');
            expect(picked.target.fieldId).toBe('orders_status');
            expect(picked.required).toBe(true);
            // What came with the old field's type is gone
            expect(picked.values ?? []).toEqual([]);
            expect(picked.disabled).toBe(true);
            expect(picked.singleValue).toBeUndefined();
            // The control existed already, so nothing was created
            expect(mockTrack).not.toHaveBeenCalled();
        });

        it('picking a field on a tile keeps the id and label too', () => {
            mockFieldsByTile.current = { t1: [statusField] };
            const { result } = openEmptied();
            act(() => result.current.addFirstFieldOnTile(statusField, 't1'));

            expect(latest.filters.dimensions.map((r) => r.id)).toEqual([
                'a',
                'b',
            ]);
            expect(latest.filters.dimensions[0].label).toBe('A');
        });

        it('a metric picked for a dimension control goes to the metrics', () => {
            const { result } = openEmptied();
            act(() =>
                result.current.addFirstField({
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'revenue',
                    label: 'Revenue',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'x',
                    hidden: false,
                }),
            );
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
            expect(latest.filters.metrics.map((r) => r.id)).toEqual(['a']);
        });

        it('Discard takes a dimension control that got a metric back among the dimensions', () => {
            const { result } = openEmptied();
            act(() => result.current.addFirstField(revenueField));
            expect(latest.filters.metrics.map((r) => r.id)).toEqual(['a']);

            act(() => result.current.discard());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('Discard takes a metric control that got a dimension back among the metrics', () => {
            const metricRule = rule('m', ['9']);
            saved.filters = { ...initialFilters, metrics: [metricRule] };
            const { result } = setup();
            act(() => result.current.open('m'));
            act(() => result.current.removeLastField('Revenue'));
            act(() => result.current.addFirstField(statusField));
            expect(latest.filters.metrics).toEqual([]);
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual([
                'a',
                'b',
                'm',
            ]);

            act(() => result.current.discard());

            expect(latest.filters).toEqual(saved.filters);
            expect(latest.filters.metrics[0]).toBe(metricRule);
            expect(latest.changed).toBe(false);
        });

        it('Remove takes it out of the list it moved to', () => {
            const { result } = openEmptied();
            act(() => result.current.addFirstField(revenueField));

            act(() => result.current.removeFilter());

            expect(latest.filters.metrics).toEqual([]);
            expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
        });

        it('carries the locks, and not "required" where no viewer could meet it', () => {
            const { result } = openEmptied({
                ...setting,
                lockedTabUuids: ['tab-1'],
            });
            expect(result.current.editingRule?.lockedTabUuids).toEqual([
                'tab-1',
            ]);
            act(() => result.current.addFirstField(statusField));
            const picked = latest.filters.dimensions[0];
            expect(picked.lockedTabUuids).toEqual(['tab-1']);
            expect(picked.required).toBe(false);
        });

        it('carries the shared rule it was in', () => {
            const { result } = openEmptied({
                ...rule('a', []),
                requiredGroupId: 'group',
            });
            act(() => result.current.addFirstField(statusField));
            expect(latest.filters.dimensions[0].requiredGroupId).toBe('group');
        });

        it('Done with no field drops the control', () => {
            const { result } = openEmptied();
            act(() => result.current.close());

            expect(result.current.isSidebarOpen).toBe(false);
            expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
            expect(latest.changed).toBe(true);
        });

        it('Discard restores the control as it was opened, field included', () => {
            const { result } = openEmptied();
            act(() => result.current.discard());

            expect(result.current.isSidebarOpen).toBe(false);
            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('Discard puts it back and keeps what was written outside the editor', () => {
            const { result } = openEmptied();
            writeOutsideTheEditor(excludeTileFromB);
            act(() => result.current.discard());

            expect(latest.filters.dimensions.map((r) => r.id)).toEqual([
                'a',
                'b',
            ]);
            expect(latest.filters.dimensions[0]).toEqual(rule('a', ['1']));
            expect(latest.filters.dimensions[1].tileTargets).toEqual({
                t2: false,
            });
            expect(latest.changed).toBe(true);
        });

        it('Discard undoes its writes to other filters too', () => {
            const { result } = openEmptied();
            act(() =>
                result.current.updateOtherFilters([
                    { ...rule('b', []), disabled: true },
                ]),
            );
            act(() => result.current.discard());

            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('opening the pill of another control drops it and opens that one', () => {
            const { result } = openEmptied();
            act(() => result.current.open('b'));

            expect(result.current.editing).toEqual({ filterId: 'b' });
            expect(result.current.isPlaceholder).toBe(false);
            expect(result.current.emptiedFieldLabel).toBeNull();
            expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
            expect(latest.changed).toBe(true);
            // Discarding the other one does not bring the dropped one back
            act(() => result.current.discard());
            expect(latest.filters.dimensions).toEqual([rule('b', ['2'])]);
        });

        it('a new control that got a field and lost it leaves nothing on Discard', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            expect(latest.changed).toBe(true);
            act(() => result.current.removeLastField('Status'));
            act(() => result.current.discard());

            expect(result.current.isSidebarOpen).toBe(false);
            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('keeps no name for a field that was not known', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.removeLastField(null));

            expect(result.current.isPlaceholder).toBe(true);
            expect(result.current.emptiedFieldLabel).toBeNull();
        });

        it('Discard restores it after another field was picked', () => {
            const { result } = openEmptied();
            act(() => result.current.addFirstField(statusField));
            act(() => result.current.discard());
            expect(latest.filters).toEqual(initialFilters);
        });

        it('opening another control, or Add, drops it as Done does', () => {
            const first = openEmptied();
            act(() => first.result.current.open('b'));
            expect(first.result.current.editing).toEqual({ filterId: 'b' });
            expect(first.result.current.isPlaceholder).toBe(false);
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
            first.unmount();

            const second = openEmptied();
            act(() => second.result.current.openNew());
            expect(second.result.current.isNew).toBe(true);
            expect(second.result.current.editing?.filterId).not.toBe('a');
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
        });

        it('a new control goes back to "pick a field" and is dropped on Done', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            const id = result.current.editing?.filterId;
            act(() => result.current.addFirstField(statusField));
            mockTrack.mockClear();
            act(() => result.current.removeLastField('A'));
            expect(result.current.isPlaceholder).toBe(true);
            expect(latest.filters).toEqual(initialFilters);

            act(() => result.current.addFirstField(statusField));
            expect(latest.filters.dimensions[2].id).toBe(id);
            expect(mockTrack).not.toHaveBeenCalled();

            act(() => result.current.removeLastField('A'));
            act(() => result.current.close());
            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
        });

        it('remembers the name of the field it lost until it has one again', () => {
            const { result } = openEmptied();
            expect(result.current.emptiedFieldLabel).toBe('A');

            act(() => result.current.addFirstField(statusField));
            expect(result.current.emptiedFieldLabel).toBeNull();
        });

        it('does nothing on a control with no field yet', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            const before = result.current.editingRule;
            act(() => result.current.removeLastField('A'));
            expect(result.current.editingRule).toBe(before);
        });
    });

    it('closing a new filter keeps it once it has a field, label or not', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.close());
        expect(latest.filters).toEqual(initialFilters);
        expect(latest.changed).toBe(false);

        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        act(() => result.current.close());
        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].label).toBeUndefined();
        expect(latest.changed).toBe(true);
        expect(result.current.isSidebarOpen).toBe(false);
    });

    it('closing with a default value switched on but empty turns it off', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() =>
            result.current.updateFilter({
                ...rule('a', []),
                disabled: false,
            }),
        );
        act(() => result.current.close());
        expect(latest.filters.dimensions[0].disabled).toBe(true);
        expect(latest.filters.dimensions[0].values).toEqual([]);
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

    it.each(['close', 'discard'] as const)(
        'a waiting field is gone when the filter is reopened after %s',
        (action) => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.addWaitingField('orders_region'));
            act(() => result.current[action]());

            act(() => result.current.open('a'));
            expect(result.current.waitingFieldIds).toEqual([]);
        },
    );

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
        act(() => result.current.close());
        expect(result.current.activeFieldId).toBeNull();
    });

    it('unclicking a field drops its hover too, and leaves another hover alone', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        // The pointer is still on the card that was clicked
        act(() => result.current.setHoveredFieldId('x'));
        act(() => result.current.setHighlightedFieldId('x'));
        act(() => result.current.clearHighlightedField());
        expect(result.current.highlightedFieldId).toBeNull();
        expect(result.current.hoveredFieldId).toBeNull();
        expect(result.current.activeFieldId).toBeNull();

        act(() => result.current.setHighlightedFieldId('x'));
        act(() => result.current.setHoveredFieldId('y'));
        act(() => result.current.clearHighlightedField());
        expect(result.current.highlightedFieldId).toBeNull();
        expect(result.current.hoveredFieldId).toBe('y');
    });

    it('closes when the dashboard leaves edit mode', () => {
        const { result, rerender } = setup();
        act(() => result.current.open('a'));
        mockParams.current = { mode: 'view' };
        rerender();
        expect(result.current.editing).toBeNull();
    });

    it('keeps a new filter whose label is written in the same event as close', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        const added = result.current.editingRule;
        if (!added) throw new Error('expected a filter');

        // Enter in the label input: the pending label, then close, with no render between
        act(() => {
            result.current.updateFilter({ ...added, label: 'S' });
            result.current.close();
        });

        expect(latest.filters.dimensions).toHaveLength(3);
        expect(latest.filters.dimensions[2].label).toBe('S');
        expect(result.current.isSidebarOpen).toBe(false);
    });

    it('keeps every callback stable across edits, hovers and other controls', () => {
        const { result } = setup();
        const callbacks = () =>
            Object.fromEntries(
                Object.entries(result.current).filter(
                    ([, value]) => typeof value === 'function',
                ),
            );
        const initial = callbacks();
        expect(Object.keys(initial)).toHaveLength(19);
        expect(initial).toHaveProperty('updateOtherFilters');
        expect(initial).toHaveProperty('removeLastField');
        expect(initial).toHaveProperty('addFirstSqlColumn');
        expect(initial).toHaveProperty('clearHighlightedField');
        expect(initial).not.toHaveProperty('clearFields');
        expect(initial).toHaveProperty('addFirstFieldOnTile');

        act(() => result.current.open('a'));
        act(() => result.current.updateFilter(rule('a', ['9'])));
        act(() => result.current.updateOtherFilters([rule('b', ['8'])]));
        act(() => result.current.setHoveredFieldId('orders_a'));
        act(() => result.current.setHighlightedFieldId('orders_a'));
        act(() => result.current.clearHighlightedField());

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

        act(() => current().setHoveredFieldId('orders_a'));
        act(() => current().setHighlightedFieldId('orders_a'));
        act(() => current().updateFilter({ ...rule('a', ['1']), label: 'A' }));
        act(() => current().setActiveSection('settings'));

        expect(renders.sliced).toBe(afterOpen.sliced);
        expect(renders.whole).toBe(afterOpen.whole + 4);
    });

    describe('link prompts', () => {
        it('a tile is new until the dashboard that holds it is saved', () => {
            mockTiles.current = [{ uuid: 't1' }, { uuid: 't2' }];
            const { result } = setup();
            expect(result.current.newTileUuids).toEqual(['t2']);
            mockTiles.current = [{ uuid: 't1' }];
        });

        it('remembers skipped prompts until edit mode ends', () => {
            const { result, rerender } = setup();
            act(() => result.current.dismissLink('t2', 'a'));
            expect(result.current.dismissedLinks).toEqual(['t2|a']);
            mockParams.current = { mode: 'view' };
            rerender();
            expect(result.current.dismissedLinks).toEqual([]);
        });
    });
});
