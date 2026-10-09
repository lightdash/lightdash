import type * as DndKitCore from '@dnd-kit/core';
import { type DragEndEvent } from '@dnd-kit/core';
import {
    DashboardTileTypes,
    DimensionType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { EventName } from '../../types/Events';
import { FilterPills } from './FilterPills';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));
const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTrack = vi.hoisted(() => vi.fn());
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
    const removeFilterById = vi.fn();
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

    const setContext = (overrides: Record<string, unknown>) => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            ...overrides,
        };
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockDragEnd.handlers = [];
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            dashboard: { uuid: 'dashboard-1', filters: noFilters },
            setDashboardFilters,
            setHaveFiltersChanged,
            dashboardFilters: filters,
            dashboardTemporaryFilters: noFilters,
            allFilters: filters,
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
            unmetFilterRequirements: [],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            parameterValues: {},
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
            removeFilterById,
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
    });

    it('hides the remove and lock actions while the sidebar is open', () => {
        mockSidebar.current = { ...mockSidebar.current, isSidebarOpen: true };
        renderWithProviders(<FilterPills activeTabUuid={undefined} />);

        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /ock filter/ }),
        ).not.toBeInTheDocument();
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
            expect(unlock).toHaveAttribute('aria-pressed', 'true');
            expect(unlock.parentElement?.className).toContain('lockSlotActive');
            const lock = screen.getByRole('button', {
                name: 'Lock filter on this tab',
            });
            expect(lock.parentElement?.className).not.toContain(
                'lockSlotActive',
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
                isLoadingDashboardFilters: true,
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
                isLoadingDashboardFilters: false,
            });
            rerender(<FilterPills activeTabUuid={undefined} />);
            await user.click(pill(/^Status/));
            expect(open).toHaveBeenCalledWith('saved');
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
        // The grip, plus the asterisk on a required filter
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
                unmetFilterRequirements: [
                    { type: 'single', filter: requiredRule },
                ],
            });
            renderWithProviders(<FilterPills activeTabUuid={undefined} />);

            const required = pill(/^Status/);
            expect(leftIcons(required)).toBe(2);
            expect(required.className).toContain('requirementUnmet');
            const optional = pill(/^Region/);
            expect(leftIcons(optional)).toBe(1);
            expect(optional.className).not.toContain('requirementUnmet');
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
            expect(leftIcons(required)).toBe(2);
            expect(required.className).not.toContain('requirementUnmet');
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
});
