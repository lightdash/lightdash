import {
    ChartType,
    DashboardTileTypes,
    PersonSignInProvider,
    SupportedDbtAdapter,
    WarehouseTypes,
    type Dashboard,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useEffect, type PropsWithChildren } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { type LightdashApi } from '../../api';
import {
    WarehouseSignInPreflight,
    WarehouseSignInPreflightContext,
} from '../../components/NavBar/warehouseSignInPreflight';
import AppProvider from '../../providers/App/AppProvider';
import DashboardProvider from '../../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { mockSavedChartResponse } from '../../testing/savedChartResponse.mock';
import { useDashboardChartReadyQuery } from './useDashboardChartReadyQuery';

vi.mock('../../api');
const projectUuid = crypto.randomUUID();
const charts = ['a', 'b'].map((name) =>
    mockSavedChartResponse({
        uuid: `chart_${name}`,
        projectUuid,
        slug: `orders_${name}`,
        name: `Orders ${name}`,
        tableName: `orders_${name}`,
        chartConfig: { type: ChartType.TABLE },
        metricQuery: {
            exploreName: `orders_${name}`,
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 10,
            tableCalculations: [],
        },
        tableConfig: { columnOrder: [] },
    }),
);
const dashboard = {
    uuid: 'dashboard_a',
    projectUuid,
    slug: 'dashboard_a',
    name: 'Dashboard',
    organizationUuid: charts[0].organizationUuid,
    dashboardVersionId: 1,
    versionUuid: 'version_a',
    verification: null,
    updatedAt: new Date(),
    spaceUuid: 'space_a',
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
    tiles: charts.map((chart, index) => ({
        uuid: `tile_${index}`,
        tabUuid: null,
        type: DashboardTileTypes.SAVED_CHART,
        x: index * 6,
        y: 0,
        w: 6,
        h: 6,
        properties: { savedChartUuid: chart.uuid, chartSlug: chart.slug },
    })),
} as Dashboard;

test('mounted mixed-connection metric tiles discover their own bindings before warehouse execution and keep one expired target', async () => {
    vi.clearAllMocks();
    const metadata = [
        Promise.withResolvers<unknown>(),
        Promise.withResolvers<unknown>(),
    ];
    mockedLightdashApi.mockImplementation((async ({ url }) => {
        if (url.startsWith(`/projects/${projectUuid}/dashboards/`))
            return dashboard;
        const chartIndex = charts.findIndex((chart) =>
            url.startsWith(`/projects/${projectUuid}/saved/${chart.uuid}`),
        );
        if (chartIndex >= 0) return charts[chartIndex];
        const exploreIndex = charts.findIndex(
            (chart) =>
                url ===
                `/projects/${projectUuid}/explores/${chart.metricQuery.exploreName}`,
        );
        if (exploreIndex >= 0) return metadata[exploreIndex].promise;
        if (url === `/projects/${projectUuid}/query/dashboard-chart`)
            return { queryUuid: 'query_a' };
        return new Promise(() => {});
    }) as LightdashApi);
    const preflight = new WarehouseSignInPreflight(
        { projectUuid, userUuid: 'user_a', pageGeneration: 'page_a' },
        true,
        false,
    );
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>
            <AppProvider>
                <MemoryRouter
                    initialEntries={[
                        `/projects/${projectUuid}/dashboards/dashboard_a`,
                    ]}
                >
                    <Routes>
                        <Route
                            path="/projects/:projectUuid/dashboards/:dashboardUuid"
                            element={
                                <WarehouseSignInPreflightContext.Provider
                                    value={preflight}
                                >
                                    <DashboardProvider
                                        projectUuid={projectUuid}
                                    >
                                        {children}
                                    </DashboardProvider>
                                </WarehouseSignInPreflightContext.Provider>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            </AppProvider>
        </QueryClientProvider>
    );
    renderHook(
        () => {
            const current = useDashboardContext((context) => context.dashboard);
            const setTiles = useDashboardContext(
                (context) => context.setDashboardTiles,
            );
            useEffect(() => {
                if (current) setTiles(current.tiles);
            }, [current, setTiles]);
            useDashboardChartReadyQuery('tile_0', charts[0].uuid);
            useDashboardChartReadyQuery('tile_1', charts[1].uuid);
        },
        { wrapper },
    );
    const warehouseCalls = () =>
        mockedLightdashApi.mock.calls.filter(
            ([request]) =>
                request.url ===
                `/projects/${projectUuid}/query/dashboard-chart`,
        );
    await waitFor(() =>
        expect(mockedLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: `/projects/${projectUuid}/explores/orders_b`,
            }),
        ),
    );
    expect(preflight.checks.size).toBe(0);
    expect(warehouseCalls()).toHaveLength(0);
    await act(async () => {
        metadata.forEach((pending, index) =>
            pending.resolve({
                name: `orders_${index === 0 ? 'a' : 'b'}`,
                label: 'Orders',
                baseTable: 'orders',
                joinedTables: [],
                tables: {},
                targetDatabase: SupportedDbtAdapter.BIGQUERY,
                warehouseConnectionUuid: `stored_${index}`,
                warehouseConnection: {
                    warehouseConnectionUuid:
                        index === 0 ? null : 'connection_extra',
                    warehouseType: WarehouseTypes.BIGQUERY,
                    startOfWeek: null,
                },
            }),
        );
    });
    await waitFor(() => expect(preflight.checks.size).toBe(2));
    expect(preflight.checks.has('original')).toBe(true);
    expect(preflight.checks.has('connection_extra')).toBe(true);
    expect(warehouseCalls()).toHaveLength(0);
    act(() => {
        preflight.settle(
            'connection_extra',
            preflight.checks.get('connection_extra')!.generation,
            {
                personalSelection: {
                    warehouseConnectionUuid: 'connection_extra',
                },
                provider: PersonSignInProvider.GOOGLE,
                subject: null,
                subjectBasis: null,
                expired: false,
                canReconnect: false,
                personalSignIn: {
                    projectUuid,
                    provider: PersonSignInProvider.GOOGLE,
                    userWarehouseCredentialsUuid: 'credential_extra',
                    expired: true,
                    canReconnect: true,
                },
            },
        );
        preflight.settle(
            null,
            preflight.checks.get('original')!.generation,
            null,
        );
    });
    await waitFor(() => expect(warehouseCalls()).toHaveLength(1));
    const target = preflight.target!;
    expect(target.binding).toBe('connection_extra');
    const body = warehouseCalls()[0][0].body;
    expect(typeof body === 'string' && body.includes(charts[0].uuid)).toBe(
        true,
    );
    expect(preflight.modalOpen).toBe(true);
    act(() => preflight.dismiss(target));
    await waitFor(() => expect(warehouseCalls()).toHaveLength(2));
    expect(preflight.target).toBe(target);
    expect(preflight.modalOpen).toBe(false);
    client.clear();
});
