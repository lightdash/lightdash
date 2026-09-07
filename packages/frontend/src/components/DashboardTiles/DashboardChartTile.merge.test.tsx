import {
    ChartType,
    DashboardTileTypes,
    DimensionType,
    FieldType,
    FilterOperator,
    MERGE_TABLE_NAME,
    MergeJoinType,
    MetricType,
    QueryHistoryStatus,
    SupportedDbtAdapter,
    type ApiExploreResults,
    type CompiledDimension,
    type CompiledMetric,
    type DashboardChartTile as DashboardChartTileType,
    type DashboardFilterRule,
    type ItemsMap,
    type MetricQuery,
    type SavedChart,
} from '@lightdash/common';
import { act, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type DashboardChartReadyQuery } from '../../hooks/dashboard/useDashboardChartReadyQuery';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { renderWithProviders } from '../../testing/testUtils';
import { GenericDashboardChartTile } from './DashboardChartTile';

// The tile is rendered with its data already resolved; nothing may reach the network.
vi.mock('../../api', () => ({
    lightdashApi: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({ data: undefined }),
}));
vi.mock('../../hooks/usePreAggregateRefresh', () => ({
    useRefreshPreAggregateByDefinitionName: () => ({
        mutate: () => {},
        isLoading: false,
    }),
}));
vi.mock('../../hooks/useProjectRoute', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useOptionalProjectRoute: () => null,
    useProjectUrlIdentifier: () => 'project-uuid',
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: { uuid: 'dashboard-uuid', slug: 'dashboard' },
            projectUuid: 'project-uuid',
            hasTileComments: () => false,
            dashboardCommentsCheck: undefined,
            dashboardFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            dashboardTemporaryFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            dashboardTiles: [],
            dashboardTabs: [],
            dashboardCustomMetrics: [],
            parameterDefinitions: {},
            parameterValues: {},
            tilesWithDateZoomApplied: new Set<string>(),
            dateZoomGranularity: undefined,
            dateZoomConfig: undefined,
            chartSort: {},
            addDimensionDashboardFilter: () => {},
            setDashboardTiles: () => {},
            setChartSort: () => {},
            haveTilesChanged: false,
            haveFiltersChanged: false,
        }),
    ),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            markTileScreenshotErrored: () => {},
            markTileScreenshotReady: () => {},
            markEmbedTileComplete: () => {},
            markTileLoaded: () => {},
            addResultsCacheTime: () => {},
            addAvailableCustomGranularities: () => {},
            updateSqlChartTilesMetadata: () => {},
            preAggregateStatuses: {},
            invalidateCache: false,
            isAutoRefresh: false,
            refreshCounter: 0,
        }),
    ),
}));

const compiled = { compiledSql: '', tablesReferences: [] };

const compiledDimension = (
    table: string,
    name: string,
    label: string,
    type: DimensionType,
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label,
    table,
    tableLabel: table,
    sql: '',
    hidden: false,
    ...compiled,
});

const compiledMetric = (
    table: string,
    name: string,
    label: string,
): CompiledMetric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label,
    table,
    tableLabel: table,
    sql: '',
    hidden: false,
    ...compiled,
});

const ordersExplore: ApiExploreResults = {
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            lineageGraph: {},
            dimensions: {
                order_date_month: compiledDimension(
                    'orders',
                    'order_date_month',
                    'Order date month',
                    DimensionType.DATE,
                ),
                status: compiledDimension(
                    'orders',
                    'status',
                    'Status',
                    DimensionType.STRING,
                ),
            },
            metrics: {
                total_order_amount: compiledMetric(
                    'orders',
                    'total_order_amount',
                    'Total order amount',
                ),
            },
        },
    },
};

const JOIN_KEY = 'merge_order_date_month';
const SOURCE_A_METRIC = 'a_orders_total_order_amount';
const SOURCE_B_METRIC = 'b_payments_unique_payment_count';

const mergedFields: ItemsMap = {
    [JOIN_KEY]: compiledDimension(
        MERGE_TABLE_NAME,
        'order_date_month',
        'Order date month',
        DimensionType.DATE,
    ),
    [SOURCE_A_METRIC]: compiledMetric(
        'a',
        'orders_total_order_amount',
        'Total order amount',
    ),
    [SOURCE_B_METRIC]: compiledMetric(
        'b',
        'payments_unique_payment_count',
        'Unique payment count',
    ),
};

