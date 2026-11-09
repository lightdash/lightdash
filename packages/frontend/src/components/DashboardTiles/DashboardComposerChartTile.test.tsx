import {
    ChartType,
    DashboardTileTypes,
    DimensionType,
    QueryHistoryStatus,
    QuerySourceType,
    type ApiExecuteAsyncComposerChartQueryResults,
    type ChartConfig,
    type ComposerSavedChart,
    type DashboardChartTile as DashboardChartTileType,
} from '@lightdash/common';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartColorMappingContextProvider from '../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import { type InfiniteQueryResults } from '../../hooks/useQueryResults';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { renderWithProviders } from '../../testing/testUtils';
import DashboardChartTile from './DashboardChartTile';

const mocks = vi.hoisted(() => ({
    flagEnabled: true as boolean | undefined,
    isEmbedded: false,
    resultsByQueryUuid: {} as Record<string, InfiniteQueryResults>,
    requestedResultQueryUuids: [] as (string | undefined)[],
}));

vi.mock('../../api');
vi.mock('@shopify/react-web-worker', () => ({
    createWorkerFactory: () => () => ({}),
    useWorker: () => ({}),
}));
vi.mock('../../providers/Ability/useAbilityContext', () => ({
    useAbilityContext: () => ({ can: () => true }),
}));
vi.mock('../../hooks/useServerOrClientFeatureFlag', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useServerFeatureFlag: () => ({
        data:
            mocks.flagEnabled === undefined
                ? undefined
                : { enabled: mocks.flagEnabled },
        isLoading: false,
    }),
}));
vi.mock('../../ee/providers/Embed/useIsEmbedded', () => ({
    default: () => mocks.isEmbedded,
}));
vi.mock('../../hooks/useProjectRoute', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useOptionalProjectRoute: () => null,
    useProjectUrlIdentifier: () => 'project-uuid',
}));
vi.mock('../../hooks/useQueryResults', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useInfiniteQueryResults: (_projectUuid?: string, queryUuid?: string) => {
        mocks.requestedResultQueryUuids.push(queryUuid);
        return (
            (queryUuid && mocks.resultsByQueryUuid[queryUuid]) ?? pendingResults
        );
    },
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: { uuid: 'dashboard-uuid', slug: 'dashboard' },
            projectUuid: 'project-uuid',
            includeUnpublishedDraft: false,
            hasTileComments: () => false,
            dashboardCommentsCheck: undefined,
            dashboardTiles: [],
            dashboardTabs: [],
            dashboardCustomMetrics: [],
            tilesWithDateZoomApplied: new Set<string>(),
            addParameterReferences: () => {},
            addDimensionDashboardFilter: () => {},
            setDashboardTiles: () => {},
            setTileChartSorts: () => {},
            haveTilesChanged: false,
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
            registerTileQuery: () => {},
            unregisterTileQuery: () => {},
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

const resultsBase = {
    queryStatus: QueryHistoryStatus.READY,
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    fetchMoreRows: () => {},
    refetchRows: async () => {},
    setFetchAll: () => {},
    fetchAll: true,
    hasFetchedAllRows: true,
    totalClientFetchTimeMs: undefined,
    error: null,
};
const pendingResults: InfiniteQueryResults = {
    ...resultsBase,
    rows: [],
    isInitialLoading: true,
    isFetchingFirstPage: true,
    hasFetchedAllRows: false,
};
const terminalResults: InfiniteQueryResults = {
    ...resultsBase,
    queryUuid: 'terminal-query',
    columns: {
        status: {
            reference: 'status',
            type: DimensionType.STRING,
            label: 'Order status',
        },
        revenue: { reference: 'revenue', type: DimensionType.NUMBER },
    },
    rows: [
        {
            status: { value: { raw: 'completed', formatted: 'completed' } },
            revenue: { value: { raw: 100, formatted: '100' } },
        },
    ],
    totalResults: 1,
};

const tableConfig: ChartConfig = { type: ChartType.TABLE, config: undefined };
const barConfig: ChartConfig = {
    type: ChartType.CARTESIAN,
    config: {
        layout: {
            xField: 'composer_result_status',
            yField: ['composer_result_revenue'],
        },
        eChartsConfig: { series: [] },
    },
};

const composerChart: ComposerSavedChart = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    name: 'Revenue by status',
    description: 'Composer revenue',
    slug: 'revenue-by-status',
    pipeline: {
        schemaVersion: 1,
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_revenue'],
            },
        ],
        terminalNodeId: 'orders',
    },
    chartConfig: tableConfig,
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
    verification: null,
};

const composerRun = (
    chartConfig: ChartConfig,
    chartStage: ApiExecuteAsyncComposerChartQueryResults['chartStage'] = null,
): ApiExecuteAsyncComposerChartQueryResults => ({
    queryUuid: 'terminal-query',
    cacheMetadata: { cacheHit: false },
    parameterReferences: [],
    usedParametersValues: {},
    resolvedTimezone: 'UTC',
    queryType: 'composer',
    terminalNodeId: 'orders',
    nodes: [
        {
            nodeId: 'orders',
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            queryUuid: 'terminal-query',
            cacheHit: false,
        },
    ],
    chartStage,
    chartVisualization: {
        chartConfig,
        pivotConfig: chartStage
            ? { columns: ['composer_result_status'] }
            : undefined,
    },
});

const tile: DashboardChartTileType = {
    uuid: 'tile-uuid',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    h: 4,
    w: 6,
    tabUuid: undefined,
    properties: {
        savedChartUuid: composerChart.uuid,
        chartName: composerChart.name,
        queryType: 'composer',
    },
};

