import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { MappingRow } from './MappingRow';
import {
    getFilterRows,
    getTakeableTabCounts,
    type FieldsByTile,
} from './peers';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
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
    useSqlColumnsByTile: () => ({}),
}));

const dimension = (name: string, label: string): FilterableDimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const status = dimension('status', 'Status');
const region = dimension('region', 'Region');
const carrier = dimension('carrier', 'Carrier');
const REGION = { fieldId: 'orders_region', tableName: 'orders' };
// The chips' keys, as the shipped bar keys distinct filter fields
const STATUS_KEY = 'orders_status::Orders::Status';
const REGION_KEY = 'orders_region::Orders::Region';

const tile = (uuid: string, tabUuid?: string) =>
    ({ uuid, tabUuid, type: DashboardTileTypes.SAVED_CHART }) as DashboardTile;

const rule = (
    tileTargets?: DashboardFilterRule['tileTargets'],
): DashboardFilterRule => ({
    id: 'control',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['shipped'],
    ...(tileTargets ? { tileTargets } : {}),
});

const applyWithUndo = vi.fn();
const setHighlightedFieldId = vi.fn();
const clearHighlightedField = vi.fn();
const setHoveredFieldId = vi.fn();
const cancelMapping = vi.fn();
const close = vi.fn();

const setSidebar = (
    editingRule: DashboardFilterRule,
    overrides: Record<string, unknown> = {},
) => {
    mockSidebar.current = {
        isMapping: true,
        isViewer: false,
        isPlaceholder: false,
        editingRule,
        waitingFieldIds: [],
        highlightedFieldId: null,
        hoveredFieldId: null,
        applyWithUndo,
        setHighlightedFieldId,
        clearHighlightedField,
        setHoveredFieldId,
        cancelMapping,
        close,
        updateFilter: vi.fn(),
        removeLastField: vi.fn(),
        removeWaitingField: vi.fn(),
        ...overrides,
    };
};

const renderRow = (
    ui: ReactElement = <MappingRow />,
    dashboardFilters?: DashboardFilters,
    dashboardTemporaryFilters?: DashboardFilters,
) => {
    const store = seedDashboardEditState(
        createDashboardTestStore({
            dashboardFilters,
            dashboardTemporaryFilters,
        }),
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
        rerender: (node: ReactElement = <MappingRow />) =>
            result.rerender(wrap(node)),
    };
};

const optionNames = () =>
    screen.getAllByRole('option').map((option) => option.textContent);

// The chips: square buttons that toggle, after "using"
const chips = () =>
    screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-pressed'))
        .map((chip) => chip.textContent);

