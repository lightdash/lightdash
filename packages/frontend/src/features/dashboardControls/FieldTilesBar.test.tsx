import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { fireEvent, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
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
const CITY = { fieldId: 'customers_city', tableName: 'customers' };

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
        updateFilter,
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
const queryButtonTexts = () =>
    within(bar())
        .queryAllByRole('button')
        .map((button) => button.textContent);

const getUpdatedRule = (): DashboardFilterRule => {
    expect(updateFilter).toHaveBeenCalledTimes(1);
    return updateFilter.mock.calls[0][0];
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

    describe('when it shows', () => {
        it('is hidden while no field is clicked, even a hovered one', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: null,
                hoveredFieldId: 'orders_status',
            });
            renderWithProviders(<Dashboard />);

            expect(queryBar()).not.toBeInTheDocument();
        });

        it('is hidden with no control open, and for a placeholder', () => {
            setSidebar(null);
            const { rerender } = renderWithProviders(<Dashboard />);
            expect(queryBar()).not.toBeInTheDocument();

            setSidebar(rule(''), { isPlaceholder: true });
            rerender(<Dashboard />);
            expect(queryBar()).not.toBeInTheDocument();
        });

        it('is hidden for a clicked field the filter no longer lists', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

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
    });

    describe('on a dashboard without tabs', () => {
        it('counts every tile, with no tab in its words', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(countOf()).toHaveTextContent('on 1 of 2 tiles');
            expect(countOf()).not.toHaveTextContent('tab');
            expect(countOf()).toHaveAttribute('aria-live', 'polite');
            // The field leads the bar
            expect(within(bar()).getByText('Status')).toBeInTheDocument();
            expect(buttonTexts()).toEqual(['Filter the other 1', 'Clear']);
        });

        it('says "tile" for one tile', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Region')).toHaveTextContent(/^on 1 of 1 tile$/);
        });

        it('offers only the clear when every tile that offers the field is on it', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

            expect(buttonTexts()).toEqual(['Clear']);
        });

        it('says "Filter all" for a field on no tile, with nothing to switch', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-2': false }),
            );
            renderWithProviders(<Dashboard />);

            expect(buttonTexts()).toEqual(['Filter all 2']);
            expect(
                screen.getByRole('button', {
                    name: 'Filter all 2 tiles by Status',
                }),
            ).toHaveAttribute('data-variant', 'filled');
        });

        it('has no button for a field no tile offers', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: 'customers_city',
                waitingFieldIds: ['customers_city'],
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('City')).toHaveTextContent(
                /^No tile has this field$/,
            );
            expect(countOf('City')).toHaveAttribute('aria-live', 'polite');
            expect(within(bar('City')).queryAllByRole('button')).toHaveLength(
                0,
            );
        });

        it('filters the unfiltered tiles', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the other 1 tile by Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('filters without replacing, and switches without filtering', () => {
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

            // One tile each: the two buttons never count the same tile
            expect(countOf()).toHaveTextContent('on 1 of 3 tiles');
            expect(buttonTexts()).toEqual([
                'Filter 1 unfiltered tile',
                'Replace Region on 1 tile',
                'Clear',
            ]);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter 1 unfiltered tile by Status',
                }),
            );
            // tile-1 keeps Region
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-1': REGION });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Replace Region on 1 tile with Status',
                }),
            );
            // tile-2 stays unfiltered
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-2': false });
        });

        it('names every field a switch replaces', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status, city],
                },
            };
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-2': CITY }),
            );
            renderWithProviders(<Dashboard />);

            expect(buttonTexts()).toEqual([
                'Replace Region and City on 2 tiles',
            ]);
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Replace Region and City on 2 tiles with Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('counts the unfiltered tiles in words beside a replace', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status, region],
                },
            };
            setSidebar(rule('orders_status', { 'tile-1': false }), {
                highlightedFieldId: 'orders_region',
                waitingFieldIds: ['orders_region'],
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Region')).toHaveTextContent('on 0 of 2 tiles');
            expect(
                within(bar('Region'))
                    .getAllByRole('button')
                    .map((button) => button.textContent),
            ).toEqual(['Filter 1 unfiltered tile', 'Replace Status on 1 tile']);
        });

        it('clears the field from its tiles', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

            fireEvent.click(
                screen.getByRole('button', { name: 'Clear Status from tiles' }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': false,
                'tile-2': false,
            });
        });

        it('offers a waiting field to the tiles on another field', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: 'orders_region',
                waitingFieldIds: ['orders_region'],
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Region')).toHaveTextContent('on 0 of 1 tile');
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Replace Status on 1 tile with Region',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-1': REGION });
        });

        it('never has the other-tabs link', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-2': false }),
            );
            renderWithProviders(<Dashboard />);

            expect(
                screen.queryByRole('button', { name: /on other tabs/ }),
            ).not.toBeInTheDocument();
        });
    });

    describe('on a dashboard with tabs', () => {
        const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
        const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
        const TAB_3 = { uuid: 'tab-3', name: 'Three', order: 2 };
        const setTabs = (activeTab: typeof TAB_1) => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('tile-1'), tabUuid: 'tab-1' },
                    { ...tile('tile-2'), tabUuid: 'tab-1' },
                    { ...tile('tile-3'), tabUuid: 'tab-2' },
                    { ...tile('tile-4'), tabUuid: 'tab-3' },
                ],
                dashboardTabs: [TAB_1, TAB_2, TAB_3],
                activeTab,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [status],
                    'tile-4': [status, region],
                },
            };
        };
        // One panel per tab, as the shipped page renders them
        const TabbedDashboard = () => (
            <>
                <div data-tab-uuid="tab-1">
                    <div className="react-grid-layout" data-testid="grid-1" />
                </div>
                <div data-tab-uuid="tab-2">
                    <div className="react-grid-layout" data-testid="grid-2" />
                </div>
                <div data-tab-uuid="tab-3">
                    <div className="react-grid-layout" data-testid="grid-3" />
                </div>
                <FieldTilesBar />
            </>
        );
        const OTHER_TABS = (count: number) =>
            `Filter ${count} on other tabs by Status`;

        beforeEach(() => setTabs(TAB_1));

        it('follows the active tab, after its grid', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<TabbedDashboard />);

            expect(screen.getByTestId('grid-1').nextElementSibling).toBe(
                bar().parentElement,
            );
            expect(countOf()).toHaveTextContent(
                /^on 1 of 2 tiles on this tab$/,
            );
            expect(countOf()).toHaveAttribute('aria-live', 'polite');

            setTabs(TAB_2);
            rerender(<TabbedDashboard />);
            expect(screen.getByTestId('grid-2').nextElementSibling).toBe(
                bar().parentElement,
            );
            expect(screen.getByTestId('grid-1').nextElementSibling).toBeNull();
            expect(countOf()).toHaveTextContent(/^on 1 of 1 tile on this tab$/);
        });

        it('has one scope and no link with fewer than two tabs', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTabs: [TAB_1],
            };
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-3': false }),
            );
            renderWithProviders(<Dashboard />);

            expect(countOf()).toHaveTextContent(/^on 2 of 4 tiles$/);
            expect(buttonTexts()).toEqual(['Filter the other 2', 'Clear']);
        });

        it('has nothing about every tab: no count, switch or clear for it', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status],
                    'tile-2': [status],
                    'tile-3': [status, region],
                    'tile-4': [status, region],
                },
            };
            // The other tabs have a tile on Status and one on Region
            setSidebar(rule('orders_status', { 'tile-4': REGION }));
            renderWithProviders(<TabbedDashboard />);

            expect(bar()).not.toHaveTextContent(/every tab/i);
            expect(buttonTexts()).toEqual(['Clear']);
            expect(
                screen.getByRole('button', {
                    name: 'Clear Status from this tab',
                }),
            ).toBeInTheDocument();
        });

        it('shows the link only when another tab has an unfiltered tile', () => {
            setSidebar(rule('orders_status'));
            const { rerender } = renderWithProviders(<TabbedDashboard />);
            expect(buttonTexts()).toEqual(['Clear']);

            // Unfiltered on this tab only: still no link
            setSidebar(rule('orders_status', { 'tile-1': false }));
            rerender(<TabbedDashboard />);
            expect(buttonTexts()).toEqual(['Filter the other 1', 'Clear']);

            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-3': false }),
            );
            rerender(<TabbedDashboard />);
            expect(buttonTexts()).toEqual([
                'Filter the other 1',
                'Clear',
                'Filter 1 on other tabs',
            ]);
            expect(
                screen.getByRole('button', { name: OTHER_TABS(1) }),
            ).toHaveAttribute('data-variant', 'subtle');

            setSidebar(
                rule('orders_status', {
                    'tile-1': false,
                    'tile-3': false,
                    'tile-4': false,
                }),
            );
            rerender(<TabbedDashboard />);
            expect(
                screen.getByRole('button', { name: OTHER_TABS(2) }),
            ).toHaveTextContent('Filter 2 on other tabs');
        });

        it('does not count a tile on another field of the other tabs', () => {
            setSidebar(
                rule('orders_status', { 'tile-3': false, 'tile-4': REGION }),
            );
            renderWithProviders(<TabbedDashboard />);

            expect(buttonTexts()).toEqual(['Clear', 'Filter 1 on other tabs']);
        });

        it('fills the other tabs from the link and leaves this tab alone', () => {
            setSidebar(
                rule('orders_status', {
                    'tile-1': false,
                    'tile-3': false,
                    'tile-4': REGION,
                }),
            );
            renderWithProviders(<TabbedDashboard />);

            fireEvent.click(
                screen.getByRole('button', { name: OTHER_TABS(1) }),
            );
            // tile-1 is on this tab and stays unfiltered; tile-4 keeps Region
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': false,
                'tile-4': REGION,
            });
        });

        it('fills this tab from the main button and leaves the other tabs alone', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-3': false }),
            );
            renderWithProviders(<TabbedDashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the other 1 tile on this tab by Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-3': false });
        });

        it('names the main button by its label, then the tab and the field', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status, region],
                    'tile-3': [status],
                    'tile-4': [status],
                },
            };
            // All out on this tab
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-2': false }),
            );
            const { rerender } = renderWithProviders(<TabbedDashboard />);
            expect(
                screen.getByRole('button', {
                    name: 'Filter all 2 tiles on this tab by Status',
                }),
            ).toHaveTextContent(/^Filter all 2$/);

            // One on Region: the unfiltered count is spelled out
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-2': false }),
            );
            rerender(<TabbedDashboard />);
            expect(
                screen.getByRole('button', {
                    name: 'Filter 1 unfiltered tile on this tab by Status',
                }),
            ).toHaveTextContent(/^Filter 1 unfiltered tile$/);
            expect(
                screen.getByRole('button', {
                    name: 'Replace Region on 1 tile with Status on this tab',
                }),
            ).toHaveTextContent(/^Replace Region on 1 tile$/);
        });

        it('says "Filter all" when the field is on no tile of the tab', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-2': false }),
            );
            renderWithProviders(<TabbedDashboard />);

            expect(countOf()).toHaveTextContent('on 0 of 2 tiles on this tab');
            expect(buttonTexts()).toEqual(['Filter all 2']);
        });

        it('keeps the link on a tab where no tile offers the field', () => {
            setTabs(TAB_2);
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [region],
                    'tile-4': [status, region],
                },
            };
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<TabbedDashboard />);

            expect(countOf()).toHaveTextContent(
                /^No tile on this tab has this field$/,
            );
            expect(buttonTexts()).toEqual(['Filter 1 on other tabs']);
            fireEvent.click(
                screen.getByRole('button', { name: OTHER_TABS(1) }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('has no button at all on a tab with no tile for it and nothing left elsewhere', () => {
            setTabs(TAB_2);
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [status],
                    'tile-4': [status],
                },
            };
            renderWithProviders(<TabbedDashboard />);

            expect(countOf('Region')).toHaveTextContent(
                'No tile on this tab has this field',
            );
            expect(within(bar('Region')).queryAllByRole('button')).toHaveLength(
                0,
            );
        });

        it('switches and clears on this tab only', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-4': REGION }),
            );
            renderWithProviders(<TabbedDashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Replace Region on 1 tile with Status on this tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-4': REGION });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Clear Status from this tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': REGION,
                'tile-2': false,
                'tile-4': REGION,
            });
        });
    });

    describe('a SQL column filter', () => {
        const sqlTile = (uuid: string, tabUuid?: string) =>
            ({
                uuid,
                tabUuid,
                type: DashboardTileTypes.SQL_CHART,
            }) as DashboardTile;
        const COUNTRY = {
            fieldId: 'country',
            tableName: 'sql_chart',
            isSqlColumn: true,
            fallbackType: DimensionType.STRING,
        };
        const CITY_COLUMN = { ...COUNTRY, fieldId: 'city' };
        const sqlRule = (
            tileTargets: DashboardFilterRule['tileTargets'],
        ): DashboardFilterRule => ({
            ...rule('country', tileTargets),
            target: COUNTRY,
        });

        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    sqlTile('sql-1'),
                    sqlTile('sql-2'),
                    sqlTile('sql-3'),
                ],
                allFilterableFieldsMap: {},
                filterableFieldsByTileUuid: undefined,
            };
            mockSqlColumnsByTile.current = {
                'sql-1': [{ reference: 'country', type: 'string' }],
                'sql-2': [
                    { reference: 'country', type: 'string' },
                    { reference: 'city', type: 'string' },
                ],
                'sql-3': [{ reference: 'city', type: 'string' }],
            };
        });

        it('filters the tiles that have the column and are not filtered', () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY }), {
                highlightedFieldId: 'country',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('country')).toHaveTextContent('on 1 of 2 tiles');
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the other 1 tile by country',
                }),
            );
            const next = getUpdatedRule();
            expect(Object.keys(next.tileTargets ?? {})).toEqual([
                'sql-1',
                'sql-2',
            ]);
            expect(next.tileTargets?.['sql-2']).toMatchObject({
                fieldId: 'country',
                isSqlColumn: true,
            });
        });

        it('switches a tile from another column, and leaves the unfiltered one', () => {
            setSidebar(sqlRule({ 'sql-2': CITY_COLUMN }), {
                highlightedFieldId: 'country',
            });
            renderWithProviders(<Dashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Replace city on 1 tile with country',
                }),
            );
            const next = getUpdatedRule();
            expect(Object.keys(next.tileTargets ?? {})).toEqual(['sql-2']);
            expect(next.tileTargets?.['sql-2']).toMatchObject({
                fieldId: 'country',
                isSqlColumn: true,
            });
        });

        it('clears the column from its tiles', () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY, 'sql-2': COUNTRY }), {
                highlightedFieldId: 'country',
            });
            renderWithProviders(<Dashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Clear country from tiles',
                }),
            );
            // A SQL chart tile with no entry is not filtered
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('fills the other tabs from the link, never this tab', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    sqlTile('sql-1', 'tab-1'),
                    sqlTile('sql-2', 'tab-2'),
                    sqlTile('sql-3', 'tab-2'),
                ],
                dashboardTabs: [
                    { uuid: 'tab-1', name: 'One', order: 0 },
                    { uuid: 'tab-2', name: 'Two', order: 1 },
                ],
                activeTab: { uuid: 'tab-1', name: 'One', order: 0 },
            };
            setSidebar(sqlRule({}), { highlightedFieldId: 'country' });
            renderWithProviders(
                <>
                    <div data-tab-uuid="tab-1">
                        <div className="react-grid-layout" />
                    </div>
                    <FieldTilesBar />
                </>,
            );

            expect(countOf('country')).toHaveTextContent(
                'on 0 of 1 tile on this tab',
            );
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter 1 on other tabs by country',
                }),
            );
            const next = getUpdatedRule();
            // sql-1 is on this tab; sql-3 does not have the column
            expect(Object.keys(next.tileTargets ?? {})).toEqual(['sql-2']);
        });
    });

    describe('a tile with no tab, or a tab that is gone', () => {
        const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
        const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
        const Tabbed = () => (
            <>
                <div data-tab-uuid="tab-1">
                    <div className="react-grid-layout" />
                </div>
                <FieldTilesBar />
            </>
        );

        it.each([
            ['no tabUuid', undefined],
            ['a tabUuid that is gone', 'deleted-tab'],
        ])('is on the first tab, never on the others (%s)', (_, tabUuid) => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('tile-1'), tabUuid: 'tab-1' },
                    { ...tile('tile-x'), tabUuid },
                    { ...tile('tile-3'), tabUuid: 'tab-2' },
                ],
                dashboardTabs: [TAB_1, TAB_2],
                activeTab: TAB_1,
                filterableFieldsByTileUuid: {
                    'tile-1': [status],
                    'tile-x': [status],
                    'tile-3': [status],
                },
            };
            setSidebar(
                rule('orders_status', {
                    'tile-1': false,
                    'tile-x': false,
                    'tile-3': false,
                }),
            );
            renderWithProviders(<Tabbed />);

            expect(countOf()).toHaveTextContent('on 0 of 2 tiles on this tab');
            expect(buttonTexts()).toEqual([
                'Filter all 2',
                'Filter 1 on other tabs',
            ]);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter 1 on other tabs by Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': false,
                'tile-x': false,
            });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter all 2 tiles on this tab by Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-3': false });
        });
    });

    describe('a tile on a field it no longer offers', () => {
        const GONE = { fieldId: 'orders_gone', tableName: 'orders' };

        it('counts it as a tile of the field, so the bar never reads over', () => {
            setSidebar(rule('orders_status', { 'tile-1': GONE }), {
                highlightedFieldId: 'orders_gone',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('orders_gone')).toHaveTextContent(
                /^on 1 of 1 tile$/,
            );
            expect(
                within(bar('orders_gone'))
                    .getAllByRole('button')
                    .map((button) => button.textContent),
            ).toEqual(['Clear']);
        });

        it('does the same for a column a SQL chart tile no longer returns', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('sql-1'), type: DashboardTileTypes.SQL_CHART },
                ],
                allFilterableFieldsMap: {},
                filterableFieldsByTileUuid: undefined,
            };
            mockSqlColumnsByTile.current = {
                'sql-1': [{ reference: 'city', type: 'string' }],
            };
            const COUNTRY = {
                fieldId: 'country',
                tableName: 'sql_chart',
                isSqlColumn: true,
            };
            setSidebar(
                { ...rule('country', { 'sql-1': COUNTRY }), target: COUNTRY },
                { highlightedFieldId: 'country' },
            );
            renderWithProviders(<Dashboard />);

            expect(countOf('country')).toHaveTextContent(/^on 1 of 1 tile$/);
        });

        it('never counts a data app tile as a tile of a SQL column', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('sql-1'), type: DashboardTileTypes.SQL_CHART },
                    { ...tile('app-1'), type: DashboardTileTypes.DATA_APP },
                ],
                allFilterableFieldsMap: {},
                filterableFieldsByTileUuid: undefined,
            };
            mockSqlColumnsByTile.current = {
                'sql-1': [{ reference: 'country', type: 'string' }],
            };
            const COUNTRY = {
                fieldId: 'country',
                tableName: 'sql_chart',
                isSqlColumn: true,
            };
            setSidebar(
                { ...rule('country', { 'sql-1': COUNTRY }), target: COUNTRY },
                { highlightedFieldId: 'country' },
            );
            renderWithProviders(<Dashboard />);

            expect(countOf('country')).toHaveTextContent(/^on 1 of 1 tile$/);
        });
    });

    describe('focus after an action', () => {
        it('does not take focus later when the pressed button stayed', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<Dashboard />);

            // The mocked rule is not updated, so the button stays
            const button = screen.getByRole('button', {
                name: 'Filter the other 1 tile by Status',
            });
            await userEvent.click(button);
            rerender(<Dashboard />);
            button.blur();
            rerender(<Dashboard />);

            expect(document.body).toHaveFocus();
        });

        it('goes to the bar when the pressed button is gone', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<Dashboard />);

            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the other 1 tile by Status',
                }),
            );
            setSidebar(getUpdatedRule());
            rerender(<Dashboard />);

            expect(
                screen.queryByRole('button', { name: /^Filter the other/ }),
            ).not.toBeInTheDocument();
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
        const { result, rerender } = renderHook(() =>
            useFieldTileActions(columns),
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

    describe('while the tile fields are not loaded', () => {
        it('switches Clear off, and switches it back on once they are there', () => {
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
            expect(updateFilter).not.toHaveBeenCalled();

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

    it('has a named button for every action, with no menu and no border', () => {
        setSidebar(rule('orders_status', { 'tile-1': false }));
        renderWithProviders(<Dashboard />);

        expect(queryButtonTexts()).not.toHaveLength(0);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
        expect(bar()).not.toHaveAttribute('data-with-border');
        within(bar())
            .getAllByRole('button')
            .forEach((button) => {
                expect(button).toBeEnabled();
                expect(button).toHaveAttribute(
                    'aria-label',
                    expect.stringContaining('Status'),
                );
            });
    });
});
