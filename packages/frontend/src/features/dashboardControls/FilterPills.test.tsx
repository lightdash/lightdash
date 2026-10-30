import type * as DndKitCore from '@dnd-kit/core';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'fs';
import path from 'path';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    type DashboardStoreTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { EventName } from '../../types/Events';
import { dashboardEditActions } from '../dashboard/store';
import type * as FilterPillButtonModule from '../dashboardFilters/ActiveFilters/FilterPillButton';
import { BarSelectionContext } from './barSelection';
import { FilterPills } from './FilterPills';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
let storeValues: DashboardStoreTestValues = {};

// A rerender keeps the store the first render made
const renderWithProviders = (ui: ReactElement) => {
    const store = seedDashboardEditState(
        createDashboardTestStore(storeValues),
        mockDashboardContext.current as DashboardEditTestValues,
    );
    const withStore = (node: ReactElement) => (
        <DashboardStoreTestProvider store={store}>
            {node}
        </DashboardStoreTestProvider>
    );
    const result = renderWithAppProviders(withStore(ui));
    return {
        ...result,
        store,
        rerender: (node: ReactElement) => result.rerender(withStore(node)),
    };
};
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));
const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTrack = vi.hoisted(() => vi.fn());
const pillRenders = vi.hoisted(() => ({ count: 0 }));
const mockDragEnd = vi.hoisted(() => ({
    handlers: [] as ((event: DragEndEvent) => void)[],
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector(mockTileStatus.current)),
}));
vi.mock('../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mockTrack }),
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));
vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock(
    '../dashboardFilters/ActiveFilters/FilterPillButton',
    async (importOriginal) => {
        const actual = await importOriginal<typeof FilterPillButtonModule>();
        const { forwardRef } = await import('react');
        type Props = Parameters<typeof actual.FilterPillButton>[0];
        return {
            ...actual,
            FilterPillButton: forwardRef<HTMLButtonElement, Props>(
                (props, ref) => {
                    pillRenders.count += 1;
                    return <actual.FilterPillButton {...props} ref={ref} />;
                },
            ),
        };
    },
);
// The drag gesture is dnd-kit's; the handlers are captured, in render order
vi.mock('@dnd-kit/core', async (importOriginal) => {
    const actual = await importOriginal<typeof DndKitCore>();
    return {
        ...actual,
        DndContext: (props: Parameters<typeof actual.DndContext>[0]) => {
            if (props.onDragEnd) mockDragEnd.handlers.push(props.onDragEnd);
            return <actual.DndContext {...props} />;
        },
    };
});

const savedRule: DashboardFilterRule = {
    id: 'saved',
    label: 'Status',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
};

const noDefaultRule: DashboardFilterRule = {
    id: 'no-default',
    label: 'Region',
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_region', tableName: 'orders' },
    values: [],
    disabled: true,
};

const metricRule: DashboardFilterRule = {
    id: 'metric',
    label: undefined,
    operator: FilterOperator.GREATER_THAN,
    target: { fieldId: 'orders_total_revenue', tableName: 'orders' },
    values: [100],
};

const field = (name: string, label: string, type = DimensionType.STRING) => ({
    name,
    table: 'orders',
    tableLabel: 'Orders',
    label,
    type,
    fieldType: 'dimension',
});

const tile = (uuid: string, tabUuid?: string) =>
    ({
        uuid,
        tabUuid,
        type: DashboardTileTypes.SAVED_CHART,
        properties: {},
    }) as DashboardTile;

// jsdom has no PointerEvent: dnd-kit's PointerSensor needs `isPrimary`
if (typeof window.PointerEvent === 'undefined') {
    window.PointerEvent = class extends MouseEvent {
        isPrimary: boolean;
        constructor(type: string, init: PointerEventInit = {}) {
            super(type, init);
            this.isPrimary = init.isPrimary ?? false;
        }
    } as typeof PointerEvent;
}
// A real pointer gesture through dnd-kit's PointerSensor
const pointerDrag = (element: HTMLElement, distance: number) => {
    fireEvent.pointerDown(element, { isPrimary: true, button: 0 });
    fireEvent.pointerMove(document, {
        isPrimary: true,
        clientX: distance,
        clientY: 0,
    });
};

const dragEvent = (activeId: string, overId: string) =>
    ({ active: { id: activeId }, over: { id: overId } }) as DragEndEvent;

// A draggable wrapper is announced as a button too; the pill is the real one
const pill = (name: RegExp | string) => {
    const match = screen
        .getAllByRole('button', { name })
        .find((element) => element.tagName === 'BUTTON');
    if (!match) throw new Error(`No pill named ${name}`);
    return match;
};
// The icons before a pill's name, in order
const leadingIconsOf = (element: HTMLElement) => [
    ...(element.querySelector('[data-position="left"] > div')?.children ?? []),
];
const isFieldIcon = (element: Element | undefined) =>
    /statusIcon/.test(element?.getAttribute('class') ?? '');
const queryPill = (name: RegExp) =>
    screen
        .queryAllByRole('button', { name })
        .find((element) => element.tagName === 'BUTTON') ?? null;

