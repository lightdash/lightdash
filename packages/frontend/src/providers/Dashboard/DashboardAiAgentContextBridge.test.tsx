import {
    ChartType,
    DashboardTileTypes,
    type Dashboard,
    type SavedChart,
} from '@lightdash/common';
import { configureStore } from '@reduxjs/toolkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type PropsWithChildren } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { aiAgentLauncherSlice } from '../../ee/features/aiCopilot/store/aiAgentLauncherSlice';
import {
    aiAgentThreadStreamSlice,
    setParts,
    startStreaming,
    stopStreaming,
    type StreamPart,
} from '../../ee/features/aiCopilot/store/aiAgentThreadStreamSlice';
import { resetHandledAgentToolCallIds } from '../../ee/features/aiCopilot/streaming/handledAgentToolCalls';
import { useDashboardChartReadyQuery } from '../../hooks/dashboard/useDashboardChartReadyQuery';
import { mockSavedChartResponse } from '../../testing/savedChartResponse.mock';
import AppProvider from '../App/AppProvider';
import DashboardAiAgentContextBridge from './DashboardAiAgentContextBridge';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));

const projectUuid = '9a0b7a3c-0000-4000-8000-000000000001';
const chart = mockSavedChartResponse({
    uuid: 'chart-uuid',
    projectUuid,
    slug: 'orders',
    name: 'Orders',
    tableName: 'orders',
    updatedAt: new Date('2026-10-01'),
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    tableConfig: { columnOrder: [] },
});

const dashboard: Dashboard = {
    uuid: 'dashboard-uuid',
    projectUuid,
    slug: 'orders-dashboard',
    name: 'Orders dashboard',
    organizationUuid: chart.organizationUuid,
    dashboardVersionId: 1,
    versionUuid: 'dashboard-version',
    verification: null,
    updatedAt: new Date('2026-10-01'),
    spaceUuid: 'space',
    spaceName: 'Space',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    inheritsFromOrgOrProject: false,
    access: [],
    colorPaletteUuid: null,
    owner: null,
    tabs: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tiles: [
        {
            uuid: 'tile-uuid',
            tabUuid: null,
            type: DashboardTileTypes.SAVED_CHART,
            x: 0,
            y: 0,
            w: 12,
            h: 6,
            properties: {
                savedChartUuid: chart.uuid,
                chartSlug: chart.slug,
            },
        },
    ],
};

const editChartPart = {
    type: 'toolCall',
    toolCallId: 'edit-chart',
    toolName: 'editContent',
    isPreliminary: false,
    toolArgs: { type: 'chart', slug: chart.slug, patch: [] },
    toolResult: {
        result: '{}',
        metadata: {
            status: 'success',
            uuid: chart.uuid,
            slug: chart.slug,
            name: chart.name,
            href: `/projects/${projectUuid}/saved/${chart.slug}`,
            warnings: [],
            versionUuids: { before: null, after: null },
        },
        structuredContent: {
            type: 'chart',
            href: `/projects/${projectUuid}/saved/${chart.slug}`,
            content: {},
            warnings: [],
        },
    },
} as StreamPart;

const editDashboardPart = {
    type: 'toolCall',
    toolCallId: 'edit-dashboard',
    toolName: 'editContent',
    isPreliminary: false,
    toolArgs: {
        type: 'dashboard',
        slug: dashboard.slug,
        patch: [],
    },
    toolResult: {
        result: '{}',
        structuredContent: {
            type: 'dashboard',
            href: `/projects/${projectUuid}/dashboards/${dashboard.slug}`,
            content: {},
            warnings: [],
        },
        metadata: {
            name: dashboard.name,
            href: `/projects/${projectUuid}/dashboards/${dashboard.slug}`,
            warnings: [],
            versionUuids: {
                before: null,
                after: null,
            },
            status: 'success',
            uuid: dashboard.uuid,
            slug: dashboard.slug,
        },
    },
} as StreamPart;

let savedChart = chart;
let savedDashboard = dashboard;
let publishedChart = chart;
let publishedDashboard = dashboard;

