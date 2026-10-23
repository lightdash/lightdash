import {
    DimensionType,
    FieldType,
    FilterOperator,
    FilterType,
    MetricType,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type ResultColumn,
} from '@lightdash/common';
import { act, render, renderHook } from '@testing-library/react';
import {
    useState,
    type FC,
    type PropsWithChildren,
    type SetStateAction,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { EventName } from '../../types/Events';
import {
    dashboardEditActions,
    dashboardFiltersActions,
    selectDashboardFilters,
    selectHaveFiltersChanged,
    selectRawTemporaryFilters,
    useDashboardSelector,
    type DashboardStore,
} from '../dashboard/store';
import { getFilterLockToggle } from '../dashboardFilters/ActiveFilters/filterLock';
import {
    getFilterRuleWithDisabledState,
    getFilterRuleWithRequired,
} from '../dashboardFilters/FilterConfiguration/utils';
import { ControlsSidebarProvider } from './ControlsSidebarProvider';
import {
    getFieldCount,
    getTileField,
    setTileField,
    type FieldsByTile,
} from './peers';
import {
    useControlsSidebar,
    useControlsSidebarSelector,
    type ControlsSidebarContextValue,
} from './useControlsSidebar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockParams = vi.hoisted(() => ({ current: { mode: 'edit' } }));
// The provider's own mode input, as an embed sets it; undefined: the route's
const providerMode = vi.hoisted(() => ({
    isEditMode: undefined as boolean | undefined,
}));
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
// The store behind the mounted wrapper, for writes shipped code makes
let currentStore: DashboardStore = createDashboardTestStore();

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
    temporaryFilters: DashboardFilters;
    changed: boolean;
} = {
    filters: initialFilters,
    temporaryFilters: NO_TEMPORARY_FILTERS,
    changed: false,
};

// What the dashboard holds when the test starts
const saved = { filters: initialFilters };

// The provider's setters, backed by the store
const storeSetters = (store: DashboardStore) => ({
    setDashboardFilters: (value: SetStateAction<DashboardFilters>) =>
        store.dispatch(
            dashboardFiltersActions.setDashboardFilters(
                typeof value === 'function'
                    ? value(selectDashboardFilters(store.getState()))
                    : value,
            ),
        ),
    setHaveFiltersChanged: (value: SetStateAction<boolean>) =>
        store.dispatch(
            dashboardFiltersActions.setHaveFiltersChanged(
                typeof value === 'function'
                    ? value(selectHaveFiltersChanged(store.getState()))
                    : value,
            ),
        ),
    setDashboardTemporaryFilters: (value: SetStateAction<DashboardFilters>) =>
        store.dispatch(
            dashboardFiltersActions.setTemporaryFilters(
                typeof value === 'function'
                    ? value(selectRawTemporaryFilters(store.getState()))
                    : value,
            ),
        ),
    // As the dashboard provider writes a saved rule, from the saved dashboard
    updateDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
        isInEditMode: boolean,
    ) =>
        store.dispatch(
            dashboardFiltersActions.updateFilter({
                filter,
                index,
                isTemporary,
                isInEditMode,
                isFilterSaved: saved.filters.dimensions.some(
                    ({ id }) => id === filter.id,
                ),
                originalFilter: saved.filters.dimensions[index],
                category: 'dimensions',
            }),
        ),
});

const DashboardState: FC<
    PropsWithChildren<{ setters: ReturnType<typeof storeSetters> }>
> = ({ setters, children }) => {
    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const haveFiltersChanged = useDashboardSelector(selectHaveFiltersChanged);
    const temporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    mockDashboardContext.current = {
        ...setters,
        filterableFieldsByTileUuid: mockFieldsByTile.current,
        dashboard: { tiles: mockTiles.saved },
    };
    latest.filters = dashboardFilters;
    latest.temporaryFilters = temporaryFilters;
    latest.changed = haveFiltersChanged;
    return (
        <ControlsSidebarProvider isEditMode={providerMode.isEditMode}>
            {children}
        </ControlsSidebarProvider>
    );
};

// Real dashboard store behind the mocked dashboard context so edits re-render
const Wrapper: FC<PropsWithChildren> = ({ children }) => {
    const [store] = useState(() =>
        seedDashboardEditState(
            createDashboardTestStore({ dashboardFilters: saved.filters }),
            { dashboardTiles: mockTiles.current } as DashboardEditTestValues,
        ),
    );
    const [setters] = useState(() => storeSetters(store));
    currentStore = store;
    return (
        <DashboardStoreTestProvider store={store}>
            <DashboardState setters={setters}>{children}</DashboardState>
        </DashboardStoreTestProvider>
    );
};