describe('MappingRow', () => {
    afterEach(() => vi.restoreAllMocks());

    beforeEach(() => {
        vi.clearAllMocks();
        // The shipped field picker virtualises its list, which needs a size
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        const tiles = [tile('tile-1'), tile('tile-2'), tile('tile-3')];
        mockDashboardContext.current = {
            dashboardTiles: tiles,
            dashboardTabs: [],
            allFilterableFields: [status, region, carrier],
            allFilterableMetrics: [],
            allFilterableFieldsMap: {
                orders_status: status,
                orders_region: region,
                orders_carrier: carrier,
            },
            allFilterableMetricsMap: {},
            filterableFieldsByTileUuid: {
                'tile-1': [status, region],
                'tile-2': [status],
                'tile-3': [region, carrier],
            },
            dashboard: { filters: { dimensions: [rule()], metrics: [] } },
        };
    });

    it('reads as one sentence: the open pill filters its count using a chip per field, then Add a field, Cancel and Apply', () => {
        const editingRule = rule({ 'tile-1': REGION });
        setSidebar(editingRule);
        const { container } = renderRow();

        expect(screen.getByText('filters')).toBeVisible();
        const count = screen.getByText('2 of 3 tiles').parentElement;
        expect(count).toHaveAttribute('aria-live', 'polite');
        expect(screen.getByText('using')).toBeVisible();
        expect(container).toHaveTextContent(
            /filters\s*2 of 3 tiles\s*using\s*Orders Status\s*Orders Region/,
        );
        // One chip per row of the filter, in its order
        expect(
            getFilterRows(
                editingRule,
                mockDashboardContext.current.dashboardTiles as DashboardTile[],
            ),
        ).toEqual(['orders_status', 'orders_region']);
        // Named as the shipped tile select names a field: with its table
        expect(chips()).toEqual(['Orders Status', 'Orders Region']);
        // Each chip carries its field's type icon, as the field pickers do
        expect(
            screen
                .getByRole('button', { name: 'Orders Status' })
                .querySelector('svg'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Add a field' }),
        ).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    });

    describe("its open pill reads as the filter row's pill", () => {
        const pill = () => document.querySelector('[inert] [data-open]');

        it('shows the filter as the bar does, not the draft', () => {
            setSidebar(rule({ 'tile-1': REGION }));
            renderRow(<MappingRow />, {
                dimensions: [{ ...rule(), values: ['pending'] }],
                metrics: [],
                tableCalculations: [],
            });
            expect(pill()).toHaveTextContent(/Status.*is.*pending/);
            expect(pill()).not.toHaveTextContent('shipped');
        });

        it('shows a new filter as not in effect until Apply', () => {
            setSidebar(rule({ 'tile-1': REGION }));
            renderRow(<MappingRow />, {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            });
            expect(pill()).toHaveTextContent(/Status.*is any value/);
        });

        it("shows a viewer's own applied filter from the temporary filters", () => {
            const own = { ...rule({ 'tile-1': REGION }), id: 'own' };
            setSidebar(own, { isViewer: true });
            const empty = {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            };
            renderRow(<MappingRow />, empty, {
                ...empty,
                dimensions: [{ ...own, values: ['pending'] }],
            });
            expect(pill()).toHaveTextContent(/Status.*is.*pending/);
            expect(pill()).not.toHaveTextContent('any value');
        });
    });

    it('reserves the widest count so the row never shifts', () => {
        setSidebar(rule({ 'tile-1': false }));
        renderRow();

        const summary = screen.getByText('1 of 3 tiles').parentElement;
        expect(summary).toHaveAttribute('data-reserve', '3 of 3 tiles');
    });

    it('counts tiles only: the tabs show their own counts', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [
                tile('tile-1', 'tab-1'),
                tile('tile-2', 'tab-1'),
                tile('tile-3', 'tab-2'),
            ],
            dashboardTabs: [
                { uuid: 'tab-1', name: 'One', order: 0 },
                { uuid: 'tab-2', name: 'Two', order: 1 },
            ],
        };
        setSidebar(rule());
        renderRow();

        expect(screen.getByText('2 of 3 tiles')).toBeVisible();
        expect(screen.queryByText(/tab/)).not.toBeInTheDocument();
    });

    it('splits a field id two explores label differently into a chip each, and offers the other label to add', async () => {
        const joinedStatus = { ...status, tableLabel: 'Order customer' };
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            filterableFieldsByTileUuid: {
                'tile-1': [status],
                'tile-2': [joinedStatus],
                'tile-3': [joinedStatus],
            },
        };
        setSidebar(rule());
        const { unmount } = renderRow();
        expect(chips()).toEqual(['Orders Status', 'Order customer Status']);
        await userEvent.hover(
            screen.getByRole('button', { name: 'Order customer Status' }),
        );
        expect(setHoveredFieldId).toHaveBeenCalledWith(
            'orders_status::Order customer::Status',
        );
        unmount();

        // Off the joined tiles, its label is one to add again
        setSidebar(rule({ 'tile-2': false, 'tile-3': false }));
        renderRow();
        expect(chips()).toEqual(['Orders Status']);
        await userEvent.click(
            screen.getByRole('button', { name: 'Add a field' }),
        );
        await waitFor(() => expect(optionNames()).toEqual(['Status']));
    });

    it('selects a chip on click, deselects it on a second, and marks its tiles on hover', async () => {
        setSidebar(rule());
        const { unmount } = renderRow();

        const chip = screen.getByRole('button', { name: 'Orders Status' });
        await userEvent.hover(chip);
        expect(setHoveredFieldId).toHaveBeenCalledWith(STATUS_KEY);
        await userEvent.click(chip);
        expect(setHighlightedFieldId).toHaveBeenCalledWith(STATUS_KEY);
        unmount();

        setSidebar(rule(), { highlightedFieldId: STATUS_KEY });
        renderRow();
        const selected = screen.getByRole('button', { name: 'Orders Status' });
        expect(selected).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(selected);
        expect(clearHighlightedField).toHaveBeenCalledTimes(1);
    });

    it('lists the fitting fields of tiles not yet filtered in the shipped picker, and filters only those tiles with the one picked', async () => {
        setSidebar(rule({ 'tile-1': false }));
        renderRow();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add a field' }),
        );
        // tile-1 and tile-3 are not filtered: Region on both, Carrier on one
        await waitFor(() =>
            expect(optionNames()).toEqual(['Carrier', 'Region']),
        );

        await userEvent.click(screen.getByRole('option', { name: 'Region' }));
        expect(setHighlightedFieldId).toHaveBeenCalledWith(REGION_KEY);
        expect(setHighlightedFieldId.mock.invocationCallOrder[0]).toBeLessThan(
            applyWithUndo.mock.invocationCallOrder[0],
        );
        const [next, apply] = applyWithUndo.mock.calls[0];
        // tile-2 keeps its own field; only the unfiltered tiles take Region
        expect(next.tileTargets).toEqual({
            'tile-1': REGION,
            'tile-3': REGION,
        });
        expect(apply).toEqual({
            kind: 'add',
            fieldId: REGION_KEY,
            tileCount: 2,
            replaced: 0,
            acrossTabs: true,
        });
        // The pick closes the picker
        await waitFor(() =>
            expect(screen.queryByRole('option')).not.toBeInTheDocument(),
        );
    });

    it('offers nothing to add once every tile is filtered', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            filterableFieldsByTileUuid: {
                'tile-1': [status, region],
                'tile-2': [status],
                'tile-3': [status, carrier],
            },
        };
        setSidebar(rule());
        renderRow();

        expect(
            screen.getByRole('button', { name: 'Add a field' }),
        ).toBeDisabled();
    });

    it('Cancel leaves mapping, and Apply commits it', async () => {
        setSidebar(rule());
        renderRow();

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(cancelMapping).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('switches Apply off for a filter that reaches no tile', () => {
        setSidebar(rule({ 'tile-1': false, 'tile-2': false, 'tile-3': false }));
        renderRow();

        expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    });

    it('is a marked editor surface that takes focus, so Escape there leaves mapping', () => {
        setSidebar(rule());
        const { container } = renderRow();

        const row = container.querySelector('[data-controls-editor]');
        expect(row).toBeInTheDocument();
        expect(row).toHaveFocus();
        // Focus alone marks no tiles
        expect(setHoveredFieldId).not.toHaveBeenCalled();
    });

    it("counts over the tiles that can take the filter, so its total is the tabs' sum", () => {
        const tiles = [
            tile('tile-1', 'tab-1'),
            tile('tile-2', 'tab-1'),
            tile('tile-3', 'tab-2'),
            // No fields: it cannot take the filter
            tile('tile-markdown', 'tab-2'),
        ];
        const tabs = [
            { uuid: 'tab-1', name: 'One', order: 0 },
            { uuid: 'tab-2', name: 'Two', order: 1 },
        ];
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: tiles,
            dashboardTabs: tabs,
        };
        const editingRule = rule({ 'tile-3': REGION });
        setSidebar(editingRule);
        renderRow();

        const tabCounts = Object.values(
            getTakeableTabCounts(
                editingRule,
                tiles,
                tabs,
                mockDashboardContext.current
                    .filterableFieldsByTileUuid as FieldsByTile,
            ),
        );
        expect(tabCounts.reduce((sum, count) => sum + count.total, 0)).toBe(3);
        expect(screen.getByText('3 of 3 tiles')).toBeVisible();
    });

    describe('the Add a field menu', () => {
        const field = (name: string, label: string, table = 'orders') => ({
            ...dimension(name, label),
            table,
        });

        it('offers each field once, grouped by table as the shipped picker', async () => {
            const lastNameA = {
                ...field('last_name', 'Last name', 'customers'),
                tableLabel: 'Customers',
            };
            const lastNameB = {
                ...field('last_name', 'Last name', 'buyers'),
                tableLabel: 'Buyers',
            };
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFields: [
                    status,
                    carrier,
                    region,
                    lastNameA,
                    lastNameB,
                    // The same field listed twice is offered once
                    region,
                ],
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region, lastNameA, lastNameB],
                    'tile-2': [carrier, region],
                    'tile-3': [carrier],
                },
            };
            setSidebar(
                rule({ 'tile-1': false, 'tile-2': false, 'tile-3': false }),
            );
            renderRow();

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await waitFor(() =>
                expect(optionNames()).toEqual([
                    'Last name',
                    'Last name',
                    'Carrier',
                    'Region',
                ]),
            );
            expect(screen.getByText('Buyers')).toBeInTheDocument();
            expect(screen.getByText('Customers')).toBeInTheDocument();
        });

        it('opens with its search focused, and narrows the list', async () => {
            setSidebar(rule({ 'tile-1': false }));
            renderRow();

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            const search = screen.getByPlaceholderText('Search fields');
            await waitFor(() => expect(search).toHaveFocus());
            await userEvent.keyboard('Carr');
            await waitFor(() => expect(optionNames()).toEqual(['Carrier']));
        });

        it('hands focus to the chip it added', async () => {
            setSidebar(rule({ 'tile-1': false }));
            const { rerender } = renderRow();

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await userEvent.click(
                await screen.findByRole('option', { name: 'Region' }),
            );
            // The provider's write lands: the chip is there, selected
            setSidebar(rule({ 'tile-1': REGION, 'tile-3': REGION }), {
                highlightedFieldId: REGION_KEY,
            });
            rerender();
            expect(
                screen.getByRole('button', { name: 'Orders Region' }),
            ).toHaveFocus();
        });
    });

    describe('focus with the field bar', () => {
        // The bar, portalled after the tiles as the real one is
        const Bar = () => (
            <div data-controls-field-bar="">
                <button disabled>Undo</button>
                <button>Filter all tiles</button>
            </div>
        );

        it('goes from the selected chip to the bar on Tab', async () => {
            setSidebar(rule({ 'tile-1': REGION }), {
                highlightedFieldId: REGION_KEY,
            });
            renderRow(
                <>
                    <MappingRow />
                    <button>A tile card</button>
                    <Bar />
                </>,
            );

            screen.getByRole('button', { name: 'Orders Region' }).focus();
            await userEvent.tab();
            expect(
                screen.getByRole('button', { name: 'Filter all tiles' }),
            ).toHaveFocus();
        });

        it('comes back to the chip once the bar goes', () => {
            setSidebar(rule({ 'tile-1': REGION }), {
                highlightedFieldId: REGION_KEY,
            });
            const { rerender } = renderRow(
                <>
                    <MappingRow />
                    <Bar />
                </>,
            );
            screen.getByRole('button', { name: 'Filter all tiles' }).focus();

            // Escape from the bar deselects it, and the bar leaves
            setSidebar(rule({ 'tile-1': REGION }));
            rerender(<MappingRow />);
            expect(
                screen.getByRole('button', { name: 'Orders Region' }),
            ).toHaveFocus();
        });

        it('goes to "Add a field" when Undo took the chip away', () => {
            setSidebar(rule({ 'tile-1': REGION }), {
                highlightedFieldId: REGION_KEY,
            });
            const { rerender } = renderRow(
                <>
                    <MappingRow />
                    <Bar />
                </>,
            );
            screen.getByRole('button', { name: 'Filter all tiles' }).focus();

            setSidebar(rule());
            rerender(<MappingRow />);
            expect(
                screen.getByRole('button', { name: 'Add a field' }),
            ).toHaveFocus();
        });
    });
});
