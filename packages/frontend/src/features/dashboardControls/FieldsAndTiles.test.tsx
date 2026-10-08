import {
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
    type Metric,
    type ResultColumn,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
import { FieldsAndTiles } from './FieldsAndTiles';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: () => mockSidebar.current,
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));
const mockSqlColumnsByTile = vi.hoisted(() => ({
    current: {} as Record<string, { reference: string; type: string }[]>,
}));
// The Tabs section has its own tests
vi.mock('./TabTargets', () => ({ TabTargets: () => null }));
vi.mock('./useSqlColumnsByTile', () => ({
    useSqlColumnsByTile: () => mockSqlColumnsByTile.current,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector) => selector(mockTileStatus.current)),
}));
const mockMetricFiltersFlag = vi.hoisted(() => ({ current: false }));
vi.mock('../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: mockMetricFiltersFlag.current },
    }),
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
const amount = dimension('amount', 'Amount', {
    table: 'payments',
    tableLabel: 'Payments',
    type: DimensionType.NUMBER,
});

const grain = (name: string, label: string, timeInterval: TimeFrames) =>
    dimension(name, label, {
        type: DimensionType.DATE,
        timeInterval,
        timeIntervalBaseDimensionName: 'created',
    });
const createdDay = grain('created_day', 'Created day', TimeFrames.DAY);
const createdMonth = grain('created_month', 'Created month', TimeFrames.MONTH);

const metric = (name: string, label: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});
const revenue = metric('revenue', 'Revenue');
const profit = metric('profit', 'Profit');

const country: ResultColumn = {
    reference: 'country',
    type: DimensionType.STRING,
};
const total: ResultColumn = { reference: 'total', type: DimensionType.NUMBER };

const REGION = { fieldId: 'orders_region', tableName: 'orders' };

const FIELD_SEARCH = 'FilterConfiguration/FieldSelect';
const fieldSearch = () => screen.queryByTestId(FIELD_SEARCH);
const optionNames = () =>
    screen.getAllByRole('option').map((option) => option.textContent);

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

const addFirstField = vi.fn();
const addFirstSqlColumn = vi.fn();
const close = vi.fn();
const addParameterControl = vi.fn();
const clearHighlightedField = vi.fn();
const updateFilter = vi.fn();
const setHighlightedFieldId = vi.fn();
const setHoveredFieldId = vi.fn();
const addWaitingField = vi.fn();
const removeWaitingField = vi.fn();

const setSidebar = (
    editingRule: DashboardFilterRule,
    overrides: Record<string, unknown> = {},
) => {
    mockSidebar.current = {
        editingRule,
        isPlaceholder: false,
        addFirstField,
        addFirstSqlColumn,
        addParameterControl,
        isNew: false,
        close,
        updateFilter,
        highlightedFieldId: null,
        setHighlightedFieldId,
        clearHighlightedField,
        hoveredFieldId: null,
        setHoveredFieldId,
        waitingFieldIds: [],
        addWaitingField,
        removeWaitingField,
        ...overrides,
    };
};

const openRowMenu = (label: string) =>
    fireEvent.click(screen.getByLabelText(`More actions for ${label}`));

const getUpdatedRule = (): DashboardFilterRule => {
    expect(updateFilter).toHaveBeenCalledTimes(1);
    return updateFilter.mock.calls[0][0];
};

