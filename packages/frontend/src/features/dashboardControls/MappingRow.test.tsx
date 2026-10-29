import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const renderRow = (ui: ReactElement = <MappingRow />) => {
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
        rerender: (node: ReactElement = <MappingRow />) =>
            result.rerender(wrap(node)),
    };
};

// The chips: square buttons that toggle, after "via"
const chips = () =>
    screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('aria-pressed'))
        .map((chip) => chip.textContent);

describe('MappingRow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

    it('reads as the open pill, the title with its count, a chip per field, Add a field, Cancel and Apply', () => {
        const editingRule = rule({ 'tile-1': REGION });
        setSidebar(editingRule);
        renderRow();

        expect(screen.getByText('Choose the tiles it filters')).toBeVisible();
        expect(screen.getByText('2 of 3 tiles')).toBeVisible();
        expect(screen.getByText('via')).toBeVisible();
        // One chip per row of the filter, in its order
        expect(
            getFilterRows(
                editingRule,
                mockDashboardContext.current.dashboardTiles as DashboardTile[],
            ),
        ).toEqual(['orders_status', 'orders_region']);
        expect(chips()).toEqual(['Status', 'Region']);
        expect(
            screen.getByRole('button', { name: 'Add a field' }),
        ).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
    });

    it('reserves the widest count so the row never shifts', () => {
        setSidebar(rule({ 'tile-1': false }));
        renderRow();

        const summary = screen.getByText('1 of 3 tiles').parentElement;
        expect(summary).toHaveAttribute('data-reserve', '3 of 3 tiles');
    });

    it('counts the tabs it reaches, with tabs only', () => {
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

        expect(screen.getByText('2 of 3 tiles · 1 tab')).toBeVisible();
    });

    it('selects a chip on click, deselects it on a second, and marks its tiles on hover', async () => {
        setSidebar(rule());
        const { unmount } = renderRow();

        const chip = screen.getByRole('button', { name: 'Status' });
        await userEvent.hover(chip);
        expect(setHoveredFieldId).toHaveBeenCalledWith('orders_status');
        await userEvent.click(chip);
        expect(setHighlightedFieldId).toHaveBeenCalledWith('orders_status');
        unmount();

        setSidebar(rule(), { highlightedFieldId: 'orders_status' });
        renderRow();
        const selected = screen.getByRole('button', { name: 'Status' });
        expect(selected).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(selected);
        expect(clearHighlightedField).toHaveBeenCalledTimes(1);
    });

    it('lists the fitting fields of tiles not yet filtered, and filters only those tiles with the one picked', async () => {
        setSidebar(rule({ 'tile-1': false }));
        renderRow();

        await userEvent.click(
            screen.getByRole('button', { name: 'Add a field' }),
        );
        const menu = await screen.findByRole('menu');
        expect(
            within(menu).getByText('Fields on tiles not yet filtered'),
        ).toBeInTheDocument();
        const items = within(menu).getAllByRole('menuitem');
        // tile-1 and tile-3 are not filtered: Region on both, Carrier on one
        expect(items.map((item) => item.textContent)).toEqual([
            'Region2 tiles',
            'Carrier1 tile',
        ]);

        await userEvent.click(items[0]);
        expect(setHighlightedFieldId).toHaveBeenCalledWith('orders_region');
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
            fieldId: 'orders_region',
            tileCount: 2,
            replaced: 0,
            acrossTabs: true,
        });
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
        expect(screen.getByText('3 of 3 tiles · 2 tabs')).toBeVisible();
    });

    describe('the Add a field menu', () => {
        const field = (name: string, label: string, table = 'orders') => ({
            ...dimension(name, label),
            table,
        });

        it('sorts by tiles, then name, and tells apart fields that read the same', async () => {
            const lastNameA = field('last_name', 'Last name', 'customers');
            const lastNameB = field('last_name', 'Last name', 'buyers');
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
            const menu = await screen.findByRole('menu');
            expect(
                within(menu)
                    .getAllByRole('menuitem')
                    .map((item) => item.textContent),
            ).toEqual([
                'Carrier2 tiles',
                'Region2 tiles',
                'Orders Last name (buyers)1 tile',
                'Orders Last name (customers)1 tile',
            ]);
            expect(within(menu).queryByRole('textbox')).not.toBeInTheDocument();
        });

        it('has a search past eight fields', async () => {
            const many = Array.from({ length: 9 }, (_, index) =>
                field(`extra_${index}`, `Extra ${index}`),
            );
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFields: [status, ...many],
                filterableFieldsByTileUuid: {
                    'tile-1': [status, ...many],
                    'tile-2': [status],
                    'tile-3': [status],
                },
            };
            setSidebar(rule({ 'tile-1': false }));
            renderRow();

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            const menu = await screen.findByRole('menu');
            expect(within(menu).getAllByRole('menuitem')).toHaveLength(9);
            await userEvent.type(
                within(menu).getByRole('textbox', { name: 'Search fields' }),
                'Extra 3',
            );
            expect(
                within(menu)
                    .getAllByRole('menuitem')
                    .map((item) => item.textContent),
            ).toEqual(['Extra 31 tile']);
        });

        it('hands focus to the chip it added', async () => {
            setSidebar(rule({ 'tile-1': false }));
            const { rerender } = renderRow();

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await userEvent.click((await screen.findAllByRole('menuitem'))[0]);
            // The provider's write lands: the chip is there, selected
            setSidebar(rule({ 'tile-1': REGION, 'tile-3': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            rerender();
            expect(
                screen.getByRole('button', { name: 'Region' }),
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
                highlightedFieldId: 'orders_region',
            });
            renderRow(
                <>
                    <MappingRow />
                    <button>A tile card</button>
                    <Bar />
                </>,
            );

            screen.getByRole('button', { name: 'Region' }).focus();
            await userEvent.tab();
            expect(
                screen.getByRole('button', { name: 'Filter all tiles' }),
            ).toHaveFocus();
        });

        it('comes back to the chip once the bar goes', () => {
            setSidebar(rule({ 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
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
                screen.getByRole('button', { name: 'Region' }),
            ).toHaveFocus();
        });

        it('goes to "Add a field" when Undo took the chip away', () => {
            setSidebar(rule({ 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
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
