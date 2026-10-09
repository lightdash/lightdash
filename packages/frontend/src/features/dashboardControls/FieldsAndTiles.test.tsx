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
import { useEditorDismiss } from './useEditorDismiss';

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
const clearHighlightedField = vi.fn();
const updateFilter = vi.fn();
const setHighlightedFieldId = vi.fn();
const setHoveredFieldId = vi.fn();
const addWaitingField = vi.fn();
const removeWaitingField = vi.fn();
const removeLastField = vi.fn();

const setSidebar = (
    editingRule: DashboardFilterRule,
    overrides: Record<string, unknown> = {},
) => {
    mockSidebar.current = {
        editingRule,
        isPlaceholder: false,
        addFirstField,
        addFirstSqlColumn,
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
        removeLastField,
        ...overrides,
    };
};

// The fields inside the editor, with the editor's real Escape handling
const Editor = () => {
    useEditorDismiss({
        isOpen: true,
        isFieldClicked: false,
        clearField: clearHighlightedField,
        close,
    });
    return (
        <div data-controls-editor>
            <FieldsAndTiles />
        </div>
    );
};

const removeButtonOf = (label: string) =>
    screen.getByLabelText(`Remove field ${label}`);

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
            renderWithProviders(<Editor />);

            const search = screen.getByTestId(FIELD_SEARCH);
            expect(search).not.toHaveAttribute('data-expanded');
            await userEvent.click(search);
            await screen.findByText('Orders');
            // What the editor's Escape handling reads to leave the list alone
            expect(search).toHaveAttribute('data-expanded');
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
            screen.getByText('Select a field to change its tiles.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Status' })).toBeVisible();
        expect(screen.getByText('Orders · 1 of 2 tiles')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Region' })).toBeVisible();
        expect(screen.getByText('Orders · 1 of 1 tile')).toBeVisible();
        expect(removeButtonOf('Status')).toBeInTheDocument();
        expect(removeButtonOf('Region')).toBeInTheDocument();
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

        it('removes the column, its only field', async () => {
            setSidebar(sqlRule({ 'sql-1': COUNTRY }));
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.click(removeButtonOf('country'));
            expect(removeLastField).toHaveBeenCalledTimes(1);
            expect(updateFilter).not.toHaveBeenCalled();
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
        expect(removeButtonOf('orders_gone')).toBeInTheDocument();
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

    it('has a trash can on each card, and no eye or menu', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        renderWithProviders(<FieldsAndTiles />);

        expect(
            screen.queryByRole('button', { name: /^Show only tiles/ }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Apply to/ }),
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('menu')).not.toBeInTheDocument();

        await userEvent.hover(removeButtonOf('Region'));
        expect(await screen.findByText('Remove field')).toBeInTheDocument();
        // The trash can never toggles the card
        await userEvent.click(removeButtonOf('Region'));
        expect(setHighlightedFieldId).not.toHaveBeenCalled();
        expect(clearHighlightedField).not.toHaveBeenCalled();
    });

    it('has no "Show all tiles" button and no scope switch', () => {
        setSidebar(rule('orders_status'), {
            highlightedFieldId: 'orders_status',
        });
        renderWithProviders(<FieldsAndTiles />);

        expect(screen.queryByText('Show all tiles')).not.toBeInTheDocument();
        expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('More actions for Status'),
        ).not.toBeInTheDocument();
    });

    it('highlights a field when any part of its card is hovered', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<FieldsAndTiles />);

        await userEvent.hover(screen.getByText(/^Orders · /));
        expect(setHoveredFieldId).toHaveBeenLastCalledWith('orders_status');
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

        beforeEach(() => setTabs(TAB_1));

        it('counts every tab on the card, whatever the active tab', () => {
            setSidebar(rule('orders_status', { 'tile-1': false }));
            const { rerender } = renderWithProviders(<FieldsAndTiles />);
            expect(screen.getByText('Orders · 2 of 3 tiles')).toBeVisible();

            setTabs(TAB_2);
            rerender(<FieldsAndTiles />);
            expect(screen.getByText('Orders · 2 of 3 tiles')).toBeVisible();
        });
    });

    it('removes one of several fields', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }), {
            highlightedFieldId: 'orders_region',
        });
        renderWithProviders(<FieldsAndTiles />);

        fireEvent.click(removeButtonOf('Region'));
        const next = getUpdatedRule();
        expect(next.target.fieldId).toBe('orders_status');
        expect(next.tileTargets).toBeUndefined();
        expect(setHighlightedFieldId).toHaveBeenCalledWith(null);
    });

    it('promotes another field when the first one is removed', async () => {
        setSidebar(rule('orders_status', { 'tile-1': REGION }));
        renderWithProviders(<FieldsAndTiles />);

        fireEvent.click(removeButtonOf('Status'));
        const next = getUpdatedRule();
        expect(next.target).toEqual(REGION);
        expect(next.tileTargets).toBeUndefined();
    });

    it.each([false, true])(
        'removes the only field of a filter, leaving the control empty (new: %s)',
        async (isNew) => {
            setSidebar(rule('orders_status'), {
                isNew,
                highlightedFieldId: 'orders_status',
            });
            renderWithProviders(<FieldsAndTiles />);

            expect(removeButtonOf('Status')).toBeEnabled();
            await userEvent.click(removeButtonOf('Status'));
            expect(removeLastField).toHaveBeenCalledTimes(1);
            expect(updateFilter).not.toHaveBeenCalled();
            expect(removeWaitingField).not.toHaveBeenCalled();
            expect(setHighlightedFieldId).toHaveBeenCalledWith(null);
        },
    );

    it('empties the control when its last field goes while another waits', async () => {
        setSidebar(rule('orders_status'), {
            waitingFieldIds: ['orders_region'],
        });
        renderWithProviders(<FieldsAndTiles />);

        await userEvent.click(removeButtonOf('Status'));
        expect(removeLastField).toHaveBeenCalledTimes(1);
        expect(updateFilter).not.toHaveBeenCalled();
    });

    it('puts "Add a field" away on Escape and when focus leaves it', async () => {
        setSidebar(rule('orders_status'));
        renderWithProviders(<Editor />);
        const add = screen.getByRole('button', { name: 'Add a field' });

        await userEvent.click(add);
        // Focused with its list open
        expect(fieldSearch()).toHaveFocus();
        expect(await screen.findByText('Orders')).toBeVisible();
        expect(fieldSearch()).toHaveAttribute('data-expanded');
        await userEvent.keyboard('{Escape}');
        expect(fieldSearch()).not.toBeInTheDocument();
        expect(add).toHaveFocus();
        // The press belonged to the list, not to the editor
        expect(close).not.toHaveBeenCalled();

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
            expect(
                screen
                    .getByRole('button', { name: 'Region' })
                    .closest('[data-waiting="true"]'),
            ).not.toBeNull();
            expect(
                screen
                    .getByRole('button', { name: 'Status' })
                    .closest('[data-waiting]'),
            ).toBeNull();

            await userEvent.click(removeButtonOf('Region'));
            expect(removeWaitingField).toHaveBeenCalledWith('orders_region');
            expect(updateFilter).not.toHaveBeenCalled();
            expect(removeLastField).not.toHaveBeenCalled();
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