beforeEach(() => {
    resetHandledAgentToolCallIds();
    savedChart = chart;
    savedDashboard = dashboard;
    publishedChart = chart;
    publishedDashboard = dashboard;
    vi.mocked(lightdashApi).mockImplementation((async ({ url, body }) => {
        if (url.startsWith(`/projects/${projectUuid}/dashboards/`)) {
            return url.endsWith('?includeUnpublishedDraft=true')
                ? savedDashboard
                : publishedDashboard;
        }
        if (url.startsWith(`/projects/${projectUuid}/saved/`)) {
            return url.endsWith('?includeUnpublishedDraft=true')
                ? savedChart
                : publishedChart;
        }
        if (url === `/projects/${projectUuid}/explores/orders`) {
            return { name: 'orders', tables: {}, baseTable: 'orders' };
        }
        if (url === `/projects/${projectUuid}/query/dashboard-chart`) {
            const queriedChart =
                typeof body === 'string' &&
                body.includes('\"includeUnpublishedDraft\":true')
                    ? savedChart
                    : publishedChart;
            return { queryUuid: `results-${queriedChart.chartConfig.type}` };
        }
        return new Promise(() => {});
    }) as typeof lightdashApi);
});

const createAgentStore = () => {
    const store = configureStore({
        reducer: {
            aiAgentLauncher: aiAgentLauncherSlice.reducer,
            aiAgentThreadStream: aiAgentThreadStreamSlice.reducer,
        },
    });
    store.dispatch(
        startStreaming({
            threadUuid: 'thread',
            messageUuid: 'message',
            projectUuid,
            agentUuid: 'agent',
            autoApproveSql: false,
        }),
    );
    return store;
};

const renderDashboard = (
    identifier = dashboard.slug,
    includeUnpublishedDraft = true,
    agentStore = createAgentStore(),
) => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>
            <AppProvider>
                <Provider store={agentStore}>
                    <MemoryRouter
                        initialEntries={[
                            `/projects/${projectUuid}/dashboards/${identifier}`,
                        ]}
                    >
                        <Routes>
                            <Route
                                path="/projects/:projectUuid/dashboards/:dashboardUuid"
                                element={
                                    <DashboardProvider
                                        projectUuid={projectUuid}
                                        includeUnpublishedDraft={
                                            includeUnpublishedDraft
                                        }
                                    >
                                        <DashboardAiAgentContextBridge />
                                        {children}
                                    </DashboardProvider>
                                }
                            />
                        </Routes>
                    </MemoryRouter>
                </Provider>
            </AppProvider>
        </QueryClientProvider>
    );
    return {
        agentStore,
        client,
        ...renderHook(
            () => {
                const currentDashboard = useDashboardContext(
                    (c) => c.dashboard,
                );
                const setDashboardTiles = useDashboardContext(
                    (c) => c.setDashboardTiles,
                );
                useEffect(() => {
                    if (currentDashboard)
                        setDashboardTiles(currentDashboard.tiles);
                }, [currentDashboard, setDashboardTiles]);
                return {
                    ...useDashboardChartReadyQuery('tile-uuid', chart.uuid),
                    dashboard: currentDashboard,
                };
            },
            { wrapper },
        ),
    };
};