describe('FieldsAndTiles', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // The shipped picker virtualises its list, which needs a size
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        mockMetricFiltersFlag.current = false;
        mockSqlColumnsByTile.current = {};
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            dashboardTiles: [tile('tile-1'), tile('tile-2')],
            dashboardTabs: [],
            activeTab: undefined,
            allFilterableFields: [status, region],
            allFilterableMetrics: [],
            allFilterableFieldsMap: {
                orders_status: status,
                orders_region: region,
            },
            allFilterableMetricsMap: {},
            filterableFieldsByTileUuid: {
                'tile-1': [status, region],
                'tile-2': [status],
            },
            parameterControls: [],
            parameterDefinitions: {},
            tileParameterReferences: {},
        };
    });

    afterEach(() => vi.restoreAllMocks());

    describe('a new control', () => {
        it('picks its first field in the shipped field search', async () => {
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(
                <>
                    <input data-controls-label aria-label="Label" />
                    <FieldsAndTiles />
                </>,
            );

            expect(screen.getByText('Select a field to filter')).toBeVisible();
            expect(
                screen.queryByText('Fields in this filter'),
            ).not.toBeInTheDocument();
            expect(
                screen.getByText('Pick a field to filter tiles by it.'),
            ).toBeVisible();

            await userEvent.click(screen.getByTestId(FIELD_SEARCH));
            // Grouped by table, as in "Add filter"
            expect(await screen.findByText('Orders')).toBeVisible();
            expect(optionNames()).toEqual(['Region', 'Status']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Status' }),
            );
            expect(addFirstField).toHaveBeenCalledTimes(1);
            expect(addFirstField).toHaveBeenCalledWith(status);
            // Naming it comes next
            expect(screen.getByLabelText('Label')).toHaveFocus();
        });

        it('keeps Escape for the open list, then hands it to the editor', async () => {
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<FieldsAndTiles />);

            const search = screen.getByTestId(FIELD_SEARCH);
            // The editor's own Escape handling leaves this search alone
            expect(search.closest('[data-own-escape]')).not.toBeNull();
            await userEvent.click(search);
            await screen.findByText('Orders');
            await userEvent.keyboard('{Escape}');
            // The first press only closed the list
            expect(close).not.toHaveBeenCalled();

            await userEvent.keyboard('{Escape}');
            expect(close).toHaveBeenCalledTimes(1);
        });

        it('lists every time grain as a field of its own', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFields: [status, createdDay, createdMonth],
            };
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(screen.getByTestId(FIELD_SEARCH));
            await screen.findByText('Orders');
            expect(optionNames()).toEqual([
                'Created day',
                'Created month',
                'Status',
            ]);

            await userEvent.click(
                screen.getByRole('option', { name: 'Created month' }),
            );
            expect(addFirstField).toHaveBeenCalledWith(createdMonth);
        });

        it('lists metrics only where metric filters can be created', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableMetrics: [revenue],
            };
            setSidebar(rule(''), { isPlaceholder: true });
            const { unmount } = renderWithProviders(<FieldsAndTiles />);
            await userEvent.click(screen.getByTestId(FIELD_SEARCH));
            await screen.findByText('Orders');
            expect(optionNames()).toEqual(['Region', 'Status']);
            unmount();

            mockMetricFiltersFlag.current = true;
            renderWithProviders(<FieldsAndTiles />);
            await userEvent.click(screen.getByTestId(FIELD_SEARCH));
            await screen.findByText('Orders');
            expect(optionNames()).toEqual(['Region', 'Status', 'Revenue']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Revenue' }),
            );
            expect(addFirstField).toHaveBeenCalledWith(revenue);
        });

        it('separates the fields of the current tab from the others', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    { ...tile('tile-1'), tabUuid: 'tab-1' },
                    { ...tile('tile-2'), tabUuid: 'tab-2' },
                ],
                dashboardTabs: [
                    { uuid: 'tab-1', name: 'One', order: 0 },
                    { uuid: 'tab-2', name: 'Two', order: 1 },
                ],
                activeTab: { uuid: 'tab-2', name: 'Two', order: 1 },
                filterableFieldsByTileUuid: {
                    'tile-1': [region],
                    'tile-2': [status],
                },
            };
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(screen.getByTestId(FIELD_SEARCH));
            expect(await screen.findByText('Fields in this tab')).toBeVisible();
            expect(screen.getByText('Other available fields')).toBeVisible();
            expect(optionNames()).toEqual(['Status', 'Region']);
        });

        it('starts a parameter control from its own select, not the field search', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                parameterControls: [
                    {
                        id: 'taken',
                        label: 'Taken',
                        parameterKeys: ['country'],
                        tileTargets: {},
                    },
                ],
                parameterDefinitions: {
                    region: { label: 'Sales region' },
                    country: { label: 'Country' },
                    limit: { label: 'Row limit', type: 'number' },
                    unused: { label: 'Unused' },
                },
                tileParameterReferences: {
                    'tile-1': ['region', 'country', 'limit'],
                    'tile-2': ['region'],
                },
            };
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<FieldsAndTiles />);

            expect(
                screen.getByText(
                    'Pick a field to filter tiles by it, or a parameter to set its value on tiles.',
                ),
            ).toBeVisible();
            expect(screen.getByText('Or control a parameter')).toBeVisible();
            await userEvent.click(screen.getByTestId(FIELD_SEARCH));
            await screen.findByText('Orders');
            expect(optionNames()).toEqual(['Region', 'Status']);

            await userEvent.click(
                screen.getByPlaceholderText('Search parameters'),
            );
            // Free parameters only: one is in a control, one is on no tile
            const options = screen
                .getAllByRole('option', { hidden: true })
                .filter((option) =>
                    ['Sales region', 'Row limit'].includes(
                        option.textContent ?? '',
                    ),
                );
            expect(options.map((option) => option.textContent)).toEqual([
                'Sales region',
                'Row limit',
            ]);
            expect(
                screen.queryByRole('option', { name: 'Country', hidden: true }),
            ).not.toBeInTheDocument();

            await userEvent.click(options[0]);
            expect(addParameterControl).toHaveBeenCalledTimes(1);
            expect(addParameterControl).toHaveBeenCalledWith('region');
            expect(addFirstField).not.toHaveBeenCalled();
        });

        it('offers no parameter select when no parameter is free', () => {
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<FieldsAndTiles />);

            expect(
                screen.queryByPlaceholderText('Search parameters'),
            ).not.toBeInTheDocument();
        });

        it('offers SQL columns when no tile has fields', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFields: undefined,
                allFilterableMetrics: undefined,
                allFilterableFieldsMap: {},
                filterableFieldsByTileUuid: undefined,
            };
            mockTileStatus.current = {
                sqlChartTilesMetadata: {
                    'tile-1': { columns: [country, total] },
                    'tile-2': { columns: [country] },
                },
            };
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(
                <>
                    <input data-controls-label aria-label="Label" />
                    <FieldsAndTiles />
                </>,
            );

            expect(fieldSearch()).not.toBeInTheDocument();
            expect(
                screen.getByText('Pick a column to filter tiles by it.'),
            ).toBeVisible();
            expect(screen.getByText('Select a column to filter')).toBeVisible();
            await userEvent.click(
                screen.getByPlaceholderText('Search column...'),
            );
            const options = screen.getAllByRole('option', { hidden: true });
            expect(options.map((option) => option.textContent)).toEqual([
                'country',
                'total',
            ]);

            await userEvent.click(options[1]);
            expect(addFirstSqlColumn).toHaveBeenCalledTimes(1);
            expect(addFirstSqlColumn).toHaveBeenCalledWith(total, {
                'tile-1': [country, total],
                'tile-2': [country],
            });
            expect(addFirstField).not.toHaveBeenCalled();
            expect(screen.getByLabelText('Label')).toHaveFocus();
        });
    });

    it('lists the fields of a filter with their tile counts', () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('Fields in this filter')).toBeVisible();
        expect(
            screen.getByText('Choose which field each tile is filtered by.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Status' })).toBeVisible();
        expect(screen.getByText('Orders · 1 of 2 tiles')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Region' })).toBeVisible();
        expect(screen.getByText('Orders · 1 of 1 tile')).toBeVisible();
        expect(screen.getByText('Apply to all 2')).toBeVisible();
        expect(screen.queryByText('Apply to all 1')).not.toBeInTheDocument();
        expect(fieldSearch()).not.toBeInTheDocument();
    });

    it('names a time grain by its own label', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            allFilterableFields: [createdDay, createdMonth],
            allFilterableFieldsMap: {
                orders_created_day: createdDay,
                orders_created_month: createdMonth,
            },
            filterableFieldsByTileUuid: {
                'tile-1': [createdDay, createdMonth],
            },
        };
        setSidebar(rule('orders_created_month'));
        renderWithProviders(<FieldsAndTiles />);

        expect(
            screen.getByRole('button', { name: 'Created month' }),
        ).toBeVisible();
    });

    describe('a metric filter', () => {
        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableMetrics: [revenue, profit],
                allFilterableMetricsMap: {
                    orders_revenue: revenue,
                    orders_profit: profit,
                },
                filterableFieldsByTileUuid: {
                    'tile-1': [status, revenue, profit],
                    'tile-2': [status, revenue],
                },
            };
        });

        it('lists its metric with the tiles that offer it', () => {
            setSidebar(rule('orders_revenue'));
            renderWithProviders(<FieldsAndTiles />);

            expect(
                screen.getByRole('button', { name: 'Revenue' }),
            ).toBeVisible();
            expect(screen.getByText('Orders · 2 of 2 tiles')).toBeVisible();
        });

        it('adds metrics of its type, and no dimension', async () => {
            setSidebar(rule('orders_revenue'));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await screen.findByText('Orders');
            expect(optionNames()).toEqual(['Profit']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Profit' }),
            );
            // tile-1 keeps Revenue, so Profit waits for a tile
            expect(addWaitingField).toHaveBeenCalledWith('orders_profit');
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
                allFilterableFields: undefined,
                allFilterableFieldsMap: {},
                filterableFieldsByTileUuid: undefined,
            };
            mockSqlColumnsByTile.current = {
                'sql-1': [{ reference: 'country', type: 'string' }],
                'sql-2': [{ reference: 'country', type: 'string' }],
                'sql-3': [{ reference: 'city', type: 'string' }],
            };
        });

        it('lists the column with the SQL chart tiles that have it', () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY }));
            renderWithProviders(<FieldsAndTiles />);

            expect(
                screen.getByRole('button', { name: 'country' }),
            ).toBeVisible();
            expect(screen.getByText('SQL column · 1 of 2 tiles')).toBeVisible();
        });

        it('applies the column to every tile that has it', () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY }));
            renderWithProviders(<FieldsAndTiles />);

            fireEvent.click(screen.getByText('Apply to all 2'));
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

        it('clears the column from its tiles', async () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY, 'sql-2': COUNTRY }));
            renderWithProviders(<FieldsAndTiles />);

            openRowMenu('country');
            fireEvent.click(await screen.findByText('Clear from tiles'));
            // A SQL chart tile with no entry is not filtered
            expect(getUpdatedRule().tileTargets).toBeUndefined();
        });

        it('has no other field to add', () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY }));
            renderWithProviders(<FieldsAndTiles />);

            expect(
                screen.getByRole('button', { name: 'Add a field' }),
            ).toHaveAttribute('data-disabled', 'true');
        });
    });

    it('falls back to the field id when the field is unknown', () => {
        setSidebar(rule('orders_gone'));
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('orders_gone')).toBeVisible();
        expect(screen.getByText('orders · 0 of 0 tiles')).toBeVisible();
        expect(
            screen.queryByLabelText('More actions for orders_gone'),
        ).toBeInTheDocument();
    });

    it('highlights a field on click and on hover', async () => {
        setSidebar(rule('orders_status'));
        const { rerender } = renderWithProviders(<FieldsAndTiles />);
        const label = screen.getByRole('button', { name: 'Status' });

        await userEvent.hover(label);
        expect(setHoveredFieldId).toHaveBeenLastCalledWith('orders_status');
        await userEvent.click(label);
        expect(setHighlightedFieldId).toHaveBeenLastCalledWith('orders_status');

        setSidebar(rule('orders_status'), {
            highlightedFieldId: 'orders_status',
            hoveredFieldId: 'orders_status',
        });
        rerender(<FieldsAndTiles />);
        const pressed = screen.getByRole('button', { name: 'Status' });
        expect(pressed).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(pressed);
        expect(clearHighlightedField).toHaveBeenCalledTimes(1);
        await userEvent.unhover(pressed);
        expect(setHoveredFieldId).toHaveBeenLastCalledWith(null);
    });

    it('offers "Show all tiles" on the clicked field only', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        const { rerender } = renderWithProviders(<FieldsAndTiles />);
        expect(
            screen.queryByRole('button', { name: 'Show all tiles' }),
        ).not.toBeInTheDocument();

        setSidebar(rule('orders_status', { 'tile-1': REGION }), {
            highlightedFieldId: 'orders_region',
        });
        rerender(<FieldsAndTiles />);
        const showAll = screen.getByRole('button', { name: 'Show all tiles' });
        const region = screen.getByRole('button', { name: 'Region' });
        // It sits in the clicked row, which keeps the field on a mouse down
        expect(showAll.closest('[data-keeps-field]')).toBe(
            region.closest('[data-keeps-field]'),
        );

        await userEvent.click(showAll);
        expect(clearHighlightedField).toHaveBeenCalledTimes(1);
        expect(setHighlightedFieldId).not.toHaveBeenCalled();
        // The button is about to leave: focus goes to the row
        expect(region).toHaveFocus();
    });

    it('highlights a field when any part of its card is hovered', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        await userEvent.hover(screen.getByText(/^Orders · /));
        expect(setHoveredFieldId).toHaveBeenLastCalledWith('orders_status');
    });

    it('applies a field to every tile that offers it', () => {
        setSidebar(rule('orders_status', { 'tile-1': false }));
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.getByText('Orders · 1 of 2 tiles')).toBeVisible();
        fireEvent.click(screen.getByText('Apply to all 2'));
        expect(getUpdatedRule().tileTargets).toBeUndefined();
    });

    it('clears a field from its tiles', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        fireEvent.click(await screen.findByText('Clear from tiles'));
        expect(getUpdatedRule().tileTargets).toEqual({
            'tile-1': false,
            'tile-2': false,
        });
    });

    it('hides the clear action for a field on no tile', async () => {
        setSidebar(rule('orders_status', { 'tile-1': false, 'tile-2': false }));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        expect(await screen.findByText('Remove field')).toBeInTheDocument();
        expect(screen.queryByText('Clear from tiles')).not.toBeInTheDocument();
    });

    it('removes one of several fields', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }), {
            highlightedFieldId: 'orders_region',
        });
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Region');
        fireEvent.click(await screen.findByText('Remove field'));
        const next = getUpdatedRule();
        expect(next.target.fieldId).toBe('orders_status');
        expect(next.tileTargets).toBeUndefined();
        expect(setHighlightedFieldId).toHaveBeenCalledWith(null);
    });

    it('promotes another field when the first one is removed', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        fireEvent.click(await screen.findByText('Remove field'));
        const next = getUpdatedRule();
        expect(next.target).toEqual(REGION);
        expect(next.tileTargets).toBeUndefined();
    });

    it('does not remove the only field of a filter, and says where to go', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        const item = await screen.findByRole('menuitem', {
            name: 'Remove field',
        });
        expect(item).toHaveAttribute('aria-disabled', 'true');
        await userEvent.hover(item);
        expect(
            await screen.findByText(
                'Remove the filter from More actions instead',
            ),
        ).toBeInTheDocument();
        await userEvent.click(item);
        expect(updateFilter).not.toHaveBeenCalled();
        expect(removeWaitingField).not.toHaveBeenCalled();
    });

    it('points a new filter with one field to Discard', async () => {
        setSidebar(rule('orders_status'), { isNew: true });
        renderWithProviders(<FieldsAndTiles />);

        openRowMenu('Status');
        await userEvent.hover(
            await screen.findByRole('menuitem', { name: 'Remove field' }),
        );
        expect(
            await screen.findByText('Discard the control instead'),
        ).toBeInTheDocument();
    });

    it('puts "Add a field" away on Escape and when focus leaves it', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);
        const add = screen.getByRole('button', { name: 'Add a field' });

        await userEvent.click(add);
        // Focused with its list open
        expect(fieldSearch()).toHaveFocus();
        expect(await screen.findByText('Orders')).toBeVisible();
        // The editor's own Escape handling leaves this search alone
        expect(fieldSearch()?.closest('[data-own-escape]')).not.toBeNull();
        await userEvent.keyboard('{Escape}');
        expect(fieldSearch()).not.toBeInTheDocument();
        expect(add).toHaveFocus();

        await userEvent.click(add);
        await userEvent.keyboard('zz{Escape}');
        expect(fieldSearch()).not.toBeInTheDocument();
        expect(add).toHaveFocus();

        await userEvent.click(add);
        await userEvent.click(screen.getByText('Fields in this filter'));
        expect(fieldSearch()).not.toBeInTheDocument();
    });

    it('picks a searched field from the keyboard', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        await userEvent.click(
            screen.getByRole('button', { name: 'Add a field' }),
        );
        await userEvent.keyboard('reg');
        await waitFor(() => expect(optionNames()).toEqual(['Region']));
        await userEvent.keyboard('{ArrowDown}{Enter}');
        expect(addWaitingField).toHaveBeenCalledWith('orders_region');
        expect(fieldSearch()).not.toBeInTheDocument();
    });

    describe('Add a field', () => {
        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [
                    tile('tile-1'),
                    tile('tile-2'),
                    tile('tile-3'),
                    tile('tile-4'),
                ],
                allFilterableFields: [status, region, city, amount],
                allFilterableFieldsMap: {
                    orders_status: status,
                    orders_region: region,
                    customers_city: city,
                    payments_amount: amount,
                },
                filterableFieldsByTileUuid: {
                    'tile-1': [status, region],
                    'tile-2': [status],
                    'tile-3': [city],
                    'tile-4': [amount],
                },
            };
        });

        it('offers every other field of the same kind that a tile offers', async () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<FieldsAndTiles />);

            const button = screen.getByRole('button', { name: 'Add a field' });
            expect(button).not.toHaveAttribute('data-disabled');
            await userEvent.click(button);

            expect(await screen.findByText('Customers')).toBeVisible();
            expect(screen.getByText('Orders')).toBeVisible();
            expect(optionNames()).toEqual(['City', 'Region']);

            await userEvent.click(screen.getByRole('option', { name: 'City' }));
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-3': { fieldId: 'customers_city', tableName: 'customers' },
            });
            expect(addWaitingField).not.toHaveBeenCalled();
            expect(setHighlightedFieldId).toHaveBeenLastCalledWith(
                'customers_city',
            );
            expect(fieldSearch()).not.toBeInTheDocument();
            expect(button).toHaveFocus();
        });

        it('offers the other grains of a date the filter is on', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableFields: [status, createdDay, createdMonth],
                allFilterableFieldsMap: {
                    orders_status: status,
                    orders_created_day: createdDay,
                    orders_created_month: createdMonth,
                },
                filterableFieldsByTileUuid: {
                    'tile-1': [createdMonth],
                    'tile-2': [createdDay],
                },
            };
            setSidebar(rule('orders_created_month'));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await screen.findByText('Orders');
            expect(optionNames()).toEqual(['Created day']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Created day' }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-2': {
                    fieldId: 'orders_created_day',
                    tableName: 'orders',
                },
            });
        });

        it('keeps a field waiting when every tile it fits already has one', async () => {
            setSidebar(rule('orders_status'));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await userEvent.click(
                await screen.findByRole('option', { name: 'Region' }),
            );

            // tile-1 keeps Status: nothing is taken away from it
            expect(getUpdatedRule().tileTargets).toBeUndefined();
            expect(addWaitingField).toHaveBeenCalledWith('orders_region');
            // On no tile, so there is nothing to show for a click
            expect(setHighlightedFieldId).not.toHaveBeenCalled();
        });

        it('lists a waiting field on no tile and removes it on its own', async () => {
            setSidebar(rule('orders_status'), {
                waitingFieldIds: ['orders_region'],
            });
            renderWithProviders(<FieldsAndTiles />);

            expect(screen.getByText('Orders · 0 of 1 tile')).toBeVisible();
            expect(screen.getByText('Apply to all 1')).toBeVisible();
            expect(
                screen
                    .getByRole('button', { name: 'Region' })
                    .closest('[data-keeps-field]'),
            ).toHaveAttribute('data-waiting', 'true');
            expect(
                screen
                    .getByRole('button', { name: 'Status' })
                    .closest('[data-keeps-field]'),
            ).not.toHaveAttribute('data-waiting');

            openRowMenu('Region');
            await userEvent.click(await screen.findByText('Remove field'));
            expect(removeWaitingField).toHaveBeenCalledWith('orders_region');
            expect(updateFilter).not.toHaveBeenCalled();
        });

        it('offers a field again once one of its tiles is left out', async () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Add a field' }),
            );
            await screen.findByText('Customers');
            expect(optionNames()).toEqual(['City', 'Region']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Region' }),
            );
            expect(getUpdatedRule().tileTargets).toEqual({
                'tile-1': REGION,
            });
        });

        it('is disabled when no tile offers another field of the kind', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [tile('tile-2'), tile('tile-4')],
                filterableFieldsByTileUuid: {
                    'tile-2': [status],
                    'tile-4': [amount],
                },
            };
            setSidebar(rule('orders_status'));
            renderWithProviders(<FieldsAndTiles />);

            const button = screen.getByRole('button', { name: 'Add a field' });
            expect(button).toHaveAttribute('data-disabled', 'true');
            await userEvent.click(button);
            expect(fieldSearch()).not.toBeInTheDocument();

            await userEvent.hover(button);
            expect(
                await screen.findByText(
                    'No other field of this type is on a tile',
                ),
            ).toBeInTheDocument();
        });
    });

    it('renders nothing when no control is edited', () => {
        mockSidebar.current = { ...mockSidebar.current, editingRule: null };
        renderWithProviders(<FieldsAndTiles />);

        expect(
            screen.queryByText('Fields in this filter'),
        ).not.toBeInTheDocument();
        expect(fieldSearch()).not.toBeInTheDocument();
    });
});
