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

const bar = (label = 'Status') =>
    screen.getByRole('region', { name: `Tiles filtered by ${label}` });
// The count sentence, in the element that reads changes out
const countOf = (label = 'Status') => bar(label).querySelector('[aria-live]');
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
    const undoButton = () => button(/^Undo/);
    const filterAllButton = () => button('Filter all tiles');
    const clearButton = () => button(/^Clear/);

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
        it('shows the field, its count and Undo, Filter all tiles and Clear, all without hover', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(within(bar()).getByText('Status')).toBeInTheDocument();
            expect(countOf()).toHaveTextContent(/^1 of 2 tiles$/);
            expect(countOf()).toHaveAttribute('aria-live', 'polite');
            expect(buttonTexts()).toEqual([
                'Undo',
                'Filter all tiles',
                'Clear',
            ]);
        });

        it('says "tile" for one tile', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Region')).toHaveTextContent(/^1 of 1 tile$/);
        });

        it('switches Undo off until there is something to undo', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(undoButton()).toBeDisabled();
        });

        it('offers Undo as a quiet button after an apply or a clear, and runs it', async () => {
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

            const undo = button('Undo applying Status to 2 tiles');
            expect(undo).toBeEnabled();
            expect(undo).toHaveAttribute('data-variant', 'subtle');
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
                    name: 'Undo applying Region to 1 tile',
                }),
            ).toHaveAttribute('data-variant', 'filled');
            expect(
                bar('Region').querySelectorAll('[data-variant="filled"]'),
            ).toHaveLength(1);
        });

        it('switches Filter all tiles off when every tile that has the field is filtered by it', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

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
                await screen.findByText('Replaces Region on 1 tile'),
            ).toBeInTheDocument();
        });

        it("switches Clear off on the filter's only field", () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

            expect(clearButton()).toBeDisabled();
        });

        it('clears a field from every tile while the filter has another', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            const clear = within(bar('Region')).getByRole('button', {
                name: 'Clear Region from tiles',
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

            expect(countOf('City')).toHaveTextContent(
                /^No tile has this field$/,
            );
            within(bar('City'))
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

        it('counts and acts over every tab, with no tab wording', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-3': false }),
            );
            renderWithProviders(<TabbedDashboard />);

            expect(screen.getByTestId('grid-1').nextElementSibling).toBe(
                bar().parentElement,
            );
            expect(countOf()).toHaveTextContent(/^1 of 3 tiles$/);
            expect(buttonTexts()).toEqual([
                'Undo',
                'Filter all tiles',
                'Clear',
            ]);
            expect(bar()).not.toHaveTextContent(/tab/);

            fireEvent.click(filterAllButton());
            expect(getAppliedRule().tileTargets).toBeUndefined();
            expect(appliedUndo()).toMatchObject({
                tileCount: 3,
                acrossTabs: true,
            });
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

            expect(countOf('country')).toHaveTextContent(/^1 of 2 tiles$/);
            fireEvent.click(
                within(bar('country')).getByRole('button', {
                    name: 'Filter all tiles',
                }),
            );
            expect(getAppliedRule().tileTargets).toEqual({
                'tile-1': column,
                'tile-2': column,
            });
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

            // Undo is off: Filter all tiles is the first action that takes focus
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

            const clear = screen.getByRole('button', {
                name: 'Clear Region from tiles',
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
                screen.getByRole('button', { name: 'Clear Region from tiles' }),
            ).toBeEnabled();
        });
    });
});