const mergedMetricQuery: MetricQuery = {
    exploreName: MERGE_TABLE_NAME,
    dimensions: [JOIN_KEY],
    metrics: [SOURCE_A_METRIC, SOURCE_B_METRIC],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const primaryMetricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const statusFilter = (tableName: string): DashboardFilterRule => ({
    id: 'status-filter',
    label: 'Status',
    target: { fieldId: `${tableName}_status`, tableName },
    operator: FilterOperator.EQUALS,
    values: ['completed'],
});

const chart: SavedChart = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    name: 'Orders and payments by month',
    tableName: 'orders',
    metricQuery: primaryMetricQuery,
    merge: {
        primarySourceId: 'a',
        sources: [
            { id: 'a', kind: 'chart' },
            {
                id: 'b',
                kind: 'query',
                metricQuery: {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_date_month'],
                    metrics: ['payments_unique_payment_count'],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                },
            },
        ],
        joinKey: [
            {
                name: 'order_date_month',
                fieldIdBySourceId: {
                    a: 'orders_order_date_month',
                    b: 'payments_payment_date_month',
                },
            },
        ],
        joinType: MergeJoinType.FULL,
        tableCalculations: [],
    },
    chartConfig: { type: ChartType.TABLE, config: undefined },
    // Saved before the merge: still names the primary source's own field ids.
    tableConfig: {
        columnOrder: ['orders_order_date_month', 'orders_total_order_amount'],
    },
    updatedAt: new Date('2026-01-01'),
    spaceUuid: 'space-uuid',
    spaceName: 'Space',
    pinnedListUuid: null,
    pinnedListOrder: null,
    dashboardUuid: null,
    dashboardName: null,
    colorPalette: [],
    colorPaletteUuid: null,
    resolvedColorPalette: {
        source: { type: 'default' },
        paletteUuid: null,
        paletteName: null,
        colors: [],
        darkColors: null,
    },
    inheritsFromOrgOrProject: true,
    access: [],
    slug: 'orders-and-payments-by-month',
    verification: null,
};

const tile: DashboardChartTileType = {
    uuid: 'tile-uuid',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 4,
    w: 6,
    tabUuid: undefined,
    properties: { savedChartUuid: chart.uuid, title: chart.name },
};

const dashboardChartReadyQuery: DashboardChartReadyQuery = {
    chart,
    explore: ordersExplore,
    dateZoom: undefined,
    executeQueryResponse: {
        queryUuid: 'query-uuid',
        cacheMetadata: { cacheHit: false },
        parameterReferences: [],
        usedParametersValues: {},
        resolvedTimezone: 'UTC',
        metricQuery: mergedMetricQuery,
        fields: mergedFields,
        appliedDashboardFilters: {
            dimensions: [statusFilter('orders'), statusFilter('payments')],
            metrics: [],
            tableCalculations: [],
        },
        appliedDashboardFiltersBySourceId: {
            a: {
                dimensions: [statusFilter('orders')],
                metrics: [],
                tableCalculations: [],
            },
            b: {
                dimensions: [statusFilter('payments')],
                metrics: [],
                tableCalculations: [],
            },
        },
        dateZoomApplied: false,
    },
};

const resultsData: InfiniteQueryResults = {
    queryUuid: 'query-uuid',
    queryStatus: QueryHistoryStatus.READY,
    rows: [
        {
            [JOIN_KEY]: { value: { raw: '2026-01-01', formatted: '2026-01' } },
            [SOURCE_A_METRIC]: { value: { raw: 100, formatted: '100' } },
            [SOURCE_B_METRIC]: { value: { raw: 3, formatted: '3' } },
        },
    ],
    totalResults: 1,
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: () => {},
    refetchRows: async () => {},
    setFetchAll: () => {},
    fetchAll: false,
    hasFetchedAllRows: true,
    totalClientFetchTimeMs: undefined,
    error: null,
};

const renderTile = () =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={[
                '/projects/project-uuid/dashboards/dashboard-uuid/view',
            ]}
        >
            <Routes>
                <Route
                    path="/projects/:projectUuid/dashboards/:dashboardUuid/view"
                    element={
                        <ChartColorMappingContextProvider>
                            <GenericDashboardChartTile
                                tile={tile}
                                isEditMode={false}
                                isLoading={false}
                                error={null}
                                dashboardChartReadyQuery={
                                    dashboardChartReadyQuery
                                }
                                resultsData={resultsData}
                                onDelete={() => {}}
                                onEdit={() => {}}
                            />
                        </ChartColorMappingContextProvider>
                    }
                />
            </Routes>
        </MemoryRouter>,
    );

describe('DashboardChartTile with a merged chart', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders the merged result columns under a dashboard filter', async () => {
        const { container, unmount } = renderTile();

        await waitFor(() => {
            expect(
                container.querySelectorAll('thead th').length,
            ).toBeGreaterThan(0);
        });
        // The row-number column comes first; the rest must be the merged result.
        const headers = Array.from(container.querySelectorAll('thead th'))
            .slice(1)
            .map((th) => th.textContent?.trim());
        expect(headers).toEqual([
            expect.stringContaining('Order date month'),
            expect.stringContaining('Total order amount'),
            expect.stringContaining('Unique payment count'),
        ]);

        // Unmount here and drain queued query notifications while the window
        // still exists, so none fire after the environment is torn down.
        unmount();
        await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    });
});
