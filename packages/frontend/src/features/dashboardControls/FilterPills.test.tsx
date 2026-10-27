import type * as DndKitCore from '@dnd-kit/core';
import { type DragEndEvent } from '@dnd-kit/core';
import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const queryPill = (name: RegExp) =>
    screen
        .queryAllByRole('button', { name })
        .find((element) => element.tagName === 'BUTTON') ?? null;

describe('FilterPills', () => {
    const open = vi.fn();
    const close = vi.fn();
    const removeFilterById = vi.fn();
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
            dashboard: { uuid: 'dashboard-1', filters: noFilters },
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
            isSidebarOpen: false,
            isNew: false,
            open,
            close,
            removeFilterById,
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

    it('dots the pills whose rule differs from the saved dashboard', () => {
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
            within(pill(/^Status/).parentElement!).queryByRole('img', {
                name: 'Changed',
            }),
        ).not.toBeInTheDocument();
        expect(
            within(pill(/^Region/).parentElement!).getByRole('img', {
                name: 'Changed',
            }),
        ).toBeInTheDocument();
    });

    it('dots a pill moved to another section, and one not saved yet', () => {
        setContext({
            dashboardFilters: {
                dimensions: [{ ...savedRule, sectionId: 'a' }, noDefaultRule],
                metrics: [],
                tableCalculations: [],
            },
            dashboard: {
                uuid: 'dashboard-1',
                filters: {
                    dimensions: [savedRule],
                    metrics: [],
                    tableCalculations: [],
                },
            },
        });
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(screen.getAllByRole('img', { name: 'Changed' })).toHaveLength(2);
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

    it('marks the pill being edited as selected', () => {
        mockSidebar.current = {
            ...mockSidebar.current,
            editing: { filterId: 'saved' },
            isSidebarOpen: true,
        };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.getByRole('button', { name: /^Status/, pressed: true }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: /^Region/, pressed: false }),
        ).toBeInTheDocument();
        // The light blue look, never the picked pill's solid one
        expect(pill(/^Status/)).toHaveClass(/selectedPill/);
        expect(pill(/^Status/)).not.toHaveClass(/pickedPill/);
        expect(pill(/^Region/)).not.toHaveClass(/selectedPill/);
    });

    it("keeps the sectioned bar's drag on while a filter is edited", () => {
        mockSidebar.current = {
            ...mockSidebar.current,
            editing: { filterId: 'saved' },
            isSidebarOpen: true,
        };
        const { container } = renderWithProviders(
            <FilterPills activeTabUuid={undefined} sectionId={null} />,
        );

        const draggables = container.querySelectorAll('[aria-roledescription]');
        expect(draggables.length).toBeGreaterThan(0);
        draggables.forEach((draggable) =>
            expect(draggable).toHaveAttribute('aria-disabled', 'false'),
        );
    });

    it('keeps the X but hides the lock while a filter is edited', async () => {
        const user = userEvent.setup();
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.queryByRole('button', { name: /ock filter/ }),
        ).not.toBeInTheDocument();
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
            expect(picked.className).not.toContain('selectedPill');
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
            renderSelectable([]);

            await user.hover(
                within(pill(/^Status/)).getByRole('button', {
                    name: 'Lock filter',
                }),
            );

            expect(
                await screen.findByRole('tooltip', { name: 'Lock filter' }),
            ).toBeInTheDocument();
            // Past the pill tooltip's 500ms delay
            await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
            expect(
                screen.queryByText('Click to edit · Ctrl click to select'),
            ).not.toBeInTheDocument();
        });

        it("shows only the requirement icon's tooltip while it is hovered", async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        {
                            ...savedRule,
                            values: [],
                            disabled: true,
                            required: true,
                        },
                        noDefaultRule,
                    ],
                },
            });
            renderSelectable([]);

            const icon = pill(/^Status/).querySelector(
                '[data-requirement-icon]',
            );
            expect(icon).not.toBeNull();
            await user.hover(icon as Element);

            expect(await screen.findByRole('tooltip')).not.toHaveTextContent(
                'Click to edit',
            );
            await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
            expect(
                screen.queryByText('Click to edit · Ctrl click to select'),
            ).not.toBeInTheDocument();
        });

        it("keeps the pill's tooltip on a met requirement icon, which has none", async () => {
            const user = userEvent.setup();
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, required: true },
                        noDefaultRule,
                    ],
                },
            });
            renderSelectable([]);

            const icon = pill(/^Status/).querySelector(
                '[data-requirement-icon]',
            );
            expect(icon).not.toBeNull();
            await user.hover(icon as Element);

            expect(
                await screen.findByText('Click to edit · Ctrl click to select'),
            ).toBeInTheDocument();
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

        it('locks the filter on the active tab without opening it', async () => {
            const user = userEvent.setup();
            setContext({
                dashboardTabs: tabs,
                dashboardTiles: [tile('tile-1', 't1')],
            });
            renderWithProviders(<FilterPills activeTabUuid="t1" />);

            await user.click(
                screen.getAllByRole('button', {
                    name: 'Lock filter on this tab',
                })[0],
            );

            expect(setHaveFiltersChanged).toHaveBeenCalledWith(true);
            expect(open).not.toHaveBeenCalled();
            const update = setDashboardFilters.mock.calls[0][0];
            expect(update(filters).dimensions).toEqual([
                { ...savedRule, lockedTabUuids: ['t1'] },
                noDefaultRule,
            ]);
            expect(mockTrack).toHaveBeenCalledWith({
                name: EventName.DASHBOARD_FILTER_LOCK_TOGGLED,
                properties: {
                    action: 'lock',
                    dashboardUuid: 'dashboard-1',
                    tabUuid: 't1',
                    fieldId: 'orders_status',
                    tableName: 'orders',
                },
            });
        });

        it('pins the lock only for a filter locked on the active tab', () => {
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
            const lock = screen.getByRole('button', {
                name: 'Lock filter on this tab',
            });
            expect(lock.parentElement?.className).not.toContain(
                'lockSlotActive',
            );
        });

        it('always shows the lock, so a hover never widens the pill', () => {
            setContext({
                dashboardTabs: tabs,
                dashboardTiles: [tile('tile-1', 't1')],
            });
            renderWithProviders(<FilterPills activeTabUuid="t1" />);

            const lock = screen.getAllByRole('button', {
                name: 'Lock filter on this tab',
            })[0];
            expect(lock.parentElement).toHaveAttribute('data-reserved');
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
        // The grip, plus the requirement status icon
        const leftIcons = (element: HTMLElement) =>
            element.querySelectorAll('[data-position="left"] svg').length;
        const requiredRule: DashboardFilterRule = {
            ...savedRule,
            values: [],
            disabled: true,
            required: true,
        };

        it('marks a required filter and its unmet state', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [requiredRule, noDefaultRule],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            // Grip, requirement and field icons, as the shipped pill
            const required = pill(/^Status/);
            expect(leftIcons(required)).toBe(3);
            expect(required).toHaveAttribute('data-requirement-unmet');
            const optional = pill(/^Region/);
            expect(leftIcons(optional)).toBe(2);
            expect(optional).not.toHaveAttribute('data-requirement-unmet');
        });

        it('keeps the marker without the unmet style once it has a value', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...requiredRule, values: ['a'], disabled: false },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const required = pill(/^Status/);
            expect(leftIcons(required)).toBe(3);
            expect(required).not.toHaveAttribute('data-requirement-unmet');
        });
    });

    describe('tiles and tabs', () => {
        it('does not mark a pill inactive on a dashboard with no tabs', () => {
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Status/).className).not.toContain('inactiveFilter');
        });

        it('marks a pill that reaches no tile on a dashboard with no tabs', () => {
            setContext({
                dashboardFilters: {
                    ...filters,
                    dimensions: [
                        { ...savedRule, tileTargets: { 'tile-1': false } },
                    ],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            expect(pill(/^Status/).className).toContain('inactiveFilter');
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

        it('offers the grip only while the sidebar is closed', () => {
            const { unmount } = renderWithProviders(
                <FilterPills activeTabUuid={undefined} />,
            );
            const status = pill(/^Status/);
            expect(
                status.querySelector('.tabler-icon-grip-vertical'),
            ).not.toBeNull();
            expect(
                status.closest('[aria-roledescription="draggable"]'),
            ).not.toBeNull();
            unmount();

            mockSidebar.current = {
                ...mockSidebar.current,
                isSidebarOpen: true,
            };
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);
            const disabled = pill(/^Status/);
            expect(
                disabled.querySelector('.tabler-icon-grip-vertical'),
            ).toBeNull();
            expect(
                disabled.closest('[aria-roledescription="draggable"]'),
            ).toBeNull();
        });
    });

    describe('temporary filters', () => {
        const temporaryRule: DashboardFilterRule = {
            ...savedRule,
            id: 'temporary',
            label: undefined,
            values: ['shipped'],
        };

        it('shows a temporary rule as an outline pill after the saved ones', () => {
            setContext({
                dashboardTemporaryFilters: {
                    ...noFilters,
                    dimensions: [temporaryRule],
                },
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const temporary = pill(/^Order status/);
            expect(temporary).toHaveTextContent('Order status is shipped');
            expect(temporary).toHaveAttribute('data-variant', 'outline');
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

        it('opens a saved pill in the shipped popover, never the rail', async () => {
            const user = userEvent.setup();
            renderWithProviders(
                <FilterPills
                    activeTabUuid={undefined}
                    dropdownClassName="ld-dashboard-filter-dropdown"
                />,
            );

            await user.click(pill(/^Status/));
            expect(open).not.toHaveBeenCalled();
            const dialog = await screen.findByRole('dialog');
            expect(dialog).toHaveClass('ld-dashboard-filter-dropdown');
            expect(
                screen.queryByRole('button', { name: /ock filter/ }),
            ).not.toBeInTheDocument();
            expect(
                within(pill(/^Status/)).queryByRole('button', {
                    name: 'Remove filter',
                }),
            ).toBeNull();
        });

        it("applies a saved pill's value as the shipped view-mode write", async () => {
            const user = userEvent.setup();
            const updateDimensionDashboardFilter = vi.fn();
            setContext({ updateDimensionDashboardFilter });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            await user.click(pill(/^Status/));
            await user.click(
                await screen.findByRole('button', { name: 'Apply' }),
            );
            // The dashboard keeps it as a `filters` URL override
            expect(updateDimensionDashboardFilter).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'saved', values: ['done'] }),
                0,
                false,
                false,
            );
        });

        it('opens their own pill in the rail and removes it from its X', async () => {
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
            const clickApply = async (
                user: ReturnType<typeof userEvent.setup>,
                name: RegExp,
            ) => {
                await user.click(pill(name));
                await user.click(
                    await screen.findByRole('button', { name: 'Apply' }),
                );
            };

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

            it("renders a section's rules alone, writing on the saved index", async () => {
                const user = userEvent.setup();
                const updateDimensionDashboardFilter = vi.fn();
                setContext({ updateDimensionDashboardFilter });
                renderWithProviders(
                    <FilterPills activeTabUuid={undefined} sectionId="a" />,
                );
                expect(queryPill(/^Status/)).toBeNull();
                expect(queryPill(/^Order region/)).toBeNull();

                await clickApply(user, /^Region/);
                expect(updateDimensionDashboardFilter).toHaveBeenCalledWith(
                    expect.objectContaining({ id: 'no-default' }),
                    1,
                    false,
                    false,
                );
            });

            it('opens one popover across passes through the shared state', async () => {
                const user = userEvent.setup();
                const onPopoverOpen = vi.fn();
                renderWithProviders(
                    <FilterPills
                        activeTabUuid={undefined}
                        sectionId="a"
                        popover={{
                            openPopoverId: undefined,
                            onPopoverOpen,
                            onPopoverClose: vi.fn(),
                        }}
                    />,
                );

                await user.click(pill(/^Region/));
                // The shipped pill names its popover with its own id
                expect(onPopoverOpen).toHaveBeenCalledWith(expect.any(String));
                expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
});