type ApiCall = { url: string; method: string; body?: string };
const apiCalls = (): ApiCall[] =>
    mockedLightdashApi.mock.calls.map(([call]) => call as ApiCall);
const runRequests = () =>
    apiCalls().filter(
        (call) =>
            call.method === 'POST' && call.url.endsWith('/dashboard-chart'),
    );

const answerApi = (
    run: () => Promise<ApiExecuteAsyncComposerChartQueryResults>,
) =>
    mockedLightdashApi.mockImplementation(({ url, method }: ApiCall) => {
        if (method === 'POST' && url.endsWith('/dashboard-chart')) {
            return run();
        }
        if (method === 'GET' && url.endsWith('/saved/chart-uuid')) {
            return Promise.resolve(composerChart);
        }
        return new Promise(() => {});
    });

const renderTile = (isEditMode = false) =>
    renderWithProviders(
        <DashboardStoreTestProvider store={createDashboardTestStore({})}>
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
                                <DashboardChartTile
                                    tile={tile}
                                    isEditMode={isEditMode}
                                    onDelete={() => {}}
                                    onEdit={() => {}}
                                />
                            </ChartColorMappingContextProvider>
                        }
                    />
                </Routes>
            </MemoryRouter>
        </DashboardStoreTestProvider>,
        { user: { abilityRules: [{ action: 'manage', subject: 'all' }] } },
    );

describe('DashboardChartTile with a composer chart', () => {
    beforeEach(() => {
        mocks.flagEnabled = true;
        mocks.isEmbedded = false;
        mocks.resultsByQueryUuid = { 'terminal-query': terminalResults };
        mocks.requestedResultQueryUuids = [];
        mockedLightdashApi.mockReset();
        answerApi(() => Promise.resolve(composerRun(tableConfig)));
    });
    afterEach(() => {
        cleanup();
    });

    it('runs the chart as a composer chart and draws the live columns', async () => {
        const { container } = renderTile();

        await waitFor(() => {
            expect(
                container.querySelectorAll('thead th').length,
            ).toBeGreaterThan(0);
        });
        const headers = Array.from(container.querySelectorAll('thead th'))
            .slice(1)
            .map((th) => th.textContent?.trim());
        expect(headers).toEqual([
            expect.stringContaining('Order status'),
            expect.stringContaining('Revenue'),
        ]);

        const [request] = runRequests();
        expect(JSON.parse(request.body ?? '{}')).toMatchObject({
            chartUuid: 'chart-uuid',
            dashboardUuid: 'dashboard-uuid',
            tileUuid: 'tile-uuid',
        });
        expect(request.body).not.toContain('dateZoom');
        // No explore is ever read for a composer tile.
        expect(apiCalls().some((call) => call.url.includes('/explores/'))).toBe(
            false,
        );
    });

    it('keeps only the actions a composer chart supports', async () => {
        const { container } = renderTile();
        await waitFor(() => {
            expect(
                container.querySelectorAll('thead th').length,
            ).toBeGreaterThan(0);
        });

        fireEvent.click(
            await screen.findByRole('button', { name: 'Tile actions' }),
        );

        expect(
            await screen.findByRole('menuitem', { name: /Download data/ }),
        ).toBeInTheDocument();
        for (const hidden of [
            /Edit chart/,
            /Explore from here/,
            /View underlying data/,
            /Move to space/,
            /Duplicate/,
            /Filter dashboard/,
        ]) {
            expect(
                screen.queryByRole('menuitem', { name: hidden }),
            ).not.toBeInTheDocument();
        }
    });

    it('draws the series split from the stage result', async () => {
        const stageResults: InfiniteQueryResults = {
            ...resultsBase,
            queryUuid: 'stage-query',
            rows: [],
            totalResults: 0,
            setFetchAll: vi.fn(),
            fetchAll: false,
            hasFetchedAllRows: false,
        };
        mocks.resultsByQueryUuid['stage-query'] = stageResults;
        answerApi(() =>
            Promise.resolve(
                composerRun(barConfig, {
                    queryUuid: 'stage-query',
                    cacheHit: false,
                }),
            ),
        );

        renderTile();

        await waitFor(() => {
            expect(mocks.requestedResultQueryUuids).toContain('stage-query');
        });
        await waitFor(() => {
            expect(stageResults.setFetchAll).toHaveBeenCalledWith(true);
        });
    });

    it('shows the run error instead of an empty chart', async () => {
        answerApi(() =>
            Promise.reject({
                status: 'error',
                error: {
                    statusCode: 500,
                    name: 'UnexpectedServerError',
                    message: 'The pipeline could not be planned',
                },
            }),
        );

        renderTile();

        expect(
            await screen.findByText('The pipeline could not be planned'),
        ).toBeInTheDocument();
    });

    it('is not available while the composer flag is off', async () => {
        mocks.flagEnabled = false;

        renderTile();

        expect(
            await screen.findByText(
                'This chart type is not enabled for this project.',
            ),
        ).toBeInTheDocument();
        expect(runRequests()).toHaveLength(0);
    });

    it('is not available inside an embed and never runs', async () => {
        mocks.isEmbedded = true;

        renderTile();

        expect(
            await screen.findByText(
                'This chart type is not available in embedded dashboards yet.',
            ),
        ).toBeInTheDocument();
        expect(runRequests()).toHaveLength(0);
    });
});
