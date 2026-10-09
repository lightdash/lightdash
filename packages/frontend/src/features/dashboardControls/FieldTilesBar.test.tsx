import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FieldTilesBar } from './FieldTilesBar';

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
// A scope's label and count, as one live element reads them out
const countOf = (scopeName: string, label = 'Status') =>
    within(bar(label)).getByText(scopeName).parentElement;
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
        it('has one group, with the count over every tile', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(countOf('Tiles')).toHaveTextContent('Tiles1 of 2');
            expect(countOf('Tiles')).toHaveAttribute('aria-live', 'polite');
            // The field leads the bar, with its icon
            expect(within(bar()).getByText('Status')).toBeInTheDocument();
            expect(buttonTexts()).toEqual(['Filter 1 more', 'Clear']);
            expect(screen.queryByText('Every tab')).not.toBeInTheDocument();
            expect(screen.queryByText('This tab')).not.toBeInTheDocument();
        });

        it('says "tile" for one tile', () => {
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Tiles', 'Region')).toHaveTextContent('Tiles1 of 1');
        });

        it('offers only the clear when every tile that offers the field is on it', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<Dashboard />);

            expect(buttonTexts()).toEqual(['Clear']);
        });

        it('offers only the add for a field on no tile', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-2': false }),
            );
            renderWithProviders(<Dashboard />);

            expect(buttonTexts()).toEqual(['Filter 2 more']);
        });

        it('has no button for a field no tile offers', () => {
            setSidebar(rule('orders_status'), {
                highlightedFieldId: 'customers_city',
                waitingFieldIds: ['customers_city'],
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Tiles', 'City')).toHaveTextContent(
                'Tilesno tile has it',
            );
            expect(within(bar('City')).queryAllByRole('button')).toHaveLength(
                0,
            );
        });

        it('adds the field to the unfiltered tiles', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the 1 unfiltered tile by Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('adds without replacing, and switches without adding', () => {
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
            expect(countOf('Tiles')).toHaveTextContent('Tiles1 of 3');
            expect(buttonTexts()).toEqual([
                'Filter 1 more',
                'Switch 1 from Region',
                'Clear',
            ]);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the 1 unfiltered tile by Status',
                }),
            );
            // tile-1 keeps Region
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-1': REGION });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Switch 1 tile from Region to Status',
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

            expect(buttonTexts()).toEqual(['Switch 2 from Region and City']);
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Switch 2 tiles from Region and City to Status',
                }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
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

            expect(countOf('Tiles', 'Region')).toHaveTextContent('Tiles0 of 1');
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Switch 1 tile from Status to Region',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-1': REGION });
        });
    });

    describe('on a dashboard with tabs', () => {
        const TAB_1 = { uuid: 'tab-1', name: 'One', order: 0 };
        const TAB_2 = { uuid: 'tab-2', name: 'Two', order: 1 };
        const setTabs = (activeTab: typeof TAB_1) => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('tile-1'), tabUuid: 'tab-1' },
                    { ...tile('tile-2'), tabUuid: 'tab-1' },
                    { ...tile('tile-3'), tabUuid: 'tab-2' },
                ],
                dashboardTabs: [TAB_1, TAB_2],
                activeTab,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [status],
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
                <FieldTilesBar />
            </>
        );
        const everyTabTexts = () =>
            within(countOf('Every tab')?.parentElement as HTMLElement)
                .queryAllByRole('button')
                .map((button) => button.textContent);

        beforeEach(() => setTabs(TAB_1));

        it('follows the active tab, after its grid', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<TabbedDashboard />);

            expect(screen.getByTestId('grid-1').nextElementSibling).toBe(
                bar().parentElement,
            );
            expect(countOf('This tab')).toHaveTextContent('This tab1 of 2');
            expect(countOf('This tab')).toHaveAttribute('aria-live', 'polite');
            expect(countOf('Every tab')).toHaveTextContent('Every tab2 of 3');

            setTabs(TAB_2);
            rerender(<TabbedDashboard />);
            expect(screen.getByTestId('grid-2').nextElementSibling).toBe(
                bar().parentElement,
            );
            expect(screen.getByTestId('grid-1').nextElementSibling).toBeNull();
            expect(countOf('This tab')).toHaveTextContent('This tab1 of 1');
        });

        it('has one scope with fewer than two tabs', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTabs: [TAB_1],
            };
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<Dashboard />);

            expect(countOf('Tiles')).toHaveTextContent('Tiles2 of 3');
            expect(buttonTexts()).toEqual(['Filter 1 more', 'Clear']);
            expect(screen.queryByText('Every tab')).not.toBeInTheDocument();
        });

        it('lists each scope with only the buttons that change something', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<TabbedDashboard />);

            expect(buttonTexts()).toEqual([
                'Filter 1 more',
                'Clear',
                'Filter 1 more',
                'Clear',
            ]);

            // The field covers that tab, so only its clear is left there
            setTabs(TAB_2);
            rerender(<TabbedDashboard />);
            expect(buttonTexts()).toEqual(['Clear', 'Filter 1 more', 'Clear']);
        });

        it('has no button on a tab where no tile offers the field', () => {
            setTabs(TAB_2);
            setSidebar(rule('orders_status', { 'tile-1': REGION }), {
                highlightedFieldId: 'orders_region',
            });
            renderWithProviders(<TabbedDashboard />);

            expect(countOf('This tab', 'Region')).toHaveTextContent(
                'This tabno tile has it',
            );
            expect(countOf('Every tab', 'Region')).toHaveTextContent(
                'Every tab1 of 1',
            );
            expect(
                within(bar('Region'))
                    .getAllByRole('button')
                    .map((button) => button.textContent),
            ).toEqual(['Clear']);
        });

        it('adds on this tab only, or on every tab', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-3': false }),
            );
            renderWithProviders(<TabbedDashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the 1 unfiltered tile by Status on this tab',
                }),
            );
            // The other tab keeps what it had
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-3': false });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the 2 unfiltered tiles by Status on every tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('switches on this tab only, or on every tab', () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [status, region],
                },
            };
            setSidebar(
                rule('orders_status', { 'tile-1': REGION, 'tile-3': REGION }),
            );
            renderWithProviders(<TabbedDashboard />);

            expect(everyTabTexts()).toEqual(['Switch 2 from Region', 'Clear']);
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Switch 1 tile from Region to Status on this tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({ 'tile-3': REGION });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Switch 2 tiles from Region to Status on every tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('clears this tab, or every tab', () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<TabbedDashboard />);

            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Clear Status from this tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': false,
                'tile-2': false,
            });

            updateFilter.mockClear();
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Clear Status from every tab',
                }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': false,
                'tile-2': false,
                'tile-3': false,
            });
        });

        it('hides each clear when the field is on no tile of its scope', () => {
            setSidebar(
                rule('orders_status', { 'tile-1': false, 'tile-2': false }),
            );
            const { rerender } = renderWithProviders(<TabbedDashboard />);
            expect(buttonTexts()).toEqual([
                'Filter 2 more',
                'Filter 2 more',
                'Clear',
            ]);

            setSidebar(
                rule('orders_status', {
                    'tile-1': false,
                    'tile-2': false,
                    'tile-3': false,
                }),
            );
            rerender(<TabbedDashboard />);
            expect(buttonTexts()).toEqual(['Filter 2 more', 'Filter 3 more']);
        });
    });

    describe('a SQL column filter', () => {
        const sqlTile = (uuid: string) =>
            ({ uuid, type: DashboardTileTypes.SQL_CHART }) as DashboardTile;
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

        it('adds the column to the tiles that have it and are not filtered', () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY }), {
                highlightedFieldId: 'country',
            });
            renderWithProviders(<Dashboard />);

            expect(countOf('Tiles', 'country')).toHaveTextContent(
                'Tiles1 of 2',
            );
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Filter the 1 unfiltered tile by country',
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
                    name: 'Switch 1 tile from city to country',
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
    });

    it('has a named button for every action, with no menu', () => {
        setSidebar(rule('orders_status', { 'tile-1': false }));
        renderWithProviders(<Dashboard />);

        expect(queryButtonTexts()).not.toHaveLength(0);
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();
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