describe('FilterPills', () => {
    const open = vi.fn();
    const close = vi.fn();
    const removeFilterById = vi.fn();
    const moveFilter = vi.fn();
    const tileHoverOwner: { current: string | null } = { current: null };
    const setDashboardFilters = vi.fn();
    const setHaveFiltersChanged = vi.fn();
    const removeDimensionDashboardFilter = vi.fn();
    const removeMetricDashboardFilter = vi.fn();
    const filters = {
        dimensions: [savedRule, noDefaultRule],
        metrics: [],
        tableCalculations: [],
    };
    const noFilters = { dimensions: [], metrics: [], tableCalculations: [] };
    const statusField = field('status', 'Order status');
    const regionField = field('region', 'Order region');

    const setContext = ({
        dashboardFilters,
        dashboardTemporaryFilters,
        ...overrides
    }: Record<string, unknown> & DashboardStoreTestValues) => {
        storeValues = {
            ...storeValues,
            ...(dashboardFilters && { dashboardFilters }),
            ...(dashboardTemporaryFilters && { dashboardTemporaryFilters }),
        };
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            ...overrides,
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockDragEnd.handlers = [];
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        storeValues = {
            dashboardFilters: filters,
            dashboardTemporaryFilters: noFilters,
        };
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters },
            setDashboardFilters,
            setHaveFiltersChanged,
            dashboardTiles: [tile('tile-1')],
            dashboardTabs: [],
            activeTab: undefined,
            filterableFieldsByTileUuid: {
                'tile-1': [statusField, regionField],
            },
            allFilterableFields: [statusField, regionField],
            allFilterableFieldsMap: {
                orders_status: statusField,
                orders_region: regionField,
            },
            allFilterableMetricsMap: {},
            hiddenFilterableFieldIds: new Set<string>(),
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            removeDimensionDashboardFilter,
            updateDimensionDashboardFilter: vi.fn(),
            removeMetricDashboardFilter,
            updateMetricDashboardFilter: vi.fn(),
        };
        mockSidebar.current = {
            editing: null,
            editingRule: null,
            isSidebarOpen: false,
            isNew: false,
            open,
            close,
            removeFilterById,
            moveFilter,
            tileHoverOwner,
        };
    });

    it('renders one pill per saved filter', () => {
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(pill(/^Status/)).toHaveTextContent('Status is done');
        expect(pill(/^Region/)).toBeInTheDocument();
    });

    it('opens the sidebar on the clicked pill', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        await user.click(pill(/^Status/));

        expect(open).toHaveBeenCalledWith('saved');
        expect(removeFilterById).not.toHaveBeenCalled();
    });

    it('hands a click on the pill being edited to open, which decides what it does', async () => {
        const user = userEvent.setup();
        mockSidebar.current = {
            ...mockSidebar.current,
            editing: { filterId: 'saved' },
            isSidebarOpen: true,
        };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        await user.click(pill(/^Status/));

        expect(open).toHaveBeenCalledWith('saved');
    });

    it('never dots a pill whose rule differs from the saved dashboard', () => {
        setContext({
            dashboard: {
                uuid: 'dashboard-1',
                filters: {
                    dimensions: [
                        savedRule,
                        { ...noDefaultRule, label: 'Old name' },
                    ],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        });
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.queryByRole('img', { name: 'Changed' }),
        ).not.toBeInTheDocument();
        expect(pill(/^Region/)).not.toHaveAttribute('data-temporary');
    });

    it('dashes a pill not saved yet, in effect or not', () => {
        setContext({
            dashboard: {
                uuid: 'dashboard-1',
                filters: {
                    dimensions: [noDefaultRule],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        });
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(pill(/^Status/)).toHaveAttribute('data-temporary');
        expect(pill(/^Status/)).toHaveAttribute('data-in-effect');
        expect(pill(/^Status/)).toHaveAttribute('data-variant', 'default');
        expect(pill(/^Region/)).not.toHaveAttribute('data-temporary');
    });

    describe('a new filter', () => {
        const draftPill = () =>
            document.querySelector<HTMLElement>('[data-controls-pill="new"]');
        const newRule: DashboardFilterRule = {
            id: 'new',
            label: undefined,
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'orders_region', tableName: 'orders' },
            values: ['EMEA'],
        };
        const editingNew = (overrides: Record<string, unknown>) => {
            setContext({
                dashboardFilters: { ...noFilters, dimensions: [savedRule] },
            });
            mockSidebar.current = {
                ...mockSidebar.current,
                editing: { filterId: 'new' },
                isSidebarOpen: true,
                isNew: true,
                isPlaceholder: false,
                editingRule: newRule,
                ...overrides,
            };
        };

        it('has no pill while its field is being picked', () => {
            editingNew({
                isPlaceholder: true,
                editingRule: {
                    ...newRule,
                    target: { fieldId: '', tableName: '' },
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            expect(draftPill()).toBeNull();
        });

        it('gets a dashed, open pill once its field is picked, in effect only after Apply', () => {
            editingNew({});
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const created = draftPill();
            expect(created).toHaveAttribute('data-temporary');
            expect(created).toHaveAttribute('data-open');
            expect(created).not.toHaveAttribute('data-in-effect');
            expect(created).toHaveTextContent('Order region is any value');
            // Last on the bar, after the saved pills
            const pills = document.querySelectorAll('[data-controls-pill]');
            expect(pills[pills.length - 1]).toBe(created);
        });

        it("is a viewer's own dashed pill for a viewer", () => {
            editingNew({ isViewer: true });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const created = draftPill();
            expect(created).toHaveAttribute('data-temporary');
            expect(created).toHaveAttribute('data-open');
        });

        it('draws once when Apply has already put it in the store', () => {
            editingNew({ isViewer: true });
            setContext({
                dashboardFilters: { ...noFilters, dimensions: [savedRule] },
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [newRule],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(
                document.querySelectorAll('[data-controls-pill="new"]'),
            ).toHaveLength(1);
        });
    });

    describe('looks', () => {
        it('reads a value in effect bold and mutes a pill not in effect', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const inEffect = pill(/^Status/);
            expect(inEffect).toHaveAttribute('data-in-effect');
            expect(inEffect.className).toContain('plain');
            expect(within(inEffect).getByText('done')).toHaveStyle({
                fontWeight: '600',
            });
            expect(inEffect).not.toHaveAttribute('data-filter-active');
            const muted = pill(/^Region/);
            expect(muted).not.toHaveAttribute('data-in-effect');
            expect(muted).toHaveTextContent('Region is any value');
        });

        it('looks in effect when required with its default, with no requirement cue', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [{ ...savedRule, required: true }],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const required = pill(/^Status/);
            expect(required).toHaveAttribute('data-in-effect');
            expect(
                required.querySelector('[data-requirement-icon]'),
            ).toBeNull();
            expect(required).not.toHaveAttribute('data-requirement-unmet');
        });
    });

    it('removes the filter from the X without opening it', async () => {
        const user = userEvent.setup();
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        await user.click(
            screen.getAllByRole('button', { name: 'Remove filter' })[0],
        );

        expect(removeFilterById).toHaveBeenCalledWith('saved');
        expect(open).not.toHaveBeenCalled();
    });

    it('marks the pill being edited as open, with no badge', () => {
        mockSidebar.current = {
            ...mockSidebar.current,
            editing: { filterId: 'saved' },
            isSidebarOpen: true,
        };
        const { rerender } = renderWithProviders(
            <FilterPills activeTabUuid={undefined} />,
        );

        const openPill = screen.getByRole('button', {
            name: /^Status/,
            pressed: true,
        });
        expect(openPill).toHaveAttribute('data-open');
        expect(
            screen.getByRole('button', { name: /^Region/, pressed: false }),
        ).not.toHaveAttribute('data-open');
        // The field icon comes first: the pill has no grip
        const icons = leadingIconsOf(pill(/^Status/));
        expect(icons.some(isFieldIcon)).toBe(true);
        expect(pill(/^Status/)).not.toHaveClass(/pickedPill/);
        const openClassName = pill(/^Status/).className;

        // Closed: only the open marker goes
        mockSidebar.current = {
            ...mockSidebar.current,
            editing: null,
            isSidebarOpen: false,
        };
        rerender(<FilterPills activeTabUuid={undefined} />);
        expect(pill(/^Status/)).not.toHaveAttribute('data-open');
        expect(pill(/^Status/).className).toBe(openClassName);
    });

    it("marks the loose pass's landing pill for the bar's leave line", () => {
        renderWithProviders(
            <FilterPills
                activeTabUuid={undefined}
                sectionId={null}
                looseEnds={{ saved: 'dimensions metrics' }}
            />,
        );
        expect(pill(/^Status/).closest('[data-loose-end]')).toHaveAttribute(
            'data-loose-end',
            'dimensions metrics',
        );
        expect(pill(/^Region/).closest('[data-loose-end]')).toBeNull();
    });

    describe('drag from the pill itself', () => {
        it.each([
            ['flat', undefined],
            ['sectioned', null],
        ] as const)(
            'on the %s bar the wrapper takes no focus and Enter or Space opens the pill',
            async (_, sectionId) => {
                const user = userEvent.setup();
                const { container } = renderWithProviders(
                    <FilterPills
                        activeTabUuid={undefined}
                        sectionId={sectionId}
                    />,
                );
                expect(
                    container.querySelectorAll(
                        '[tabindex]:not(button):not(input)',
                    ),
                ).toHaveLength(0);
                expect(
                    container.querySelector('[aria-roledescription]'),
                ).toBeNull();

                await user.tab();
                expect(pill(/^Status/)).toHaveFocus();
                await user.keyboard('{Enter}');
                expect(open).toHaveBeenLastCalledWith('saved');
                open.mockClear();
                await user.keyboard(' ');
                expect(open).toHaveBeenLastCalledWith('saved');
                expect(
                    pill(/^Status/).querySelector('.tabler-icon-grip-vertical'),
                ).toBeNull();
            },
        );

        it('opens on a click and moves past 5px without opening', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            const wrapper = () =>
                pill(/^Status/).closest('[data-can-drag]') as HTMLElement;

            fireEvent.click(pill(/^Status/));
            expect(open).toHaveBeenLastCalledWith('saved');
            open.mockClear();

            pointerDrag(pill(/^Status/), 3);
            expect(wrapper()).not.toHaveAttribute('data-dragging');
            fireEvent.pointerUp(document);

            pointerDrag(pill(/^Status/), 20);
            expect(wrapper()).toHaveAttribute('data-dragging');
            fireEvent.pointerUp(document);
            fireEvent.click(pill(/^Status/));
            expect(open).not.toHaveBeenCalled();
        });

        it("starts the bar's drag from a picked pill's button only", () => {
            const onDragStart = vi.fn();
            renderWithProviders(
                <DndContext onDragStart={onDragStart}>
                    <BarSelectionContext.Provider
                        value={{
                            selectedIds: ['saved', 'no-default'],
                            pick: vi.fn(),
                            clear: vi.fn(),
                        }}
                    >
                        <FilterPills
                            activeTabUuid={undefined}
                            sectionId={null}
                        />
                    </BarSelectionContext.Provider>
                </DndContext>,
            );
            // Off the pill button (as in its portalled editor) nothing drags
            pointerDrag(
                pill(/^Region/).closest('[data-can-drag]') as HTMLElement,
                20,
            );
            expect(onDragStart).not.toHaveBeenCalled();
            fireEvent.pointerUp(document);

            pointerDrag(pill(/^Region/), 20);
            expect(onDragStart).toHaveBeenCalledWith(
                expect.objectContaining({
                    active: expect.objectContaining({ id: 'no-default' }),
                }),
            );
            fireEvent.pointerUp(document);
        });
    });

    it('keeps the X, and the lock in place but hidden and inert, while a filter is edited', async () => {
        const user = userEvent.setup();
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        setContext({
            dashboardFilters: {
                ...filters,
                dimensions: [
                    { ...savedRule, lockedTabUuids: ['dashboard-1'] },
                    noDefaultRule,
                ],
            },
        });
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        // Still rendered, so no pill changes width as the rail opens
        const locks = screen.getAllByRole('button', {
            name: /ock filter/,
            hidden: true,
        });
        expect(locks.length).toBeGreaterThan(0);
        locks.forEach((lock) => {
            expect(lock.closest('[inert]')).not.toBeNull();
            expect(lock.closest('[class*="hiddenAction"]')).not.toBeNull();
        });
        await user.click(
            screen.getAllByRole('button', { name: 'Remove filter' })[0],
        );
        expect(removeFilterById).toHaveBeenCalledWith('saved');
    });

    describe('selection on the sectioned bar', () => {
        const pick = vi.fn();
        const clear = vi.fn();
        const renderSelectable = (selectedIds: string[]) =>
            renderWithProviders(
                <BarSelectionContext.Provider
                    value={{ selectedIds, pick, clear }}
                >
                    <FilterPills activeTabUuid={undefined} sectionId={null} />
                </BarSelectionContext.Provider>,
            );

        it('picks with Cmd or Ctrl, a range with Shift, and opens nothing', async () => {
            const user = userEvent.setup();
            renderSelectable([]);

            await user.keyboard('{Meta>}');
            await user.click(pill(/^Status/));
            await user.keyboard('{/Meta}{Control>}');
            await user.click(pill(/^Region/));
            await user.keyboard('{/Control}{Shift>}');
            await user.click(pill(/^Status/));
            await user.keyboard('{/Shift}');

            expect(pick.mock.calls).toEqual([
                ['saved', false],
                ['no-default', false],
                ['saved', true],
            ]);
            expect(open).not.toHaveBeenCalled();
        });

        it('opens on a plain click and clears the selection', async () => {
            const user = userEvent.setup();
            renderSelectable(['no-default']);

            await user.click(pill(/^Status/));

            expect(clear).toHaveBeenCalledTimes(1);
            expect(open).toHaveBeenCalledWith('saved');
        });

        it('marks a picked pill pressed, apart from the edited look', () => {
            renderSelectable(['saved']);

            const picked = screen.getByRole('button', {
                name: /^Status/,
                pressed: true,
            });
            expect(picked.className).toContain('pickedPill');
            expect(picked).not.toHaveAttribute('data-open');
            // A check in place of the field icon
            expect(picked.querySelector('.tabler-icon-check')).not.toBeNull();
            const unpicked = screen.getByRole('button', {
                name: /^Region/,
                pressed: false,
            });
            expect(unpicked.querySelector('.tabler-icon-check')).toBeNull();
        });

        it('says how to select in the pill tooltip', async () => {
            const user = userEvent.setup();
            renderSelectable([]);

            await user.hover(pill(/^Status/));

            expect(
                await screen.findByText('Click to edit · Ctrl click to select'),
            ).toBeInTheDocument();
        });

        it("shows only the lock's tooltip while the lock is hovered", async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, lockedTabUuids: ['dashboard-1'] },
                    ],
                },
            });
            renderSelectable([]);

            await user.hover(
                within(pill(/^Status/)).getByRole('button', {
                    name: 'Unlock filter',
                }),
            );

            expect(
                await screen.findByRole('tooltip', { name: 'Unlock filter' }),
            ).toBeInTheDocument();
            // Past the pill tooltip's 500ms delay
            await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
            expect(
                screen.queryByText('Click to edit · Ctrl click to select'),
            ).not.toBeInTheDocument();
        });

        it('picks nothing on a bar without a selection, as on the flat bar', async () => {
            const user = userEvent.setup();
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.keyboard('{Meta>}');
            await user.click(pill(/^Status/));
            await user.keyboard('{/Meta}');

            expect(pick).not.toHaveBeenCalled();
            expect(open).toHaveBeenCalledWith('saved');
        });
    });

    describe('lock', () => {
        const tabs = [
            { uuid: 't1', name: 'One', order: 0 },
            { uuid: 't2', name: 'Two', order: 1 },
        ];

        it('shows no lock on a filter that is not locked', () => {
            setContext({
                dashboardTabs: tabs,
                dashboardTiles: [tile('tile-1', 't1')],
            });
            renderWithProviders(<FilterPills activeTabUuid="t1" />);

            expect(
                screen.queryByRole('button', { name: /ock filter/ }),
            ).not.toBeInTheDocument();
        });

        it('shows the lock only on a filter locked on the active tab, always', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, lockedTabUuids: ['t1'] },
                        { ...noDefaultRule, lockedTabUuids: ['t2'] },
                    ],
                },
                dashboardTabs: tabs,
                dashboardTiles: [tile('tile-1', 't1')],
            });
            renderWithProviders(<FilterPills activeTabUuid="t1" />);

            const unlock = screen.getByRole('button', {
                name: 'Unlock filter on this tab',
            });
            expect(unlock.parentElement?.className).toContain('lockSlotActive');
            // Shown at all times, so a hover never widens the pill
            expect(unlock.parentElement).toHaveAttribute('data-reserved');
            expect(
                screen.getAllByRole('button', { name: /ock filter/ }),
            ).toHaveLength(1);

            await user.click(unlock);
            expect(open).not.toHaveBeenCalled();
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
            expect(mockTrack).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
                }),
            );
        });

        it('locks on the dashboard uuid when the dashboard has no tabs', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, lockedTabUuids: ['dashboard-1'] },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(
                screen.getByRole('button', { name: 'Unlock filter' }),
            );

            const update = setDashboardFilters.mock.calls[0][0];
            expect(update(filters).dimensions[0]).toEqual({
                ...savedRule,
                lockedTabUuids: undefined,
            });
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
                properties: {
                    action: 'unlock',
                    dashboardUuid: 'dashboard-1',
                    tabUuid: undefined,
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            });
        });
    });

    describe('value text', () => {
        it('reads "is any value" for a filter with no default', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        noDefaultRule,
                        { ...savedRule, values: [] },
                        {
                            ...savedRule,
                            id: 'required',
                            label: 'Needed',
                            values: [],
                            disabled: true,
                            required: true,
                        },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Region/)).toHaveTextContent('Region is any value');
            expect(pill(/^Status/)).toHaveTextContent('Status is any value');
            expect(pill(/^Needed/)).toHaveTextContent('Needed is any value');
        });

        it('shows the first two values and counts the rest', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, values: ['a', 'b', 'c', 'd', 'e'] },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Status/)).toHaveTextContent('Status is a, b+3');
        });

        it('shows the composed value for a date', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        {
                            id: 'date',
                            label: 'Created',
                            operator: FilterOperator.IN_THE_PAST,
                            target: {
                                fieldId: 'orders_created',
                                tableName: 'orders',
                            },
                            values: [2],
                            settings: { unitOfTime: 'months' },
                        },
                    ],
                },
                allFilterableFieldsMap: {
                    orders_created: field(
                        'created',
                        'Created',
                        DimensionType.DATE,
                    ),
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Created/)).toHaveTextContent(/2 months/);
        });
    });

    describe('field resolution', () => {
        it('names a metric filter from the metrics', () => {
            setContext({
                dashboardFilters: { ...filters, metrics: [metricRule] },
                allFilterableMetricsMap: {
                    orders_total_revenue: {
                        ...field('total_revenue', 'Total revenue'),
                        type: 'sum',
                        fieldType: 'metric',
                    },
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Total revenue/)).toHaveTextContent(
                'Total revenue is greater than 100',
            );
        });

        it('names a SQL column filter from its target', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        {
                            id: 'sql',
                            label: undefined,
                            operator: FilterOperator.EQUALS,
                            target: {
                                fieldId: 'customer_segment',
                                tableName: 'sql',
                                isSqlColumn: true,
                                fallbackType: DimensionType.STRING,
                            },
                            values: ['retail'],
                        },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^customer_segment/)).toHaveTextContent(
                'customer_segment is retail',
            );
        });
    });

    describe('broken filters', () => {
        const brokenRule: DashboardFilterRule = {
            ...savedRule,
            id: 'broken',
            label: 'Gone',
            target: { fieldId: 'orders_deleted', tableName: 'orders' },
        };

        it('shows the shipped invalid pill, which opens no editor', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: { ...filters, dimensions: [brokenRule] },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const invalid = pill('Invalid filter');
            await user.click(invalid);
            expect(open).not.toHaveBeenCalled();

            await user.click(within(invalid).getByRole('button'));
            expect(removeFilterById).toHaveBeenCalledWith('broken');
        });

        it('shows the shipped locked pill for a hidden field', () => {
            setContext({
                dashboardFilters: { ...filters, dimensions: [brokenRule] },
                hiddenFilterableFieldIds: new Set(['orders_deleted']),
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(
                screen.getByTestId('locked-dashboard-filter'),
            ).toHaveTextContent('Gone');
            expect(queryPill(/Invalid filter/)).toBeNull();
        });

        it('opens no editor until the fields exist, as the shipped pill', async () => {
            const sqlRule: DashboardFilterRule = {
                ...savedRule,
                id: 'sql',
                label: 'Segment',
                target: {
                    fieldId: 'customer_segment',
                    tableName: 'sql',
                    isSqlColumn: true,
                    fallbackType: DimensionType.STRING,
                },
            };
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [savedRule, sqlRule],
                },
                allFilterableFields: undefined,
                allFilterableFieldsMap: {},
                isFetchingDashboardFilters: true,
            });
            const user = userEvent.setup({ pointerEventsCheck: 0 });
            const { rerender } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );

            expect(pill(/^Status/)).toBeDisabled();
            await user.click(pill(/^Status/));
            expect(open).not.toHaveBeenCalled();
            // A SQL column filter waits for no field
            expect(pill(/^Segment/)).toBeEnabled();

            setContext({
                allFilterableFields: [statusField, regionField],
                allFilterableFieldsMap: { orders_status: statusField },
                isFetchingDashboardFilters: false,
            });
            rerender(<FilterPills activeTabUuid={undefined} />);
            await user.click(pill(/^Status/));
            expect(open).toHaveBeenCalledWith('saved');
        });

        it('shows an editor the skeletons while the filters first load, so the bar settles once', () => {
            setContext({ isLoadingDashboardFilters: true });
            const { container } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} sectionId={null} />,
            );

            expect(queryPill(/^Status/)).toBeNull();
            expect(
                container.querySelectorAll('.mantine-Skeleton-root'),
            ).toHaveLength(5);
        });

        it('keeps an ordinary pill while the fields are loading', () => {
            setContext({
                dashboardFilters: { ...filters, dimensions: [brokenRule] },
                isFetchingDashboardFilters: true,
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Gone/)).toBeInTheDocument();
            expect(queryPill(/Invalid filter/)).toBeNull();
        });
    });

    describe('required filters', () => {
        const requiredRule: DashboardFilterRule = {
            ...savedRule,
            values: [],
            disabled: true,
            required: true,
        };

        it('gives a required filter no cue: muted without a value', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [requiredRule, noDefaultRule],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const required = pill(/^Status/);
            const optional = pill(/^Region/);
            // Grip and field icons, as an optional pill
            expect(leadingIconsOf(required)).toHaveLength(
                leadingIconsOf(optional).length,
            );
            expect(required).not.toHaveAttribute('data-requirement-unmet');
            expect(required).not.toHaveAttribute('data-in-effect');
            expect(required.className).toBe(optional.className);
        });
    });

    describe('tiles and tabs', () => {
        it('does not mark a pill inactive on a dashboard with no tabs', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Status/).className).not.toContain('inactiveFilter');
        });

        it('mutes a pill that reaches no tile on a dashboard with no tabs, never dashed', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, tileTargets: { 'tile-1': false } },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Status/).className).not.toContain('inactiveFilter');
            expect(pill(/^Status/)).not.toHaveAttribute('data-in-effect');
            expect(pill(/^Status/)).not.toHaveAttribute('data-temporary');
        });

        it('hides a pill on a tab where it reaches no tile', () => {
            setContext({
                dashboardTabs: [
                    { uuid: 't1', name: 'One', order: 0 },
                    { uuid: 't2', name: 'Two', order: 1 },
                ],
                dashboardTiles: [tile('tile-1', 't1'), tile('tile-2', 't2')],
            });
            renderWithProviders(<FilterPills activeTabUuid="t2" />);

            expect(queryPill(/^Status/)).toBeNull();
        });
    });

    describe('reorder', () => {
        it('writes the new order of the dimensions and marks the change', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            act(() =>
                mockDragEnd.handlers[0](dragEvent('saved', 'no-default')),
            );

            const update = setDashboardFilters.mock.calls[0][0];
            expect(update(filters).dimensions).toEqual([
                noDefaultRule,
                savedRule,
            ]);
            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
        });

        it('reorders the metrics on their own', () => {
            const other = { ...metricRule, id: 'metric-2' };
            const withMetrics = { ...filters, metrics: [metricRule, other] };
            setContext({ dashboardFilters: withMetrics });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            act(() => mockDragEnd.handlers[1](dragEvent('metric-2', 'metric')));

            const update = setDashboardFilters.mock.calls[0][0];
            expect(update(withMetrics)).toEqual({
                ...withMetrics,
                metrics: [other, metricRule],
            });
        });

        it('writes nothing when a pill is dropped on itself or nowhere', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            act(() => {
                mockDragEnd.handlers[0](dragEvent('saved', 'saved'));
                mockDragEnd.handlers[0]({
                    active: { id: 'saved' },
                    over: null,
                } as DragEndEvent);
            });

            expect(setDashboardFilters).not.toHaveBeenCalled();
            expect(setHaveFiltersChanged).not.toHaveBeenCalled();
        });

        it('drags a pill only while the sidebar is closed and its field is loaded', () => {
            const { unmount } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );
            expect(pill(/^Status/).closest('[data-can-drag]')).not.toBeNull();
            unmount();

            mockSidebar.current = {
                ...mockSidebar.current,
                isSidebarOpen: true,
            };
            const { unmount: unmountOpen } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );
            pointerDrag(pill(/^Status/), 20);
            expect(pill(/^Status/).closest('[data-dragging]')).toBeNull();
            expect(pill(/^Status/).closest('[data-can-drag]')).toBeNull();
            unmountOpen();

            mockSidebar.current = {
                ...mockSidebar.current,
                isSidebarOpen: false,
            };
            setContext({ allFilterableFields: undefined });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            expect(pill(/^Status/).closest('[data-can-drag]')).toBeNull();
        });
    });

    describe('temporary filters', () => {
        const temporaryRule: DashboardFilterRule = {
            ...savedRule,
            id: 'temporary',
            label: undefined,
            values: ['shipped'],
        };

        it('says only you see it before its tables', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [temporaryRule],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const name = pill(/^Order status/).querySelector<HTMLElement>(
                'p span[class*="Text"]',
            );
            await user.hover(name ?? pill(/^Order status/));
            const tooltip = await screen.findByRole(
                'tooltip',
                {},
                { timeout: 2000 },
            );
            expect(tooltip.textContent).toMatch(
                /^Only you see this filterTable: orders/i,
            );
        });

        it('shows a temporary rule as a dashed pill after the saved ones', () => {
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [temporaryRule],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const temporary = pill(/^Order status/);
            expect(temporary).toHaveTextContent('Order status is shipped');
            expect(temporary).toHaveAttribute('data-variant', 'default');
            expect(temporary).toHaveAttribute('data-temporary');
            expect(
                pill(/^Region/).compareDocumentPosition(temporary) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            expect(
                temporary.closest('[aria-roledescription="draggable"]'),
            ).toBeNull();
        });

        it('removes a temporary rule from its X, not the editor', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [savedRule, temporaryRule],
                },
                dashboardFilters: noFilters,
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(within(pill(/^Order status/)).getByRole('button'));

            expect(removeDimensionDashboardFilter).toHaveBeenCalledWith(
                1,
                true,
            );
            expect(removeFilterById).not.toHaveBeenCalled();
            expect(open).not.toHaveBeenCalled();
        });

        it('removes a temporary metric rule through the metric function', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    metrics: [metricRule],
                },
                allFilterableMetricsMap: {
                    orders_total_revenue: {
                        ...field('total_revenue', 'Total revenue'),
                        type: 'sum',
                        fieldType: 'metric',
                    },
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(
                within(pill(/^Total revenue/)).getByRole('button'),
            );

            expect(removeMetricDashboardFilter).toHaveBeenCalledWith(0, true);
        });
    });

    describe('for a viewer', () => {
        const ownRule: DashboardFilterRule = {
            id: 'own',
            label: undefined,
            operator: FilterOperator.EQUALS,
            target: { fieldId: 'orders_region', tableName: 'orders' },
            values: ['EMEA'],
        };

        beforeEach(() => {
            mockSidebar.current = { ...mockSidebar.current, isViewer: true };
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [ownRule],
                },
            });
        });

        it('opens a saved pill in the editor, with no lock toggle or X', async () => {
            const user = userEvent.setup();
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(pill(/^Status/));
            expect(open).toHaveBeenCalledWith('saved');
            expect(
                screen.queryByRole('button', { name: /ock filter/ }),
            ).not.toBeInTheDocument();
            expect(
                within(pill(/^Status/)).queryByRole('button', {
                    name: 'Remove filter',
                }),
            ).toBeNull();
            expect(pill(/^Status/)).not.toHaveAttribute('data-temporary');
        });

        it('marks a saved pill open while it is edited, with no badge', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            expect(pill(/^Status/)).not.toHaveAttribute('data-open');
            expect(pill(/^Status/)).toHaveAttribute('data-in-effect');

            mockSidebar.current = {
                ...mockSidebar.current,
                editing: { filterId: 'saved' },
                isSidebarOpen: true,
            };
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            const opened = screen.getAllByRole('button', {
                name: /^Status/,
            })[1];
            expect(opened).toHaveAttribute('data-open');
            expect(isFieldIcon(leadingIconsOf(opened)[0])).toBe(true);
        });

        it('dashes their own pill and marks it open in the editor', () => {
            mockSidebar.current = {
                ...mockSidebar.current,
                editing: { filterId: 'own' },
                isSidebarOpen: true,
            };
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            const own = pill(/^Order region/);
            expect(own).toHaveAttribute('data-temporary');
            expect(own).toHaveAttribute('data-open');
            expect(isFieldIcon(leadingIconsOf(own)[0])).toBe(true);
        });

        it('opens their own pill in the editor and removes it from its X', async () => {
            const user = userEvent.setup();
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(pill(/^Order region/));
            expect(open).toHaveBeenCalledWith('own');

            const removes = screen.getAllByRole('button', {
                name: 'Remove filter',
            });
            expect(removes).toHaveLength(1);
            await user.click(removes[0]);
            expect(removeFilterById).toHaveBeenCalledWith('own');
        });

        it('shows the shipped skeletons instead of pills while filters load', () => {
            setContext({ isLoadingDashboardFilters: true });
            const { container } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );

            expect(queryPill(/^Status/)).toBeNull();
            expect(
                container.querySelectorAll('.mantine-Skeleton-root'),
            ).toHaveLength(5);
        });

        describe('by section', () => {
            const inSection = { ...noDefaultRule, sectionId: 'a' };
            beforeEach(() => {
                setContext({
                    dashboard: {
                        uuid: 'dashboard-1',
                        filters: noFilters,
                        config: { controlSections: [{ id: 'a', name: 'A' }] },
                    },
                    dashboardFilters: {
                        ...filters,
                        dimensions: [savedRule, inSection],
                    },
                });
            });

            it('renders every saved rule and the own pills by default', () => {
                renderWithProviders(<FilterPills activeTabUuid={undefined} />);
                expect(pill(/^Status/)).toBeInTheDocument();
                expect(pill(/^Region/)).toBeInTheDocument();
                expect(pill(/^Order region/)).toBeInTheDocument();
            });

            it('renders the unsectioned rules and the own pills for null', () => {
                renderWithProviders(
                    <FilterPills activeTabUuid={undefined} sectionId={null} />,
                );
                expect(pill(/^Status/)).toBeInTheDocument();
                expect(queryPill(/^Region/)).toBeNull();
                expect(pill(/^Order region/)).toBeInTheDocument();
            });

            it("renders a section's rules alone, each opening the editor", async () => {
                const user = userEvent.setup();
                renderWithProviders(
                    <FilterPills activeTabUuid={undefined} sectionId="a" />,
                );
                expect(queryPill(/^Status/)).toBeNull();
                expect(queryPill(/^Order region/)).toBeNull();

                await user.click(pill(/^Region/));
                expect(open).toHaveBeenCalledWith('no-default');
            });
        });

        it('leaves a locked saved pill read-only, as the shipped pill', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, lockedTabUuids: ['dashboard-1'] },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(pill(/^Status/));
            expect(open).not.toHaveBeenCalled();
        });
    });

    describe('tile hover', () => {
        const gridItems: HTMLElement[] = [];
        const hoveredTiles = () =>
            gridItems
                .filter((item) => item.hasAttribute('data-controls-hovered'))
                .map((item) => item.dataset.tileUuid);

        beforeEach(() => {
            gridItems.splice(0).forEach((item) => item.remove());
            ['tile-1', 'tile-2', 'tile-3'].forEach((uuid) => {
                const item = document.createElement('div');
                item.dataset.tileUuid = uuid;
                document.body.appendChild(item);
                gridItems.push(item);
            });
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, tileTargets: { 'tile-2': false } },
                        noDefaultRule,
                    ],
                },
                dashboardTiles: [
                    tile('tile-1'),
                    tile('tile-2'),
                    tile('tile-3'),
                ],
                filterableFieldsByTileUuid: {
                    'tile-1': [statusField, regionField],
                    'tile-2': [statusField],
                    'tile-3': [regionField],
                },
            });
        });

        it("marks the tiles the hovered pill's filter is on and clears on leave", async () => {
            const user = userEvent.setup();
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.hover(pill(/^Status/));
            expect(hoveredTiles()).toEqual(['tile-1']);

            await user.hover(pill(/^Region/));
            expect(hoveredTiles()).toEqual(['tile-1', 'tile-3']);

            // A short grace on leave, so the gap between pills never flashes
            await user.unhover(pill(/^Region/));
            expect(hoveredTiles()).toEqual(['tile-1', 'tile-3']);
            await waitFor(() => expect(hoveredTiles()).toEqual([]));
        });

        it("keeps the next pill's marks when the last one's grace ends", async () => {
            const user = userEvent.setup();
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.hover(pill(/^Status/));
            await user.hover(pill(/^Region/));
            await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
            expect(hoveredTiles()).toEqual(['tile-1', 'tile-3']);
        });

        it('leaving a pill keeps the marks another pill made since', async () => {
            const user = userEvent.setup();
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.hover(pill(/^Region/));
            act(() => pill(/^Status/).focus());
            expect(hoveredTiles()).toEqual(['tile-1']);

            await user.unhover(pill(/^Region/));
            await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
            expect(hoveredTiles()).toEqual(['tile-1']);
        });

        it('re-renders no pill when the tiles change, and marks from the latest ones', async () => {
            const user = userEvent.setup();
            const { store } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );
            const rendered = pillRenders.count;

            act(() => {
                store.dispatch(
                    dashboardEditActions.setTiles([
                        tile('tile-1'),
                        tile('tile-2'),
                    ]),
                );
            });
            expect(pillRenders.count).toBe(rendered);

            await user.hover(pill(/^Region/));
            expect(hoveredTiles()).toEqual(['tile-1']);
        });

        it('marks on keyboard focus and clears on blur', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            act(() => pill(/^Status/).focus());
            expect(hoveredTiles()).toEqual(['tile-1']);

            act(() => pill(/^Status/).blur());
            expect(hoveredTiles()).toEqual([]);
        });

        it('clears when the editor opens and marks nothing while a filter is edited', async () => {
            const user = userEvent.setup();
            const { rerender } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );
            await user.hover(pill(/^Status/));
            expect(hoveredTiles()).toEqual(['tile-1']);

            mockSidebar.current = {
                ...mockSidebar.current,
                editing: { filterId: 'no-default' },
                isSidebarOpen: true,
            };
            rerender(<FilterPills activeTabUuid={undefined} />);
            expect(hoveredTiles()).toEqual([]);

            await user.hover(pill(/^Region/));
            expect(hoveredTiles()).toEqual([]);
        });
    });

    describe('moving a pill with the keyboard', () => {
        const altArrow = (element: HTMLElement, key: string) =>
            fireEvent.keyDown(element, { key, altKey: true });

        it('asks the provider to move it with Alt and an arrow', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            altArrow(pill(/^Region/), 'ArrowLeft');
            expect(moveFilter).toHaveBeenCalledWith('no-default', 'left');
            altArrow(pill(/^Status/), 'ArrowRight');
            expect(moveFilter).toHaveBeenLastCalledWith('saved', 'right');

            moveFilter.mockClear();
            fireEvent.keyDown(pill(/^Status/), { key: 'ArrowRight' });
            expect(moveFilter).not.toHaveBeenCalled();
        });

        it("never moves a viewer's pill", () => {
            mockSidebar.current = { ...mockSidebar.current, isViewer: true };
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            altArrow(pill(/^Region/), 'ArrowLeft');
            expect(moveFilter).not.toHaveBeenCalled();
            pointerDrag(pill(/^Region/), 20);
            expect(pill(/^Region/).closest('[data-can-drag]')).toBeNull();
            expect(pill(/^Region/).closest('[data-dragging]')).toBeNull();
        });
    });

    describe('a dashed pill', () => {
        // The tables tooltip sits on the pill's field name
        const fieldNameOf = (element: HTMLElement) =>
            element.querySelector<HTMLElement>('p span[class*="Text"]') ??
            element;

        it('puts "Not saved yet" before the select hint in edit mode', async () => {
            const user = userEvent.setup();
            setContext({
                dashboard: {
                    uuid: 'dashboard-1',
                    filters: { ...noFilters, dimensions: [noDefaultRule] },
                },
            });
            renderWithProviders(
                <BarSelectionContext.Provider
                    value={{ selectedIds: [], pick: vi.fn(), clear: vi.fn() }}
                >
                    <FilterPills activeTabUuid={undefined} sectionId={null} />
                </BarSelectionContext.Provider>,
            );

            await user.hover(pill(/^Status/));
            expect((await screen.findByRole('tooltip')).textContent).toBe(
                'Not saved yetClick to edit · Ctrl click to select',
            );
        });

        it('puts "Not saved yet" before the tables on the flat bar', async () => {
            const user = userEvent.setup();
            setContext({
                dashboard: {
                    uuid: 'dashboard-1',
                    filters: { ...noFilters, dimensions: [noDefaultRule] },
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.hover(fieldNameOf(pill(/^Status/)));
            const tooltip = await screen.findByRole(
                'tooltip',
                {},
                { timeout: 2000 },
            );
            expect(tooltip.textContent).toMatch(/^Not saved yetTable: orders/i);
        });

        it('puts "Only you see this filter" before a viewer\'s own tables', async () => {
            const user = userEvent.setup();
            mockSidebar.current = { ...mockSidebar.current, isViewer: true };
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [{ ...noDefaultRule, id: 'own' }],
                },
                dashboardFilters: { ...noFilters, dimensions: [savedRule] },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.hover(fieldNameOf(pill(/^Region/)));
            const tooltip = await screen.findByRole(
                'tooltip',
                {},
                { timeout: 2000 },
            );
            expect(tooltip.textContent).toMatch(
                /^Only you see this filterTable: orders/i,
            );
        });
    });

    it('keeps the standard border on a pill not in effect', () => {
        const css = fs.readFileSync(
            path.resolve(
                __dirname,
                '../dashboardFilters/ActiveFilters/Filter.module.css',
            ),
            'utf8',
        );
        const muted = css.match(
            /\.plain:hover:not\(\[data-in-effect\], :disabled\) \{([^}]*)\}/,
        );
        expect(muted?.[1]).toContain('color: var(--mantine-color-dimmed)');
        expect(muted?.[1]).not.toContain('border');
    });
});