describe('agent dashboard chart refresh', () => {
    it.each(['chart', 'dashboard'] as const)(
        'does not reuse an in-flight pre-edit %s response',
        async (type) => {
            const { result, agentStore, client } = renderDashboard();
            await waitFor(() => expect(result.current.data).toBeDefined());
            let resolveOld: (value: SavedChart | Dashboard) => void = () => {};
            const oldResponse = new Promise<SavedChart | Dashboard>(
                (resolve) => {
                    resolveOld = resolve;
                },
            );
            vi.mocked(lightdashApi).mockImplementationOnce(
                (() => oldResponse) as typeof lightdashApi,
            );
            const queryKey =
                type === 'chart'
                    ? ['saved_query', chart.uuid, projectUuid, true]
                    : [
                          'saved_dashboard_query',
                          dashboard.slug,
                          projectUuid,
                          true,
                      ];
            let previousFetch: Promise<void> = Promise.resolve();
            act(() => {
                previousFetch = client.refetchQueries({
                    queryKey,
                    exact: true,
                });
            });
            await waitFor(() =>
                expect(client.isFetching({ queryKey, exact: true })).toBe(1),
            );
            savedChart = {
                ...chart,
                chartConfig: { type: ChartType.BIG_NUMBER, config: {} },
            };
            savedDashboard = { ...dashboard, name: 'Edited dashboard' };
            act(() => {
                agentStore.dispatch(
                    setParts({
                        threadUuid: 'thread',
                        parts: [
                            type === 'chart'
                                ? editChartPart
                                : editDashboardPart,
                        ],
                    }),
                );
            });
            await waitFor(() => {
                if (type === 'chart')
                    expect(result.current.data?.chart.chartConfig.type).toBe(
                        ChartType.BIG_NUMBER,
                    );
                else
                    expect(result.current.dashboard?.name).toBe(
                        'Edited dashboard',
                    );
            });
            await act(async () => {
                resolveOld(type === 'chart' ? chart : dashboard);
                await previousFetch;
            });
            if (type === 'chart')
                expect(result.current.data?.chart.chartConfig.type).toBe(
                    ChartType.BIG_NUMBER,
                );
            else
                expect(result.current.dashboard?.name).toBe('Edited dashboard');
        },
    );

    it.each([
        { identifier: dashboard.slug, includeUnpublishedDraft: true },
        { identifier: dashboard.uuid, includeUnpublishedDraft: false },
    ])(
        'refreshes the observed dashboard at $identifier (drafts: $includeUnpublishedDraft) after an agent edit',
        async ({ identifier, includeUnpublishedDraft }) => {
            const { result, agentStore } = renderDashboard(
                identifier,
                includeUnpublishedDraft,
            );
            await waitFor(() =>
                expect(result.current.dashboard?.name).toBe('Orders dashboard'),
            );
            savedDashboard = {
                ...dashboard,
                name: 'Edited dashboard',
                tiles: [],
            };
            if (!includeUnpublishedDraft) publishedDashboard = savedDashboard;
            act(() => {
                agentStore.dispatch(
                    setParts({
                        threadUuid: 'thread',
                        parts: [editDashboardPart],
                    }),
                );
            });
            await waitFor(() =>
                expect(result.current.dashboard?.name).toBe('Edited dashboard'),
            );
        },
    );

    it.each([
        { complete: false, includeUnpublishedDraft: true },
        { complete: true, includeUnpublishedDraft: true },
        { complete: true, includeUnpublishedDraft: false },
    ])(
        'shows the edited visualization and results (drafts: $includeUnpublishedDraft, batched completion: $complete)',
        async ({ complete, includeUnpublishedDraft }) => {
            const { result, agentStore, client } = renderDashboard(
                dashboard.slug,
                includeUnpublishedDraft,
            );
            client.setQueryData(
                [
                    'saved_query',
                    chart.uuid,
                    projectUuid,
                    !includeUnpublishedDraft,
                ],
                chart,
            );
            await waitFor(() => expect(result.current.data).toBeDefined());
            expect(result.current.data?.chart.chartConfig.type).toBe(
                ChartType.CARTESIAN,
            );

            savedChart = {
                ...chart,
                chartConfig: { type: ChartType.BIG_NUMBER, config: {} },
            };
            if (!includeUnpublishedDraft) publishedChart = savedChart;
            act(() => {
                agentStore.dispatch(
                    setParts({ threadUuid: 'thread', parts: [editChartPart] }),
                );
                if (complete)
                    agentStore.dispatch(
                        stopStreaming({ threadUuid: 'thread' }),
                    );
            });

            await waitFor(() =>
                expect(result.current.data?.chart.chartConfig.type).toBe(
                    ChartType.BIG_NUMBER,
                ),
            );
            expect(result.current.data?.executeQueryResponse.queryUuid).toBe(
                'results-big_number',
            );
            expect(
                client.getQueryData([
                    'saved_query',
                    chart.slug,
                    projectUuid,
                    includeUnpublishedDraft,
                ]),
            ).toMatchObject({ chartConfig: { type: ChartType.BIG_NUMBER } });
            expect(
                client.getQueryData([
                    'saved_query',
                    chart.uuid,
                    projectUuid,
                    !includeUnpublishedDraft,
                ]),
            ).toMatchObject({ chartConfig: { type: ChartType.CARTESIAN } });
        },
    );

    describe('across remounts', () => {
        const dashboardFetchCount = () =>
            vi
                .mocked(lightdashApi)
                .mock.calls.filter(([{ url }]) =>
                    url.startsWith(`/projects/${projectUuid}/dashboards/`),
                ).length;

        const completeDashboardEdit = (
            agentStore: ReturnType<typeof createAgentStore>,
        ) => {
            agentStore.dispatch(
                setParts({ threadUuid: 'thread', parts: [editDashboardPart] }),
            );
            agentStore.dispatch(stopStreaming({ threadUuid: 'thread' }));
        };

        it('does not replay a handled edit after remounting', async () => {
            const agentStore = createAgentStore();
            const first = renderDashboard(dashboard.slug, true, agentStore);
            await waitFor(() =>
                expect(first.result.current.dashboard).toBeDefined(),
            );
            savedDashboard = { ...dashboard, name: 'Edited dashboard' };
            act(() => completeDashboardEdit(agentStore));
            await waitFor(() =>
                expect(first.result.current.dashboard?.name).toBe(
                    'Edited dashboard',
                ),
            );
            first.unmount();
            vi.mocked(lightdashApi).mockClear();

            const second = renderDashboard(dashboard.slug, true, agentStore);
            await waitFor(() =>
                expect(second.result.current.data).toBeDefined(),
            );
            expect(dashboardFetchCount()).toBe(1);
        });

        it('applies an edit that completed before mount once', async () => {
            const agentStore = createAgentStore();
            completeDashboardEdit(agentStore);
            vi.mocked(lightdashApi).mockClear();

            const first = renderDashboard(dashboard.slug, true, agentStore);
            await waitFor(() => expect(dashboardFetchCount()).toBe(2));
            await waitFor(() =>
                expect(first.result.current.data).toBeDefined(),
            );
            first.unmount();
            vi.mocked(lightdashApi).mockClear();

            const second = renderDashboard(dashboard.slug, true, agentStore);
            await waitFor(() =>
                expect(second.result.current.data).toBeDefined(),
            );
            expect(dashboardFetchCount()).toBe(1);
        });
    });

    it('does not rerun tile results when only chart metadata is refetched', async () => {
        const { result, client } = renderDashboard();
        client.setQueryDefaults(['dashboard_chart_ready_query'], {
            staleTime: 0,
        });
        await waitFor(() => expect(result.current.data).toBeDefined());
        vi.mocked(lightdashApi).mockClear();

        let resolveRenamed: (value: SavedChart) => void = () => {};
        vi.mocked(lightdashApi).mockImplementationOnce(
            (() =>
                new Promise<SavedChart>((resolve) => {
                    resolveRenamed = resolve;
                })) as typeof lightdashApi,
        );
        const queryKey = ['saved_query', chart.uuid, projectUuid, true];
        let refetch: Promise<void> = Promise.resolve();
        act(() => {
            refetch = client.refetchQueries({ queryKey, exact: true });
        });
        await waitFor(() =>
            expect(client.isFetching({ queryKey, exact: true })).toBe(1),
        );
        await act(async () => {
            resolveRenamed({ ...chart, name: 'Renamed orders' });
            await refetch;
        });
        // Let the observer notify and the tile re-render.
        await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(
                    ([{ url }]) =>
                        url ===
                        `/projects/${projectUuid}/query/dashboard-chart`,
                ),
        ).toBe(false);
    });
});