const setup = () =>
    renderHook(() => useControlsSidebar(), { wrapper: Wrapper });

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
        latest.filters = initialFilters;
        latest.temporaryFilters = NO_TEMPORARY_FILTERS;
        latest.changed = false;
        mockParams.current = { mode: 'edit' };
        providerMode.isEditMode = undefined;
        mockTiles.current = [{ uuid: 't1' }];
        mockFieldsByTile.current = {};
        mockTrack.mockClear();
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

    describe('the rail with nothing expanded', () => {
        it('collapse keeps the edits and the rail, with nothing edited', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(rule('a', ['9'])));
            act(() => result.current.collapse());
            expect(latest.filters.dimensions[0].values).toEqual(['9']);
            expect(latest.changed).toBe(true);
            expect(result.current.editing).toBeNull();
            expect(result.current.isSidebarOpen).toBe(false);
            expect(result.current.isRailOpen).toBe(true);
        });

        it('collapse drops a new filter with no field, and keeps the rail', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.collapse());
            expect(latest.filters).toEqual(initialFilters);
            expect(latest.changed).toBe(false);
            expect(result.current.isRailOpen).toBe(true);
            expect(mockTrack).not.toHaveBeenCalled();
        });

        it('collapse keeps a new filter with a field, as Done does', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            act(() => result.current.collapse());
            expect(latest.filters.dimensions).toHaveLength(3);
            expect(mockTrack).toHaveBeenCalledTimes(1);
            expect(result.current.isRailOpen).toBe(true);
        });

        it('collapse turns off an empty default value', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter({
                    ...rule('a', []),
                    disabled: false,
                }),
            );
            act(() => result.current.collapse());
            expect(latest.filters.dimensions[0].disabled).toBe(true);
        });

        it('a row opens again from there, and close shuts the rail', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.collapse());
            act(() => result.current.open('b'));
            expect(result.current.editing).toEqual({ filterId: 'b' });
            expect(result.current.isSidebarOpen).toBe(true);

            act(() => result.current.collapse());
            act(() => result.current.close());
            expect(result.current.isRailOpen).toBe(false);
        });

        it('removing a filter keeps the rail open on the rest', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.removeFilter());
            expect(latest.filters.dimensions.map((r) => r.id)).toEqual(['b']);
            expect(result.current.isSidebarOpen).toBe(false);
            expect(result.current.isRailOpen).toBe(true);
        });

        it('discarding a new filter keeps the rail open', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            act(() => result.current.discard());
            expect(latest.filters).toEqual(initialFilters);
            expect(result.current.isRailOpen).toBe(true);
        });

        it('a rule removed from outside leaves the rail open on the rows', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            writeOutsideTheEditor((filters) => ({
                ...filters,
                dimensions: filters.dimensions.filter((r) => r.id !== 'a'),
            }));
            expect(result.current.isSidebarOpen).toBe(false);
            expect(result.current.isRailOpen).toBe(true);
        });

        it('forgets the hovered row when a filter opens or the rail closes', () => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.collapse());
            act(() => result.current.setHoveredFilterId('b'));
            expect(result.current.hoveredFilterId).toBe('b');
            act(() => result.current.open('b'));
            expect(result.current.hoveredFilterId).toBeNull();

            act(() => result.current.setHoveredFilterId('a'));
            act(() => result.current.close());
            expect(result.current.hoveredFilterId).toBeNull();
        });

        it("leaving a row keeps another row's hover", () => {
            const { result } = setup();
            act(() => result.current.setHoveredFilterId('b'));
            // Focus leaves row a while the mouse is on row b
            act(() => result.current.clearHoveredFilterId('a'));
            expect(result.current.hoveredFilterId).toBe('b');
            act(() => result.current.clearHoveredFilterId('b'));
            expect(result.current.hoveredFilterId).toBeNull();
        });

        it('leaving edit mode closes the rail', () => {
            const { result, rerender } = setup();
            act(() => result.current.openNew());
            act(() => result.current.collapse());
            mockParams.current = { mode: 'view' };
            rerender();
            expect(result.current.isRailOpen).toBe(false);
        });
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

    it('opens every filter with Tiles and Rules closed', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        expect(result.current.activeSection).toBeNull();
        act(() => result.current.setActiveSection('tiles'));
        expect(result.current.activeSection).toBe('tiles');

        act(() => result.current.open('b'));
        expect(result.current.activeSection).toBeNull();
    });

    it('Add opens a placeholder that stays out of the dashboard filters', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editingRule?.target.fieldId).toBe('');
        expect(result.current.activeSection).toBeNull();
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

    it('tracks a new filter once it is kept, never when it is discarded', () => {
        const event = {
            name: EventName.ADD_FILTER_CLICKED,
            properties: { mode: 'edit' },
        };
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        expect(mockTrack).not.toHaveBeenCalled();

        // Discarded, removed, or closed with no field: nothing was created
        act(() => result.current.discard());
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        act(() => result.current.removeFilter());
        act(() => result.current.openNew());
        act(() => result.current.close());
        expect(mockTrack).not.toHaveBeenCalled();

        // Kept with Done, the X or the pill
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        act(() => result.current.close());
        expect(mockTrack).toHaveBeenCalledTimes(1);
        expect(mockTrack).toHaveBeenLastCalledWith(event);

        // Kept by opening another control, from a tile or on a SQL column
        mockFieldsByTile.current = { t1: [statusField] };
        act(() => result.current.openNew());
        act(() => result.current.addFirstFieldOnTile(statusField, 't1'));
        act(() => result.current.openNew());
        expect(mockTrack).toHaveBeenCalledTimes(2);
        act(() =>
            result.current.addFirstSqlColumn(
                { reference: 'total', type: DimensionType.NUMBER },
                {},
            ),
        );
        act(() => result.current.close());
        expect(mockTrack).toHaveBeenCalledTimes(3);
        expect(mockTrack).toHaveBeenLastCalledWith(event);

        // Reopening and closing a filter that already existed tracks nothing
        const kept = latest.filters.dimensions[2];
        act(() => result.current.open(kept.id));
        act(() => result.current.close());
        expect(mockTrack).toHaveBeenCalledTimes(3);
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
        act(() => result.current.setActiveSection('rules'));
        act(() => result.current.setHighlightedFieldId('orders_a'));
        act(() => result.current.setHoveredFieldId('orders_a'));

        act(() => result.current.openNew());
        expect(result.current.isNew).toBe(true);
        expect(result.current.isPlaceholder).toBe(true);
        expect(result.current.editing?.filterId).not.toBe('a');
        expect(result.current.activeSection).toBeNull();
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

    it('the first field keeps the sidebar open on the rule it wrote, until something removes it', () => {
        const { result } = setup();
        act(() => result.current.openNew());
        const id = result.current.editing?.filterId;

        act(() => result.current.addFirstField(statusField));
        expect(result.current.isPlaceholder).toBe(false);
        expect(result.current.isSidebarOpen).toBe(true);
        expect(result.current.editingRule).toMatchObject({
            id,
            target: { fieldId: 'orders_status' },
        });

        writeOutsideTheEditor((filters) => ({
            ...filters,
            dimensions: filters.dimensions.filter((r) => r.id !== id),
        }));
        expect(result.current.editingRule).toBeNull();
        expect(result.current.isSidebarOpen).toBe(false);
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

        it('offer Discard when they are all the editor changed', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateOtherFilters([
                    asAlternative(initialFilters.dimensions[1]),
                ]),
            );

            expect(result.current.isDirty).toBe(true);
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
            act(() => {
                currentStore.dispatch(
                    dashboardFiltersActions.setTemporaryFilters({
                        ...NO_TEMPORARY_FILTERS,
                        dimensions: [rule('temporary', ['x'])],
                    }),
                );
            });
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
        act(() => result.current.setActiveSection('rules'));
        act(() => result.current.addWaitingField('orders_region'));

        act(() => result.current.open('a'));

        // Same snapshot, so the edit can still be discarded
        expect(result.current.isDirty).toBe(true);
        expect(result.current.activeSection).toBe('rules');
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

    it('drops a field that loses its last tile', () => {
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
        expect(result.current.waitingFieldIds).toEqual([]);

        // Back on a tile, it is a field of the filter again
        act(() =>
            result.current.updateFilter({
                ...rule('a', ['1']),
                tileTargets: { t1: peer },
            }),
        );
        expect(result.current.waitingFieldIds).toEqual([]);
    });

    describe('a field that loses its last tile', () => {
        const regionField: DashboardFilterableField = {
            ...statusField,
            name: 'region',
            label: 'Region',
        };
        const status = { fieldId: 'orders_status', tableName: 'orders' };
        const region = { fieldId: 'orders_region', tableName: 'orders' };
        const onStatus = (
            tileTargets: DashboardFilterRule['tileTargets'],
        ): DashboardFilterRule => ({
            ...rule('a', ['1']),
            target: status,
            tileTargets,
        });

        beforeEach(() => {
            mockTiles.current = [{ uuid: 't1' }, { uuid: 't2' }];
            mockFieldsByTile.current = {
                t1: [statusField, regionField],
                t2: [statusField, regionField],
            };
        });

        it('promotes the next field once no tile is on the first one', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(onStatus({ t1: region })));
            act(() => result.current.setHighlightedFieldId('orders_status'));
            act(() =>
                result.current.updateFilter(
                    onStatus({ t1: region, t2: region }),
                ),
            );

            expect(result.current.editingRule?.target).toEqual(region);
            expect(result.current.highlightedFieldId).toBeNull();
        });

        describe('with Undo', () => {
            const APPLY = {
                kind: 'apply' as const,
                fieldId: 'orders_region',
                tileCount: 2,
                replaced: 1,
                acrossTabs: false,
            };
            // Status on t2, Region on t1; then Region on both
            const applyRegionToAll = (result: {
                current: ControlsSidebarContextValue;
            }) => {
                act(() => result.current.open('a'));
                act(() =>
                    result.current.updateFilter(onStatus({ t1: region })),
                );
                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: region, t2: region }),
                        APPLY,
                    ),
                );
            };

            it('puts the rule back as it was, with the field it promoted away, and ends', () => {
                const { result } = setup();
                applyRegionToAll(result);
                expect(result.current.editingRule?.target).toEqual(region);
                expect(result.current.fieldUndo).toEqual(APPLY);

                act(() => result.current.undoApply());
                expect(result.current.editingRule).toEqual(
                    onStatus({ t1: region }),
                );
                expect(result.current.fieldUndo).toBeNull();
            });

            it('ends with any later edit to the rule, and then does nothing', () => {
                const { result } = setup();
                applyRegionToAll(result);
                const edited = {
                    ...(result.current.editingRule as DashboardFilterRule),
                    label: 'Renamed',
                };
                act(() => result.current.updateFilter(edited));
                expect(result.current.fieldUndo).toBeNull();

                act(() => result.current.undoApply());
                expect(result.current.editingRule).toEqual(edited);
            });

            it('ends with a write from outside the editor', () => {
                const { result } = setup();
                applyRegionToAll(result);
                writeOutsideTheEditor((filters) => ({
                    ...filters,
                    dimensions: filters.dimensions.map((r) =>
                        r.id === 'a' ? { ...r, label: 'Outside' } : r,
                    ),
                }));
                expect(result.current.fieldUndo).toBeNull();
            });

            it('ends when another field is clicked, not when the same one is', () => {
                const { result } = setup();
                applyRegionToAll(result);
                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                expect(result.current.fieldUndo).toEqual(APPLY);
                act(() =>
                    result.current.setHighlightedFieldId('orders_status'),
                );
                expect(result.current.fieldUndo).toBeNull();
            });

            it('ends when the field is unclicked, either way', () => {
                const { result } = setup();
                applyRegionToAll(result);
                act(() => result.current.setHighlightedFieldId(null));
                expect(result.current.fieldUndo).toBeNull();

                act(() => result.current.undoApply());
                expect(result.current.editingRule?.target).toEqual(region);

                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: region }),
                        APPLY,
                    ),
                );
                expect(result.current.fieldUndo).toEqual(APPLY);
                act(() => result.current.clearHighlightedField());
                expect(result.current.fieldUndo).toBeNull();
            });

            it('is made only for the clicked field, as the bar is the only one to show it', () => {
                const { result } = setup();
                act(() => result.current.open('a'));
                act(() =>
                    result.current.updateFilter(onStatus({ t1: region })),
                );
                // A tile card's follow-up while nothing is clicked
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: region, t2: region }),
                        APPLY,
                    ),
                );
                expect(result.current.editingRule?.target).toEqual(region);
                expect(result.current.fieldUndo).toBeNull();
            });

            it('brings back a waiting field the apply put on tiles', () => {
                const { result } = setup();
                act(() => result.current.open('a'));
                act(() => result.current.updateFilter(onStatus(undefined)));
                act(() => result.current.addWaitingField('orders_region'));
                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: region }),
                        APPLY,
                    ),
                );
                expect(result.current.waitingFieldIds).toEqual([]);

                act(() => result.current.undoApply());
                expect(result.current.editingRule).toEqual(onStatus(undefined));
                expect(result.current.waitingFieldIds).toEqual([
                    'orders_region',
                ]);
            });

            it('is gone on another tab after a this-tab apply, and back on its tab', () => {
                const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
                const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
                const { result } = setup();
                act(() => {
                    currentStore.dispatch(
                        dashboardEditActions.setActiveTab(TAB_1),
                    );
                });
                applyRegionToAll(result);
                expect(result.current.fieldUndo).toEqual(APPLY);

                act(() => {
                    currentStore.dispatch(
                        dashboardEditActions.setActiveTab(TAB_2),
                    );
                });
                expect(result.current.fieldUndo).toBeNull();
                const written = result.current.editingRule;
                act(() => result.current.undoApply());
                expect(result.current.editingRule).toEqual(written);
            });

            it('stays on every tab after an apply across tabs', () => {
                const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
                const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
                const { result } = setup();
                act(() => {
                    currentStore.dispatch(
                        dashboardEditActions.setActiveTab(TAB_1),
                    );
                });
                act(() => result.current.open('a'));
                act(() =>
                    result.current.updateFilter(onStatus({ t1: region })),
                );
                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                const ACROSS = { ...APPLY, acrossTabs: true };
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: region, t2: region }),
                        ACROSS,
                    ),
                );
                act(() => {
                    currentStore.dispatch(
                        dashboardEditActions.setActiveTab(TAB_2),
                    );
                });
                expect(result.current.fieldUndo).toEqual(ACROSS);
            });

            it('is not kept for a clear that promoted its field away, which unclicks it', () => {
                const { result } = setup();
                act(() => result.current.open('a'));
                act(() =>
                    result.current.updateFilter(onStatus({ t1: region })),
                );
                act(() =>
                    result.current.setHighlightedFieldId('orders_status'),
                );
                const CLEAR = {
                    kind: 'clear' as const,
                    fieldId: 'orders_status',
                    tileCount: 1,
                    replaced: 0,
                    acrossTabs: false,
                };
                // Status off its last tile: Region is promoted
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: region, t2: false }),
                        CLEAR,
                    ),
                );
                expect(result.current.editingRule?.target).toEqual(region);

                // Promotion unclicks Status: no bar is left to show Undo
                expect(result.current.highlightedFieldId).toBeNull();
                expect(result.current.fieldUndo).toBeNull();
            });

            it('takes back a clear', () => {
                const { result } = setup();
                act(() => result.current.open('a'));
                act(() =>
                    result.current.updateFilter(onStatus({ t1: region })),
                );
                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                const CLEAR = {
                    kind: 'clear' as const,
                    fieldId: 'orders_region',
                    tileCount: 1,
                    replaced: 0,
                    acrossTabs: false,
                };
                act(() =>
                    result.current.applyWithUndo(
                        onStatus({ t1: false }),
                        CLEAR,
                    ),
                );
                act(() =>
                    result.current.setHighlightedFieldId('orders_region'),
                );
                expect(result.current.fieldUndo).toEqual(CLEAR);

                act(() => result.current.undoApply());
                expect(result.current.editingRule).toEqual(
                    onStatus({ t1: region }),
                );
                expect(result.current.fieldUndo).toBeNull();
            });

            it('ends when a waiting field is removed, so Undo cannot bring it back', () => {
                const { result } = setup();
                act(() => result.current.open('a'));
                act(() => result.current.updateFilter(onStatus(undefined)));
                act(() => result.current.addWaitingField('orders_region'));
                act(() =>
                    result.current.setHighlightedFieldId('orders_status'),
                );
                act(() =>
                    result.current.applyWithUndo(onStatus({ t1: false }), {
                        kind: 'clear',
                        fieldId: 'orders_status',
                        tileCount: 1,
                        replaced: 0,
                        acrossTabs: false,
                    }),
                );
                expect(result.current.fieldUndo).not.toBeNull();

                act(() => result.current.removeWaitingField('orders_region'));
                expect(result.current.fieldUndo).toBeNull();
                act(() => result.current.undoApply());
                expect(result.current.waitingFieldIds).toEqual([]);
            });

            describe('a clicked field a clear took off its last tile', () => {
                const CLEAR_REGION = {
                    kind: 'clear' as const,
                    fieldId: 'orders_region',
                    tileCount: 1,
                    replaced: 0,
                    acrossTabs: false,
                };
                const clearRegion = (result: {
                    current: ControlsSidebarContextValue;
                }) => {
                    act(() => result.current.open('a'));
                    act(() =>
                        result.current.updateFilter(onStatus({ t1: region })),
                    );
                    act(() =>
                        result.current.setHighlightedFieldId('orders_region'),
                    );
                    act(() =>
                        result.current.applyWithUndo(
                            onStatus({ t1: false }),
                            CLEAR_REGION,
                        ),
                    );
                };

                it('is never clicked when it is not a field of the filter', () => {
                    const { result } = setup();
                    act(() => result.current.open('a'));
                    act(() =>
                        result.current.setHighlightedFieldId('orders_region'),
                    );
                    expect(result.current.highlightedFieldId).toBeNull();
                });

                it('stays clicked while its undo lives, and is no field once it ends', () => {
                    const { result } = setup();
                    clearRegion(result);
                    expect(result.current.highlightedFieldId).toBe(
                        'orders_region',
                    );
                    expect(result.current.activeFieldId).toBe('orders_region');

                    act(() =>
                        result.current.updateFilter({
                            ...(result.current
                                .editingRule as DashboardFilterRule),
                            values: ['2'],
                        }),
                    );
                    expect(result.current.fieldUndo).toBeNull();
                    expect(result.current.highlightedFieldId).toBeNull();
                    expect(result.current.activeFieldId).toBeNull();
                });

                it('is not clicked again when it comes back as a waiting field', () => {
                    const { result } = setup();
                    clearRegion(result);
                    act(() =>
                        result.current.updateFilter({
                            ...(result.current
                                .editingRule as DashboardFilterRule),
                            values: ['2'],
                        }),
                    );
                    act(() => result.current.addWaitingField('orders_region'));
                    expect(result.current.waitingFieldIds).toContain(
                        'orders_region',
                    );
                    expect(result.current.highlightedFieldId).toBeNull();
                });

                it('is hidden on another tab and back with its live undo', () => {
                    const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
                    const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
                    const { result } = setup();
                    act(() => {
                        currentStore.dispatch(
                            dashboardEditActions.setActiveTab(TAB_1),
                        );
                    });
                    clearRegion(result);
                    act(() => {
                        currentStore.dispatch(
                            dashboardEditActions.setActiveTab(TAB_2),
                        );
                    });
                    expect(result.current.highlightedFieldId).toBeNull();

                    act(() => {
                        currentStore.dispatch(
                            dashboardEditActions.setActiveTab(TAB_1),
                        );
                    });
                    expect(result.current.fieldUndo).toEqual(CLEAR_REGION);
                    expect(result.current.highlightedFieldId).toBe(
                        'orders_region',
                    );
                });
            });

            it('ends when the editor writes another filter', () => {
                const { result } = setup();
                applyRegionToAll(result);
                act(() =>
                    result.current.updateOtherFilters([
                        { ...rule('b', ['2']), label: 'Other' },
                    ]),
                );
                expect(result.current.fieldUndo).toBeNull();
            });

            it('ends once another control opens, and Undo does nothing there', () => {
                const { result } = setup();
                applyRegionToAll(result);
                const written = result.current.editingRule;
                act(() => result.current.open('b'));
                expect(result.current.fieldUndo).toBeNull();

                act(() => result.current.undoApply());
                expect(
                    latest.filters.dimensions.find((r) => r.id === 'a'),
                ).toEqual(written);
            });

            it('ends when the editor closes', () => {
                const { result } = setup();
                applyRegionToAll(result);
                act(() => result.current.close());
                expect(result.current.fieldUndo).toBeNull();
            });

            it('is not offered for a press that changed nothing', () => {
                const { result } = setup();
                applyRegionToAll(result);
                act(() => result.current.undoApply());
                act(() =>
                    result.current.applyWithUndo(
                        result.current.editingRule as DashboardFilterRule,
                        APPLY,
                    ),
                );
                expect(result.current.fieldUndo).toBeNull();
            });
        });

        it('leaves a first field that was already on no tile alone', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter(
                    onStatus({ t1: false, t2: region }),
                ),
            );
            act(() =>
                result.current.updateFilter({
                    ...onStatus({ t1: false, t2: region }),
                    label: 'Renamed',
                }),
            );

            expect(result.current.editingRule?.target).toEqual(status);
        });

        it('keeps the first field when it is the only one', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter(onStatus({ t1: false, t2: false })),
            );

            expect(result.current.editingRule?.target).toEqual(status);
        });

        it('does not bring back a waiting field once it was on a tile', () => {
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(onStatus(undefined)));
            act(() => result.current.addWaitingField('orders_region'));
            expect(result.current.waitingFieldIds).toEqual(['orders_region']);

            act(() => result.current.updateFilter(onStatus({ t1: region })));
            act(() => result.current.updateFilter(onStatus(undefined)));

            expect(result.current.waitingFieldIds).toEqual([]);
        });
    });

    it('the hovered field wins over the highlighted one', () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        act(() => result.current.setHighlightedFieldId('orders_a'));
        expect(result.current.activeFieldId).toBe('orders_a');
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
        expect(Object.keys(initial)).toHaveLength(24);
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
        act(() => current().setActiveSection('rules'));

        expect(renders.sliced).toBe(afterOpen.sliced);
        expect(renders.whole).toBe(afterOpen.whole + 4);
    });

    describe('an edit put back by hand', () => {
        // As a saved dashboard arrives: JSON has no undefined
        const asSaved = (filters: DashboardFilters): DashboardFilters =>
            JSON.parse(JSON.stringify(filters));

        it('leaves nothing changed after a lock is switched on and off', () => {
            saved.filters = asSaved(initialFilters);
            const savedA = saved.filters.dimensions[0];
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter({
                    ...savedA,
                    lockedTabUuids: ['tab-1'],
                }),
            );
            act(() =>
                result.current.updateFilter({
                    ...savedA,
                    lockedTabUuids: undefined,
                }),
            );
            expect(result.current.isDirty).toBe(false);

            act(() => result.current.close());
            expect(latest.changed).toBe(false);
        });

        const leaveOutAndPutBack = (
            onTile: DashboardFilterRule,
            tile: DashboardTile,
            updateFilter: (next: DashboardFilterRule) => void,
        ) => {
            const fields = mockFieldsByTile.current as FieldsByTile;
            const leftOut = setTileField(onTile, tile, null, fields);
            act(() => updateFilter(leftOut));
            act(() =>
                updateFilter(
                    setTileField(leftOut, tile, onTile.target, fields),
                ),
            );
        };
        const statusTarget = { fieldId: 'orders_status', tableName: 'orders' };

        it('leaves nothing changed after a tile is left out and put back', () => {
            const onTile = {
                ...rule('status', ['x']),
                target: statusTarget,
                tileTargets: { t1: statusTarget, t2: statusTarget },
            };
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [onTile],
            });
            mockTiles.current = [{ uuid: 't1' }, { uuid: 't2' }];
            mockFieldsByTile.current = {
                t1: [statusField],
                t2: [statusField],
            };
            const { result } = setup();
            act(() => result.current.open('status'));
            leaveOutAndPutBack(
                onTile,
                mockTiles.current[0] as DashboardTile,
                result.current.updateFilter,
            );
            expect(result.current.isDirty).toBe(false);

            act(() => result.current.close());
            expect(latest.changed).toBe(false);
        });

        // Tabs apply a rule with no tile targets everywhere, so losing the last
        // entry is a change even when it only said the default
        it('sees a tile put back that leaves the rule with no tile targets as a change', () => {
            const onTile = {
                ...rule('status', ['x']),
                target: statusTarget,
                tileTargets: { t1: statusTarget },
            };
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [onTile],
            });
            mockFieldsByTile.current = { t1: [statusField] };
            const { result } = setup();
            act(() => result.current.open('status'));
            leaveOutAndPutBack(
                onTile,
                mockTiles.current[0] as DashboardTile,
                result.current.updateFilter,
            );
            expect(result.current.isDirty).toBe(true);

            act(() => result.current.close());
            expect(latest.changed).toBe(true);
        });

        it('leaves nothing changed after a tab is unlocked and locked again', () => {
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [
                    { ...rule('a', ['1']), lockedTabUuids: ['t1', 't2'] },
                ],
            });
            const savedA = saved.filters.dimensions[0];
            // What the pill and "Viewer access" write for tab t1
            const toggleLockOnT1 = (
                filterRule: DashboardFilterRule,
                isLocked: boolean,
            ) => {
                const toggle = getFilterLockToggle(filterRule, {
                    isLocked,
                    hasTabs: true,
                    activeTabUuid: 't1',
                    dashboardUuid: 'dashboard',
                });
                if (toggle === null) throw new Error('No lock key');
                return toggle.filterRule;
            };
            const unlocked = toggleLockOnT1(savedA, true);
            const relocked = toggleLockOnT1(unlocked, false);
            expect(relocked.lockedTabUuids).toEqual(['t2', 't1']);

            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(unlocked));
            act(() => result.current.updateFilter(relocked));
            expect(result.current.isDirty).toBe(false);

            act(() => result.current.close());
            expect(latest.changed).toBe(false);
        });

        // The shipped "Required" switch, with the shipped disabled rule
        const switchRequired = (
            from: DashboardFilterRule,
            savedRule: DashboardFilterRule,
            checked: boolean,
        ) =>
            getFilterRuleWithDisabledState(
                getFilterRuleWithRequired(
                    FilterType.STRING,
                    statusField,
                    from,
                    savedRule,
                    checked,
                ),
                true,
            );

        it('leaves nothing changed after "Required" is switched on and off', () => {
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [{ ...rule('a', []), disabled: true }],
            });
            const savedA = saved.filters.dimensions[0];
            const required = switchRequired(savedA, savedA, true);
            const notRequired = switchRequired(required, savedA, false);
            expect(notRequired.required).toBe(false);

            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(required));
            act(() => result.current.updateFilter(notRequired));
            expect(result.current.isDirty).toBe(false);

            act(() => result.current.close());
            expect(latest.changed).toBe(false);
        });

        it('drops the default value when "Required" is switched off, as the shipped form does', () => {
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [
                    { ...rule('a', ['credit_card']), disabled: false },
                ],
            });
            const savedA = saved.filters.dimensions[0];
            const required = switchRequired(savedA, savedA, true);
            expect(required.values).toEqual(['credit_card']);
            const notRequired = switchRequired(required, savedA, false);
            expect(notRequired.values).toEqual([]);

            const { result } = setup();
            act(() => result.current.open('a'));
            act(() => result.current.updateFilter(required));
            act(() => result.current.updateFilter(notRequired));
            expect(result.current.isDirty).toBe(true);
        });

        // Tabs apply a rule with no tile targets everywhere, but one with empty
        // tile targets only where a tile has its field
        it('sees a rule saved with empty tile targets that loses them as a change', () => {
            const onTile = {
                ...rule('status', ['x']),
                target: { fieldId: 'orders_status', tableName: 'orders' },
                tileTargets: {},
            };
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [onTile],
            });
            expect(saved.filters.dimensions[0].tileTargets).toEqual({});
            mockFieldsByTile.current = { t1: [statusField] };
            const tile = mockTiles.current[0] as DashboardTile;
            const { result } = setup();
            act(() => result.current.open('status'));
            const leftOut = setTileField(
                saved.filters.dimensions[0],
                tile,
                null,
                mockFieldsByTile.current as FieldsByTile,
            );
            act(() => result.current.updateFilter(leftOut));
            const putBack = setTileField(
                leftOut,
                tile,
                onTile.target,
                mockFieldsByTile.current as FieldsByTile,
            );
            expect(putBack).not.toHaveProperty('tileTargets');
            act(() => result.current.updateFilter(putBack));
            expect(result.current.isDirty).toBe(true);

            act(() => result.current.close());
            expect(latest.changed).toBe(true);
        });

        it('still sees a lock moved to another tab as a change', () => {
            saved.filters = asSaved({
                ...initialFilters,
                dimensions: [{ ...rule('a', ['1']), lockedTabUuids: ['t1'] }],
            });
            const savedA = saved.filters.dimensions[0];
            const { result } = setup();
            act(() => result.current.open('a'));
            act(() =>
                result.current.updateFilter({
                    ...savedA,
                    lockedTabUuids: ['t2'],
                }),
            );
            expect(result.current.isDirty).toBe(true);

            act(() => result.current.close());
            expect(latest.changed).toBe(true);
        });
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

