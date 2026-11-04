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
import { Box } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { dashboardTileStatusActions } from '../dashboard/store';
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
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
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

const country: ResultColumn = {
    reference: 'country',
    type: DimensionType.STRING,
};
const total: ResultColumn = { reference: 'total', type: DimensionType.NUMBER };

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
        isAsking: false,
        isPristineNew: false,
        clearField: clearHighlightedField,
        dismiss: close,
        dismissOutside: () => {
            close();
            return false;
        },
    });
    return (
        <Box data-controls-editor>
            <FieldsAndTiles />
        </Box>
    );
};

// Seeds the store's SQL chart metadata from `mockTileStatus` at render time
const renderWithProviders = (ui: ReactElement) => {
    const store = createDashboardTestStore({
        sqlChartTilesMetadata: mockTileStatus.current
            .sqlChartTilesMetadata as Record<string, SqlChartTileMetadata>,
    });
    seedDashboardEditState(
        store,
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
        store,
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
        it('picks its first field in the shipped field search, opened, with nothing else', async () => {
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<FieldsAndTiles />);

            expect(
                screen.queryByText('Select a field to filter'),
            ).not.toBeInTheDocument();
            expect(screen.getByPlaceholderText('Search fields')).toBeVisible();
            expect(
                screen.queryByText("Change a tile's field on the tile itself."),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByText(/Select the field to filter tiles by/),
            ).not.toBeInTheDocument();

            // Open without a click, grouped by table as in "Add filter"
            expect(await screen.findByText('Orders')).toBeVisible();
            expect(optionNames()).toEqual(['Region', 'Status']);

            await userEvent.click(
                screen.getByRole('option', { name: 'Status' }),
            );
            expect(addFirstField).toHaveBeenCalledTimes(1);
            expect(addFirstField).toHaveBeenCalledWith(status);
        });

        it('keeps Escape for the open list, then hands it to the editor', async () => {
            setSidebar(rule(''), { isPlaceholder: true });
            renderWithProviders(<Editor />);

            const search = screen.getByTestId(FIELD_SEARCH);
            await screen.findByText('Orders');
            // As the editor focuses it on mount
            act(() => search.focus());
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

        it('lists metrics alongside dimensions', async () => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableMetrics: [revenue],
            };
            setSidebar(rule(''), { isPlaceholder: true });
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
            renderWithProviders(<FieldsAndTiles />);

            expect(fieldSearch()).not.toBeInTheDocument();
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
        });
    });

    describe('a new control on SQL chart tiles only', () => {
        const sqlTile = (uuid: string) =>
            ({
                uuid,
                type: DashboardTileTypes.SQL_CHART,
                properties: { savedSqlUuid: `chart-${uuid}` },
            }) as DashboardTile;
        const columnInput = () =>
            screen.getByPlaceholderText('Search column...');

        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboardTiles: [sqlTile('sql-1'), sqlTile('sql-2')],
                allFilterableFields: undefined,
                allFilterableMetrics: undefined,
                allFilterableFieldsMap: {},
                filterableFieldsByTileUuid: undefined,
            };
            setSidebar(rule(''), { isPlaceholder: true });
        });

        it('searches the columns already returned', async () => {
            mockTileStatus.current = {
                sqlChartTilesMetadata: {
                    'sql-1': { columns: [country, total] },
                },
            };
            renderWithProviders(<FieldsAndTiles />);

            await userEvent.type(columnInput(), 'tot');
            expect(
                screen
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['total']);
        });

        it('keeps the typed search when another SQL chart tile returns', async () => {
            mockTileStatus.current = {
                sqlChartTilesMetadata: {
                    'sql-1': { columns: [country, total] },
                },
            };
            const { store } = renderWithProviders(<FieldsAndTiles />);

            await userEvent.type(columnInput(), 'tot');
            act(() => {
                store.dispatch(
                    dashboardTileStatusActions.updateSqlChartTilesMetadata({
                        tileUuid: 'sql-2',
                        metadata: { columns: [country] },
                    }),
                );
            });
            expect(columnInput()).toHaveValue('tot');
            expect(
                screen
                    .getAllByRole('option', { hidden: true })
                    .map((option) => option.textContent),
            ).toEqual(['total']);
        });

        it('shows the columns load while a SQL chart tile runs its query', async () => {
            let finish: () => void = () => {};
            // A mounted SQL chart tile, as its results query registers
            const RunningTile = () => {
                useQuery(
                    ['savedSqlChartResults', 'chart', { tileUuid: 'sql-2' }],
                    () =>
                        new Promise<null>((resolve) => {
                            finish = () => resolve(null);
                        }),
                );
                return null;
            };
            renderWithProviders(
                <>
                    <RunningTile />
                    <FieldsAndTiles />
                </>,
            );
            await waitFor(() =>
                expect(columnInput()).toHaveAttribute('aria-busy', 'true'),
            );

            act(() => finish());
            await waitFor(() =>
                expect(columnInput()).toHaveAttribute('aria-busy', 'false'),
            );
        });

        it('does not wait for a tile that has its columns and queries again', async () => {
            mockTileStatus.current = {
                sqlChartTilesMetadata: {
                    'sql-1': { columns: [country] },
                    'sql-2': { columns: [total] },
                },
            };
            // A refresh, or a filter or parameter change, recreates the query
            const RefreshedTile = () => {
                useQuery(
                    ['savedSqlChartResults', 'chart', { tileUuid: 'sql-2' }],
                    () => new Promise<null>(() => {}),
                );
                return null;
            };
            renderWithProviders(
                <>
                    <RefreshedTile />
                    <FieldsAndTiles />
                </>,
            );
            await act(async () => {});
            expect(columnInput()).toHaveAttribute('aria-busy', 'false');
        });

        it('does not wait for a SQL chart tile whose results query never runs', async () => {
            // Its chart failed or is gone: the results query stays disabled
            const StuckTile = () => {
                useQuery(
                    ['savedSqlChartResults', 'chart', { tileUuid: 'sql-2' }],
                    () => null,
                    { enabled: false },
                );
                return null;
            };
            renderWithProviders(
                <>
                    <StuckTile />
                    <FieldsAndTiles />
                </>,
            );
            await act(async () => {});
            expect(columnInput()).toHaveAttribute('aria-busy', 'false');
        });
    });

    it('renders nothing when no control is edited', () => {
        mockSidebar.current = { ...mockSidebar.current, editingRule: null };
        renderWithProviders(<FieldsAndTiles />);

        expect(fieldSearch()).not.toBeInTheDocument();
    });
});
