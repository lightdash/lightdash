import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import {
    fireEvent,
    renderHook,
    screen,
    within,
    act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { FieldTilesBar } from './FieldTilesBar';
import { useFieldTileActions } from './useFieldTileActions';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockSqlColumnsByTile = vi.hoisted(() => ({
    current: {} as Record<string, { reference: string; type: string }[]>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
vi.mock('./useSqlColumnsByTile', () => ({
    useSqlColumnsByTile: () => mockSqlColumnsByTile.current,
}));

const dimension = (
    name: string,
    label: string,
    overrides: Partial<FilterableDimension> = {},
): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
    ...overrides,
});

const status = dimension('status', 'Status');
const region = dimension('region', 'Region');
const city = dimension('city', 'City', {
    table: 'customers',
    tableLabel: 'Customers',
});

const REGION = { fieldId: 'orders_region', tableName: 'orders' };

const tile = (uuid: string) =>
    ({ uuid, type: DashboardTileTypes.SAVED_CHART }) as DashboardTile;

const rule = (
    fieldId: string,
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id: 'control',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId, tableName: 'orders' },
    values: [],
    ...(tileTargets ? { tileTargets } : {}),
});

const updateFilter = vi.fn();
const applyWithUndo = vi.fn();
const undoApply = vi.fn();
const setHighlightedFieldId = vi.fn();
const setHoveredFieldId = vi.fn();
const removeWaitingField = vi.fn();
const removeLastField = vi.fn();

const setSidebar = (
    editingRule: DashboardFilterRule | null,
    overrides: Record<string, unknown> = {},
) => {
    mockSidebar.current = {
        editingRule,
        isPlaceholder: false,
        isMapping: true,
        updateFilter,
        applyWithUndo,
        undoApply,
        fieldUndo: null,
        highlightedFieldId: 'orders_status',
        setHighlightedFieldId,
        hoveredFieldId: null,
        setHoveredFieldId,
        waitingFieldIds: [],
        removeWaitingField,
        removeLastField,
        ...overrides,
    };
};

// The dashboard's tile grid, as the shipped page renders it without tabs
const Dashboard = ({ children }: { children?: ReactNode }) => (
    <>
        <div data-testid="filters" />
        <div data-testid="grid-wrapper">
            <div className="react-grid-layout" data-testid="grid" />
        </div>
        {children}
        <FieldTilesBar />
    </>
);

// Fields are named with their table, as the shipped tile select names them;
// a SQL column (null) has none
const bar = (label = 'Status', table: string | null = 'Orders') =>
    screen.getByRole('region', {
        name: `Tiles filtered by ${table === null ? label : `${table} ${label}`}`,
    });
// The count sentence, in the element that reads changes out
const countOf = (label = 'Status', table: string | null = 'Orders') =>
    bar(label, table).querySelector('[aria-live]');
const queryBar = () => screen.queryByRole('region');
const buttonTexts = () =>
    within(bar())
        .getAllByRole('button')
        .map((button) => button.textContent);
// "Apply to all" writes through the undoable update, with its toast's message
const getAppliedRule = (): DashboardFilterRule => {
    expect(applyWithUndo).toHaveBeenCalledTimes(1);
    return applyWithUndo.mock.calls[0][0];
};
const appliedUndo = () => applyWithUndo.mock.calls[0][1];

// Seeds a real dashboard store from the context fixture, again on rerender
const renderWithProviders = (ui: ReactElement) => {
    const store = seedDashboardEditState(
        createDashboardTestStore(),
        mockDashboardContext.current as DashboardEditTestValues,
    );
    const wrap = (node: ReactElement) => (
        <DashboardStoreTestProvider store={store}>
            {node}
        </DashboardStoreTestProvider>
    );
    const result = renderWithAppProviders(wrap(ui));
    return {
        ...result,
        rerender: (node: ReactElement) => {
            act(() => {
                seedDashboardEditState(
                    store,
                    mockDashboardContext.current as DashboardEditTestValues,
                );
            });
            result.rerender(wrap(node));
        },
    };
};