// What the value input writes once a viewer picks a value
const withValue = (filterRule: DashboardFilterRule): DashboardFilterRule => ({
    ...filterRule,
    values: ['done'],
    disabled: false,
});

describe('ControlsSidebarProvider in view mode', () => {
    beforeEach(() => {
        saved.filters = initialFilters;
        latest.filters = initialFilters;
        latest.temporaryFilters = NO_TEMPORARY_FILTERS;
        latest.changed = false;
        mockParams.current = { mode: 'view' };
        providerMode.isEditMode = undefined;
        mockTiles.current = [{ uuid: 't1' }];
        mockFieldsByTile.current = {};
        mockTrack.mockClear();
    });

    it("adds a viewer's filter to the temporary filters, never the saved ones", () => {
        const { result } = setup();
        expect(result.current.isViewer).toBe(true);
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));

        expect(latest.filters).toEqual(initialFilters);
        expect(latest.temporaryFilters.dimensions).toHaveLength(1);
        const added = latest.temporaryFilters.dimensions[0];
        expect(added.target.fieldId).toBe('orders_status');
        // No value yet: "any value", as the shipped popover writes it
        expect(added.disabled).toBe(true);
        expect(result.current.editingRule?.id).toBe(added.id);

        act(() => result.current.updateFilter(withValue(added)));
        act(() => result.current.close());
        expect(latest.temporaryFilters.dimensions).toHaveLength(1);
        expect(mockTrack).toHaveBeenCalledWith({
            name: EventName.ADD_FILTER_CLICKED,
            properties: { mode: 'viewer' },
        });
    });

    it.each(['close', 'collapse'] as const)(
        "drops a viewer's new filter left with no value on %s, as the shipped Apply",
        (way) => {
            const { result } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            expect(latest.temporaryFilters.dimensions).toHaveLength(1);

            act(() => result.current[way]());
            expect(latest.temporaryFilters).toEqual(NO_TEMPORARY_FILTERS);
            expect(latest.changed).toBe(false);
            expect(result.current.editing).toBeNull();
            expect(mockTrack).not.toHaveBeenCalled();
        },
    );

    it("discarding a viewer's new filter leaves nothing behind", () => {
        const { result } = setup();
        act(() => result.current.openNew());
        act(() => result.current.addFirstField(statusField));
        expect(latest.changed).toBe(true);

        act(() => result.current.discard());
        expect(latest.temporaryFilters).toEqual(NO_TEMPORARY_FILTERS);
        expect(latest.changed).toBe(false);
        expect(result.current.isRailOpen).toBe(true);
        expect(mockTrack).not.toHaveBeenCalled();
    });

    it("edits, puts back and removes a viewer's own filter", () => {
        const own = rule('own', ['x']);
        const { result } = setup();
        act(() => {
            currentStore.dispatch(
                dashboardFiltersActions.setTemporaryFilters({
                    ...NO_TEMPORARY_FILTERS,
                    dimensions: [own],
                }),
            );
        });
        act(() => result.current.open('own'));
        act(() => result.current.updateFilter(rule('own', ['y'])));
        expect(latest.temporaryFilters.dimensions[0].values).toEqual(['y']);
        expect(result.current.isDirty).toBe(true);

        act(() => result.current.discard());
        expect(latest.temporaryFilters.dimensions[0].values).toEqual(['x']);

        act(() => result.current.open('own'));
        act(() => result.current.removeFilter());
        expect(latest.temporaryFilters.dimensions).toEqual([]);
        expect(latest.filters).toEqual(initialFilters);
    });

    it('removes a pill of their own by id', () => {
        const { result } = setup();
        act(() => {
            currentStore.dispatch(
                dashboardFiltersActions.setTemporaryFilters({
                    ...NO_TEMPORARY_FILTERS,
                    dimensions: [rule('own', ['x'])],
                }),
            );
        });
        act(() => result.current.removeFilterById('own'));
        expect(latest.temporaryFilters.dimensions).toEqual([]);
        expect(latest.filters).toEqual(initialFilters);
    });

    it("never opens a saved filter: it keeps the bar's popover", () => {
        const { result } = setup();
        act(() => result.current.open('a'));
        expect(result.current.isRailOpen).toBe(false);
        expect(result.current.editing).toBeNull();
        expect(latest.filters).toEqual(initialFilters);
    });

    describe('a mode change closes the edit as Done does', () => {
        it('drops a new filter with no field, on the filters it started in', () => {
            const { result, rerender } = setup();
            act(() => result.current.openNew());
            mockParams.current = { mode: 'edit' };
            rerender();
            expect(result.current.isRailOpen).toBe(false);
            expect(result.current.editingRule).toBeNull();
            expect(latest.temporaryFilters).toEqual(NO_TEMPORARY_FILTERS);
            expect(latest.filters).toEqual(initialFilters);
            expect(mockTrack).not.toHaveBeenCalled();

            mockParams.current = { mode: 'view' };
            rerender();
            expect(result.current.isRailOpen).toBe(false);
        });

        it('drops a new viewer filter with no value', () => {
            const { result, rerender } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            mockParams.current = { mode: 'edit' };
            rerender();
            expect(result.current.isRailOpen).toBe(false);
            expect(latest.temporaryFilters).toEqual(NO_TEMPORARY_FILTERS);
            expect(mockTrack).not.toHaveBeenCalled();
        });

        it('keeps and tracks a new viewer filter with a value, as temporary', () => {
            const { result, rerender } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            act(() =>
                result.current.updateFilter(
                    withValue(latest.temporaryFilters.dimensions[0]),
                ),
            );
            mockParams.current = { mode: 'edit' };
            rerender();
            expect(result.current.isRailOpen).toBe(false);
            expect(latest.temporaryFilters.dimensions).toHaveLength(1);
            expect(latest.filters).toEqual(initialFilters);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.ADD_FILTER_CLICKED,
                properties: { mode: 'viewer' },
            });

            mockParams.current = { mode: 'view' };
            rerender();
            expect(latest.temporaryFilters.dimensions).toHaveLength(1);
            expect(result.current.isRailOpen).toBe(false);
        });

        it('keeps an editor filter in the saved filters on the way back to view mode', () => {
            mockParams.current = { mode: 'edit' };
            const { result, rerender } = setup();
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            mockParams.current = { mode: 'view' };
            rerender();
            expect(latest.filters.dimensions).toHaveLength(3);
            expect(latest.temporaryFilters).toEqual(NO_TEMPORARY_FILTERS);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.ADD_FILTER_CLICKED,
                properties: { mode: 'edit' },
            });
            expect(result.current.isRailOpen).toBe(false);
        });

        it('follows the mode an embed gives it, where no route says one', () => {
            mockParams.current = { mode: '' };
            providerMode.isEditMode = false;
            const { result, rerender } = setup();
            expect(result.current.isViewer).toBe(true);
            act(() => result.current.openNew());
            act(() => result.current.addFirstField(statusField));
            act(() =>
                result.current.updateFilter(
                    withValue(latest.temporaryFilters.dimensions[0]),
                ),
            );

            providerMode.isEditMode = true;
            rerender();
            expect(result.current.isViewer).toBe(false);
            expect(result.current.isRailOpen).toBe(false);
            expect(result.current.editing).toBeNull();
            expect(latest.temporaryFilters.dimensions).toHaveLength(1);

            providerMode.isEditMode = false;
            rerender();
            expect(result.current.isRailOpen).toBe(false);
            expect(result.current.editing).toBeNull();
        });
    });

    it('closes the rail when the dashboard enters edit mode', () => {
        const { result, rerender } = setup();
        act(() => result.current.openNew());
        expect(result.current.isRailOpen).toBe(true);
        mockParams.current = { mode: 'edit' };
        rerender();
        expect(result.current.isRailOpen).toBe(false);
        expect(result.current.isViewer).toBe(false);
    });
});