describe('FieldTilesBar', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSqlColumnsByTile.current = {};
        mockDashboardContext.current = {
            dashboardTiles: [tile('tile-1'), tile('tile-2')],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFieldsMap: {
                orders_status: status,
                orders_region: region,
                customers_city: city,
            },
            allFilterableMetricsMap: {},
            filterableFieldsByTileUuid: {
                'tile-1': [status, region],
                'tile-2': [status],
            },
        };
    });

    const button = (name: string | RegExp) =>
        within(bar()).getByRole('button', { name });
    const queryUndo = () =>
        within(bar()).queryByRole('button', { name: /^Undo/ });
    const filterAllButton = () => button(/^Filter/);
    const clearButton = () => button(/^Clear/);
    const dividers = () => bar().querySelectorAll('.mantine-Divider-root');

    describe('when it shows', () => {
        it('is hidden while no field is clicked, even a hovered one', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: null,
                hoveredFieldId: 'orders_status',
            });
            renderWithProviders(<Dashboard />);

            expect(queryBar()).not.toBeInTheDocument();
        });

        it('is hidden outside mapping, with no control open, and for a placeholder', () => {
            setSidebar(rule('orders_status'), { isMapping: false });
            const { rerender } = renderWithProviders(<Dashboard />);
            expect(queryBar()).not.toBeInTheDocument();

            setSidebar(null);
            rerender(<Dashboard />);
            expect(queryBar()).not.toBeInTheDocument();

            setSidebar(rule(''), { isPlaceholder: true });
            rerender(<Dashboard />);
            expect(queryBar()).not.toBeInTheDocument();
        });

        it('sits right after the tile grid and leaves when the field is unclicked', () => {
            setSidebar(rule('orders_status'));
            const { rerender } = renderWithProviders(<Dashboard />);

            const grid = screen.getByTestId('grid');
            // After the grid, so it takes no space above the tiles
            expect(grid.nextElementSibling).toBe(bar().parentElement);
            expect(grid.previousElementSibling).toBeNull();

            setSidebar(rule('orders_status'), { highlightedFieldId: null });
            rerender(<Dashboard />);
            expect(queryBar()).not.toBeInTheDocument();
            expect(grid.nextElementSibling).toBeNull();
        });

        it('is one field only: the clicked one', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            expect(screen.getAllByRole('region')).toHaveLength(1);
            expect(within(bar('Region')).getByText('Region')).toBeVisible();
        });
    });

    describe('its count and actions', () => {
        it('shows the field, its count, Filter and Clear, all without hover', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(within(bar()).getByText('Status')).toBeInTheDocument();
            expect(countOf()).toHaveTextContent(/^1 of 2 tiles$/);
            expect(countOf()).toHaveAttribute('aria-live', 'polite');
            // No tabs: every tile is the tab in view
            expect(buttonTexts()).toEqual(['Filter 1 more', 'Clear 1']);
        });

        it('says "tile" for one tile', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Region')).toHaveTextContent(/^1 of 1 tile$/);
        });

        it('has no Undo, nor its divider, until there is something to undo', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(queryUndo()).not.toBeInTheDocument();
            expect(dividers()).toHaveLength(1);
        });

        it('offers Undo as a quiet icon at the end after an apply or a clear, and runs it', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }), {
                fieldUndo: {
                    kind: 'apply',
                    fieldId: 'orders_status',
                    tileCount: 2,
                    replaced: 0,
                    acrossTabs: false,
                },
            });
            renderWithProviders(<Dashboard />);

            const undo = button('Undo filtering 2 tiles by Orders Status');
            expect(undo).toBeEnabled();
            expect(undo).toHaveAttribute('data-variant', 'subtle');
            expect(undo).toHaveTextContent('');
            expect(within(bar()).getAllByRole('button').at(-1)).toBe(undo);
            expect(dividers()).toHaveLength(2);
            await userEvent.hover(undo);
            expect(await screen.findByText('Undo')).toBeInTheDocument();
            await userEvent.click(undo);
            expect(undoApply).toHaveBeenCalledTimes(1);
        });

        it('fills Undo right after a field is added, as the one step to take', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
                fieldUndo: {
                    kind: 'add',
                    fieldId: 'orders_region',
                    tileCount: 1,
                    replaced: 0,
                    acrossTabs: true,
                },
            });
            renderWithProviders(<Dashboard />);

            expect(
                within(bar('Region')).getByRole('button', {
                    name: 'Undo filtering 1 tile by Orders Region',
                }),
            ).toHaveAttribute('data-variant', 'filled');
            expect(
                bar('Region').querySelectorAll('[data-variant="filled"]'),
            ).toHaveLength(1);
        });

        it("fills Filter right after a tile card's pick, as the one step to take", () => {
            setSidebar(rule('orders_status', { 'tile-1': false }), {
                fieldUndo: {
                    kind: 'pick',
                    fieldId: 'orders_status',
                    tileCount: 1,
                    replaced: 0,
                    acrossTabs: false,
                },
            });
            renderWithProviders(<Dashboard />);

            expect(filterAllButton()).toHaveTextContent('Filter 1 more');
            expect(filterAllButton()).toHaveAttribute('data-variant', 'filled');
            expect(
                button('Undo filtering 1 tile by Orders Status'),
            ).toHaveAttribute('data-variant', 'subtle');
            expect(
                bar().querySelectorAll('[data-variant="filled"]'),
            ).toHaveLength(1);
        });

        it('switches Filter off, and keeps the bar, when every tile that has the field is filtered by it', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

            expect(filterAllButton()).toHaveTextContent(/^Filter more$/);
            expect(filterAllButton()).toBeDisabled();
        });

        it('puts every tile on the field, over left out tiles and other fields, for Undo', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    tile('tile-1'),
                    tile('tile-2'),
                    tile('tile-3'),
                ],
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [status],
                },
            };
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-2': false }),
            );
            renderWithProviders(<Dashboard />);

            expect(countOf()).toHaveTextContent(/^1 of 3 tiles$/);
            fireEvent.click(filterAllButton());
            expect(getAppliedRule().tileTargets).toBeUndefined();
            expect(appliedUndo()).toEqual({
                kind: 'apply' as const,
                fieldId: 'orders_status',
                tileCount: 3,
                replaced: 1,
                acrossTabs: false,
            });
            expect(updateFilter).not.toHaveBeenCalled();
        });

        it('says in a tooltip which fields Filter all tiles replaces', async () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }));
            renderWithProviders(<Dashboard />);

            await userEvent.hover(filterAllButton());
            expect(
                await screen.findByText('Replaces Orders Region on 1 tile'),
            ).toBeInTheDocument();
        });

        it("switches Clear off on the filter's only field", () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

            expect(clearButton()).toHaveTextContent('Clear 2');
            expect(clearButton()).toBeDisabled();
        });

        it('clears a field from every tile while the filter has another', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            const clear = within(bar('Region')).getByRole('button', {
                name: 'Clear 1',
            });
            expect(clear).toBeEnabled();
            fireEvent.click(clear);
            expect(getAppliedRule().tileTargets).toEqual({ 'tile-1': false });
            expect(appliedUndo()).toMatchObject({
                kind: 'clear',
                fieldId: 'orders_region',
                tileCount: 1,
            });
        });

        it('has every action switched off for a field no tile offers', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: 'customers_city',
                waitingFieldIds: ['customers_city'],
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('City', 'Customers')).toHaveTextContent(
                /^No tile has this field$/,
            );
            within(bar('City', 'Customers'))
                .getAllByRole('button')
                .forEach((action) => expect(action).toBeDisabled());
        });
    });

    describe('on a dashboard with tabs', () => {
        const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
        const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
        // One panel per tab, as the shipped page renders them
        const TabbedDashboard = () => (
            <>
                <div data-tab-uuid="tab-1">
                    <div className="react-grid-layout" data-testid="grid-1" />
                </div>
                <div data-tab-uuid="tab-2">
                    <div className="react-grid-layout" data-testid="grid-2" />
                </div>
                <FieldTilesBar />
            </>
        );

        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('tile-1'), tabUuid: 'tab-1' },
                    { ...tile('tile-2'), tabUuid: 'tab-1' },
                    { ...tile('tile-3'), tabUuid: 'tab-2' },
                ],
                dashboardTabs: [TAB_1, TAB_2],
                activeTab: TAB_1,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [status],
                },
            };
        });

        it('counts over every tab and fills and clears the tab in view first', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-3': false }),
            );
            renderWithProviders(<TabbedDashboard />);

            expect(screen.getByTestId('grid-1').nextElementSibling).toBe(
                bar().parentElement,
            );
            // The total stays over every tab
            expect(countOf()).toHaveTextContent(/^1 of 3 tiles$/);
            expect(buttonTexts()).toEqual(['Filter 1 more', 'Clear 1']);

            fireEvent.click(filterAllButton());
            // Only this tab: tile-3 on the other tab stays left out
            expect(getAppliedRule().tileTargets).toEqual({ 'tile-3': false });
            expect(appliedUndo()).toMatchObject({
                kind: 'apply',
                tileCount: 2,
                replaced: 1,
                acrossTabs: false,
            });
        });

        it('clears the tab in view only', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }));
            renderWithProviders(<TabbedDashboard />);

            fireEvent.click(button('Clear 1'));
            expect(getAppliedRule().tileTargets).toEqual({
                'tile-1': REGION,
                'tile-2': false,
            });
            expect(appliedUndo()).toMatchObject({
                kind: 'clear',
                tileCount: 1,
                acrossTabs: false,
            });
        });

        it('fills the other tabs once the tab in view is done', () => {
            setSidebar(rule('orders_status', { 'tile-3': false }));
            renderWithProviders(<TabbedDashboard />);

            expect(countOf()).toHaveTextContent(/^2 of 3 tiles$/);
            expect(filterAllButton()).toHaveTextContent(
                /^Filter 1 on other tabs$/,
            );
            fireEvent.click(filterAllButton());
            expect(getAppliedRule().tileTargets).toBeUndefined();
            expect(appliedUndo()).toMatchObject({
                kind: 'apply',
                tileCount: 1,
                acrossTabs: true,
            });
        });

        it('clears the other tabs once the tab in view has none', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-2': false }),
            );
            renderWithProviders(<TabbedDashboard />);

            expect(buttonTexts()).toEqual([
                'Filter 2 more',
                'Clear 1 on other tabs',
            ]);
            fireEvent.click(clearButton());
            expect(getAppliedRule().tileTargets).toEqual({
                'tile-1': REGION,
                'tile-2': false,
                'tile-3': false,
            });
            expect(appliedUndo()).toMatchObject({
                kind: 'clear',
                tileCount: 1,
                acrossTabs: true,
            });
        });

        it('switches Filter off, and keeps the bar, once every tab is done', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<TabbedDashboard />);

            expect(filterAllButton()).toHaveTextContent(/^Filter more$/);
            expect(filterAllButton()).toBeDisabled();
        });
        it('slides in when a chip is selected, and not again on a tab switch', () => {
            setSidebar(rule('orders_status'));
            const { rerender } = renderWithProviders(<TabbedDashboard />);
            expect(bar()).toHaveAttribute('data-arrive');

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: TAB_2,
            };
            rerender(<TabbedDashboard />);
            expect(screen.getByTestId('grid-2').nextElementSibling).toBe(
                bar().parentElement,
            );
            expect(bar()).not.toHaveAttribute('data-arrive');

            // Unselected and selected again: it arrives again
            setSidebar(rule('orders_status'), { highlightedFieldId: null });
            rerender(<TabbedDashboard />);
            setSidebar(rule('orders_status'));
            rerender(<TabbedDashboard />);
            expect(bar()).toHaveAttribute('data-arrive');
        });

        it('slides in again when another chip is selected straight away, after a tab switch too', () => {
            const regionRule = rule('orders_status', { 'tile-1': REGION });
            setSidebar(regionRule);
            const { rerender } = renderWithProviders(<TabbedDashboard />);
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: TAB_2,
            };
            rerender(<TabbedDashboard />);
            expect(bar()).not.toHaveAttribute('data-arrive');

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                activeTab: TAB_1,
            };
            rerender(<TabbedDashboard />);
            expect(bar()).not.toHaveAttribute('data-arrive');

            setSidebar(regionRule, { highlightedFieldId: 'orders_region' });
            rerender(<TabbedDashboard />);
            expect(bar('Region')).toHaveAttribute('data-arrive');

            setSidebar(regionRule);
            rerender(<TabbedDashboard />);
            expect(bar()).toHaveAttribute('data-arrive');
        });
    });

    describe('a SQL column filter', () => {
        beforeEach(() => {
            mockSqlColumnsByTile.current = {
                'tile-1': [{ reference: 'country', type: 'string' }],
                'tile-2': [{ reference: 'country', type: 'string' }],
            };
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {},
            };
        });

        it('uses the column on every SQL chart tile that has it', () => {
            const column = {
                fieldId: 'country',
                tableName: 'mock_table',
                isSqlColumn: true,
            };
            setSidebar(
                {
                    ...rule('country', { 'tile-1': column, 'tile-2': false }),
                    target: column,
                },
                { highlightedFieldId: 'country' },
            );
            renderWithProviders(<Dashboard />);

            expect(countOf('country', null)).toHaveTextContent(
                /^1 of 2 tiles$/,
            );
            fireEvent.click(
                within(bar('country', null)).getByRole('button', {
                    name: 'Filter 1 more',
                }),
            );
            expect(getAppliedRule().tileTargets).toEqual({
                'tile-1': column,
                'tile-2': column,
            });
        });
    });

    describe('a SQL column whose reference holds "::"', () => {
        const REF = 'ORDER_DATE::DATE';
        const column = {
            fieldId: REF,
            tableName: 'mock_table',
            isSqlColumn: true,
        };

        beforeEach(() => {
            mockSqlColumnsByTile.current = {
                'tile-1': [{ reference: REF, type: 'string' }],
                'tile-2': [{ reference: REF, type: 'string' }],
            };
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {},
            };
            setSidebar(
                {
                    ...rule(REF, { 'tile-1': column, 'tile-2': false }),
                    target: column,
                },
                { highlightedFieldId: REF },
            );
        });

        it('keeps its whole reference as its chip, label, count and action', () => {
            renderWithProviders(<Dashboard />);
            expect(countOf(REF, null)).toHaveTextContent(/^1 of 2 tiles$/);
            fireEvent.click(
                within(bar(REF, null)).getByRole('button', {
                    name: 'Filter 1 more',
                }),
            );
            expect(getAppliedRule().tileTargets).toEqual({
                'tile-1': column,
                'tile-2': column,
            });
            expect(appliedUndo().fieldId).toBe(REF);
        });

        it('clears only its own column', () => {
            const store = seedDashboardEditState(
                createDashboardTestStore(),
                mockDashboardContext.current as DashboardEditTestValues,
            );
            const { result } = renderHook(
                () =>
                    useFieldTileActions({
                        'tile-1': [
                            { reference: REF, type: DimensionType.STRING },
                        ],
                        'tile-2': [
                            { reference: REF, type: DimensionType.STRING },
                        ],
                    }),
                {
                    wrapper: ({ children }: { children: ReactNode }) => (
                        <DashboardStoreTestProvider store={store}>
                            {children}
                        </DashboardStoreTestProvider>
                    ),
                },
            );
            expect(result.current?.chips).toEqual([{ key: REF, fieldId: REF }]);
            const tiles = result.current!.forField(REF);
            expect(tiles.label).toBe(REF);
            expect(tiles.everyTabScope.applied).toBe(1);
            tiles.clear('every-tab');
            // A SQL chart tile with no column entry is not filtered
            expect(getAppliedRule().tileTargets).toEqual({ 'tile-2': false });
        });
    });

    describe('keyboard between the bar and its chip', () => {
        it('goes back to the selected chip on Shift+Tab from its first action', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(
                <Dashboard>
                    <button data-controls-chip="orders_status" aria-pressed>
                        Status
                    </button>
                </Dashboard>,
            );

            // No Undo yet: Filter is the first action that takes focus
            filterAllButton().focus();
            await userEvent.tab({ shift: true });
            expect(
                screen.getByRole('button', { name: 'Status', pressed: true }),
            ).toHaveFocus();
        });
    });

    describe('focus after an action', () => {
        it('goes to the bar when the pressed button is switched off', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<Dashboard />);

            await userEvent.click(filterAllButton());
            setSidebar(getAppliedRule());
            rerender(<Dashboard />);

            expect(filterAllButton()).toBeDisabled();
            expect(bar()).toHaveFocus();
        });

        it('is not taken while nothing was pressed', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<Dashboard />);
            setSidebar(rule('orders_status'));
            rerender(<Dashboard />);

            expect(bar()).not.toHaveFocus();
        });
    });

    it('hands back the same actions while nothing they read has changed', () => {
        setSidebar(rule('orders_status'));
        const columns = {};
        const store = seedDashboardEditState(
            createDashboardTestStore(),
            mockDashboardContext.current as DashboardEditTestValues,
        );
        const { result, rerender } = renderHook(
            () => useFieldTileActions(columns),
            {
                wrapper: ({ children }: { children: ReactNode }) => (
                    <DashboardStoreTestProvider store={store}>
                        {children}
                    </DashboardStoreTestProvider>
                ),
            },
        );
        const first = result.current;
        expect(first).not.toBeNull();

        // A hover is no input of the actions
        mockSidebar.current = {
            ...mockSidebar.current,
            hoveredFieldId: 'orders_status',
        };
        rerender();
        expect(result.current).toBe(first);
    });

    it('never empties a field filter from a SQL column, which is not its field', () => {
        setSidebar(rule('orders_status'));
        const columns = {};
        const store = seedDashboardEditState(
            createDashboardTestStore(),
            mockDashboardContext.current as DashboardEditTestValues,
        );
        const { result } = renderHook(() => useFieldTileActions(columns), {
            wrapper: ({ children }: { children: ReactNode }) => (
                <DashboardStoreTestProvider store={store}>
                    {children}
                </DashboardStoreTestProvider>
            ),
        });

        result.current?.forSqlColumn('country').remove();

        expect(removeLastField).not.toHaveBeenCalled();
        expect(updateFilter).not.toHaveBeenCalled();
        // Its own field still goes that way
        result.current?.forField('orders_status').remove();
        expect(removeLastField).toHaveBeenCalledWith('Status');
    });

    describe('a field id two explores label differently', () => {
        const joinedStatus = { ...status, tableLabel: 'Order customer' };
        const ORDERS_KEY = 'orders_status::Orders::Status';
        const JOINED_KEY = 'orders_status::Order customer::Status';
        const renderActions = () => {
            const store = seedDashboardEditState(
                createDashboardTestStore(),
                mockDashboardContext.current as DashboardEditTestValues,
            );
            return renderHook(() => useFieldTileActions({}), {
                wrapper: ({ children }: { children: ReactNode }) => (
                    <DashboardStoreTestProvider store={store}>
                        {children}
                    </DashboardStoreTestProvider>
                ),
            }).result;
        };

        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    tile('tile-1'),
                    tile('tile-2'),
                    tile('tile-3'),
                ],
                filterableFieldsByTileUuid: {
                    'tile-1': [status],
                    'tile-2': [joinedStatus],
                    'tile-3': [joinedStatus],
                },
            };
            setSidebar(rule('orders_status', { 'tile-2': false }));
        });

        it('is a chip per label, each counting and acting on its own tiles', () => {
            const result = renderActions();
            expect(result.current?.chips.map((chip) => chip.key)).toEqual([
                ORDERS_KEY,
                JOINED_KEY,
            ]);
            const joined = result.current!.forField(JOINED_KEY);
            expect(joined.label).toBe('Order customer Status');
            expect(joined.everyTabScope).toMatchObject({
                applied: 1,
                possible: 2,
            });

            joined.applyToAll('every-tab');
            // tile-2 is back on its default; tile-1 is left alone
            expect(getAppliedRule().tileTargets).toBeUndefined();
            expect(appliedUndo()).toMatchObject({
                kind: 'apply',
                fieldId: JOINED_KEY,
                tileCount: 2,
            });
        });

        it('keeps its name and offers its tiles again once Clear took it off every tile', () => {
            // The joined chip's tiles are both left out: its key is no chip now
            setSidebar(
                rule('orders_status', { 'tile-2': false, 'tile-3': false }),
                { highlightedFieldId: JOINED_KEY },
            );
            renderWithProviders(<Dashboard />);

            const joinedBar = bar('Status', 'Order customer');
            expect(within(joinedBar).getByText('Order customer')).toBeVisible();
            expect(countOf('Status', 'Order customer')).toHaveTextContent(
                /^0 of 2 tiles$/,
            );
            const fill = within(joinedBar).getByRole('button', {
                name: 'Filter 2 more',
            });
            expect(fill).toBeEnabled();
            fireEvent.click(fill);
            // Back on the joined tiles only; tile-1 keeps its own chip
            expect(getAppliedRule().tileTargets).toBeUndefined();
            expect(appliedUndo()).toMatchObject({ fieldId: JOINED_KEY });
        });

        it('clears and removes one chip without touching the other', () => {
            const result = renderActions();
            result.current!.forField(ORDERS_KEY).clear('every-tab');
            expect(getAppliedRule().tileTargets).toEqual({
                'tile-1': false,
                'tile-2': false,
            });

            result.current!.forField(JOINED_KEY).remove();
            expect(removeLastField).not.toHaveBeenCalled();
            expect(updateFilter.mock.calls[0][0].tileTargets).toEqual({
                'tile-2': false,
                'tile-3': false,
            });
        });
    });

    describe('while the tile fields are not loaded', () => {
        it('switches its actions off, and back on once they are there', () => {
            const fields =
                mockDashboardContext.current.filterableFieldsByTileUuid;
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: undefined,
            };
            // tile-2 is left out: a blind write would lose that
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-2': false }),
                { highlightedFieldId: 'orders_region' },
            );
            const { rerender } = renderWithProviders(<Dashboard />);

            const clear = within(bar('Region')).getByRole('button', {
                name: /^Clear/,
            });
            expect(clear).toBeDisabled();
            fireEvent.click(clear);
            expect(applyWithUndo).not.toHaveBeenCalled();

            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: fields,
            };
            rerender(<Dashboard />);
            expect(
                within(bar('Region')).getByRole('button', { name: 'Clear 1' }),
            ).toBeEnabled();
        });
    });
});
