import {
    DashboardTileTypes,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { useEffect, useSyncExternalStore, type PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';

vi.mock('../../api');

const { flag } = vi.hoisted(() => ({ flag: { enabled: true } }));
vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

import { sharedLightdashApi, type LightdashApi } from '../../api';
import {
    dashboardEditActions,
    dashboardParametersActions,
    selectTileQuerySourcesKey,
} from '../../features/dashboard/store';
import { LightdashApiContext } from '../../providers/LightdashApi/LightdashApiContext';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { useDashboardTileParameterReferences } from './useDashboardTileParameterReferences';

const mockApi = sharedLightdashApi as unknown as Mock;

const tile = (
    uuid: string,
    tabUuid: string,
    type: DashboardTileTypes.SAVED_CHART | DashboardTileTypes.SQL_CHART,
    savedUuid: string,
) =>
    ({
        uuid,
        tabUuid,
        type,
        x: 0,
        y: 0,
        h: 3,
        w: 3,
        properties:
            type === DashboardTileTypes.SAVED_CHART
                ? { savedChartUuid: savedUuid }
                : { savedSqlUuid: savedUuid, chartName: 'SQL' },
    }) as DashboardTile;

const tiles = [
    tile('tile-open', 'tab-1', DashboardTileTypes.SAVED_CHART, 'chart-1'),
    tile('tile-unopened', 'tab-2', DashboardTileTypes.SAVED_CHART, 'chart-2'),
    tile('tile-sql', 'tab-2', DashboardTileTypes.SQL_CHART, 'sql-1'),
];

const listedTile = (tileUuid: string, parameterReferences: string[]) => ({
    tileUuid,
    parameterReferences,
    parameterDefinitions: {},
    chartSavedValues: {},
    virtualViewSavedValues: {},
    error: null,
});

const listingOf = (body: string, parameterReferences: string[]) =>
    (JSON.parse(body) as { tiles: { tileUuid: string }[] }).tiles.map(
        ({ tileUuid }) => listedTile(tileUuid, parameterReferences),
    );

const dashboardTabs: DashboardTab[] = [
    { uuid: 'tab-1', name: 'One', order: 0 },
    { uuid: 'tab-2', name: 'Two', order: 1 },
];

const setup = (
    embedApi?: LightdashApi,
    dashboardTiles = tiles,
    tabs: DashboardTab[] = [],
    store = createDashboardTestStore(),
) => {
    store.dispatch(dashboardEditActions.setTiles(dashboardTiles));
    store.dispatch(dashboardEditActions.setTabs(tabs));
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {embedApi ? (
                <LightdashApiContext.Provider value={embedApi}>
                    {children}
                </LightdashApiContext.Provider>
            ) : (
                children
            )}
        </QueryClientProvider>
    );
    renderHook(
        () =>
            useDashboardTileParameterReferences({
                store,
                projectUuid: 'project-uuid',
            }),
        { wrapper },
    );
    return store;
};

describe('useDashboardTileParameterReferences', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        flag.enabled = true;
    });

    it('registers the references of every tile, on every tab', async () => {
        mockApi.mockResolvedValue([
            listedTile('tile-open', ['orders.region']),
            listedTile('tile-unopened', ['payments.region']),
            {
                tileUuid: 'tile-sql',
                parameterReferences: null,
                error: 'No access',
            },
        ]);

        const store = setup();

        await waitFor(() =>
            expect(store.getState().parameters.tileParameterReferences).toEqual(
                {
                    'tile-open': ['orders.region'],
                    'tile-unopened': ['payments.region'],
                },
            ),
        );
        expect(mockApi).toHaveBeenCalledTimes(1);
        expect(JSON.parse(mockApi.mock.calls[0][0].body)).toEqual({
            tiles: [
                {
                    tileUuid: 'tile-open',
                    savedChartUuid: 'chart-1',
                    savedSqlUuid: null,
                },
                {
                    tileUuid: 'tile-unopened',
                    savedChartUuid: 'chart-2',
                    savedSqlUuid: null,
                },
                {
                    tileUuid: 'tile-sql',
                    savedChartUuid: null,
                    savedSqlUuid: 'sql-1',
                },
            ],
        });
    });

    it('does not mark older responses without definitions as complete', async () => {
        mockApi.mockResolvedValue([
            {
                tileUuid: 'tile-open',
                parameterReferences: ['region'],
                error: null,
            },
        ]);
        const store = setup(undefined, [tiles[0]]);
        await waitFor(() => expect(mockApi).toHaveBeenCalled());
        expect(store.getState().parameters.tileListedParameterSources).toEqual(
            {},
        );
    });

    it('does not list tiles from older responses without saved values', async () => {
        mockApi.mockResolvedValue([
            {
                tileUuid: 'tile-open',
                parameterReferences: ['region'],
                parameterDefinitions: {},
                error: null,
            },
        ]);
        const store = setup(undefined, [tiles[0]]);
        await waitFor(() => expect(mockApi).toHaveBeenCalled());
        expect(store.getState().parameters.tileListedParameterSources).toEqual(
            {},
        );
        expect(store.getState().parameters.tileChartSavedParameters).toEqual(
            {},
        );
    });

    it('marks tiles whose listing errored, or came from an older server, as failed', async () => {
        mockApi.mockResolvedValue([
            listedTile('tile-open', ['orders.region']),
            {
                tileUuid: 'tile-unopened',
                parameterReferences: ['region'],
                parameterDefinitions: {},
                error: null,
            },
            {
                tileUuid: 'tile-sql',
                parameterReferences: null,
                error: 'No access',
            },
        ]);
        const store = setup();
        await waitFor(() =>
            expect(
                store.getState().parameters.tileFailedParameterSources,
            ).toEqual({
                'tile-unopened': JSON.stringify({
                    tileUuid: 'tile-unopened',
                    savedChartUuid: 'chart-2',
                    savedSqlUuid: null,
                }),
                'tile-sql': JSON.stringify({
                    tileUuid: 'tile-sql',
                    savedChartUuid: null,
                    savedSqlUuid: 'sql-1',
                }),
            }),
        );
        expect(
            Object.keys(store.getState().parameters.tileListedParameterSources),
        ).toEqual(['tile-open']);
    });

    describe('a tile pointed at another chart', () => {
        const failure = (tileUuid: string) => [
            { tileUuid, parameterReferences: null, error: 'Request failed' },
        ];
        const swap = (store: ReturnType<typeof createDashboardTestStore>) =>
            act(() => {
                store.dispatch(
                    dashboardEditActions.setTiles([
                        tile(
                            'tile-open',
                            'tab-1',
                            DashboardTileTypes.SAVED_CHART,
                            'chart-9',
                        ),
                    ]),
                );
            });
        const report = (
            store: ReturnType<typeof createDashboardTestStore>,
            references: string[],
            values: Record<string, string>,
        ) =>
            act(() => {
                store.dispatch(
                    dashboardParametersActions.addParameterReferences({
                        tileUuid: 'tile-open',
                        references,
                    }),
                );
                store.dispatch(
                    dashboardParametersActions.setTileChartSavedParameters({
                        tileUuid: 'tile-open',
                        values,
                    }),
                );
            });

        it("keeps the new chart's own report when its listing fails late", async () => {
            let failListing = () => {};
            mockApi
                .mockResolvedValueOnce([listedTile('tile-open', ['a.region'])])
                .mockImplementationOnce(
                    () =>
                        new Promise((resolve) => {
                            failListing = () => resolve(failure('tile-open'));
                        }),
                );
            const store = setup(undefined, [tiles[0]]);
            await waitFor(() =>
                expect(
                    store.getState().parameters.tileListedParameterReferences,
                ).toEqual({ 'tile-open': ['a.region'] }),
            );
            swap(store);
            await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));
            report(store, ['b.status'], { status: 'Open' });
            act(() => failListing());
            await waitFor(() =>
                expect(
                    Object.keys(
                        store.getState().parameters.tileFailedParameterSources,
                    ),
                ).toEqual(['tile-open']),
            );
            expect(store.getState().parameters.tileParameterReferences).toEqual(
                { 'tile-open': ['b.status'] },
            );
            expect(
                store.getState().parameters.tileChartSavedParameters,
            ).toEqual({ 'tile-open': { status: 'Open' } });
        });

        it("leaves nothing of a failed but reported chart when the new one's listing fails", async () => {
            mockApi.mockResolvedValue(failure('tile-open'));
            const store = setup(undefined, [tiles[0]]);
            await waitFor(() =>
                expect(
                    Object.keys(
                        store.getState().parameters.tileFailedParameterSources,
                    ),
                ).toEqual(['tile-open']),
            );
            report(store, ['a.region'], { region: 'EU' });
            swap(store);
            await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));
            await waitFor(() =>
                expect(
                    store.getState().parameters.tileFailedParameterSources[
                        'tile-open'
                    ],
                ).toContain('chart-9'),
            );
            const { parameters } = store.getState();
            expect(parameters.tileParameterReferences).toEqual({});
            expect(parameters.tileQueryParameterReferences).toEqual({});
            expect(parameters.tileChartSavedParameters).toEqual({});
        });

        it("refills from the new chart's listing", async () => {
            mockApi
                .mockResolvedValueOnce([listedTile('tile-open', ['a.region'])])
                .mockResolvedValueOnce([listedTile('tile-open', ['b.status'])]);
            const store = setup(undefined, [tiles[0]]);
            await waitFor(() =>
                expect(
                    store.getState().parameters.tileParameterReferences,
                ).toEqual({ 'tile-open': ['a.region'] }),
            );
            swap(store);
            await waitFor(() =>
                expect(
                    store.getState().parameters.tileParameterReferences,
                ).toEqual({ 'tile-open': ['b.status'] }),
            );
        });

        it('wipes nothing on the first load', async () => {
            mockApi.mockResolvedValue(failure('tile-open'));
            const store = createDashboardTestStore();
            store.dispatch(
                dashboardParametersActions.addParameterReferences({
                    tileUuid: 'tile-open',
                    references: ['a.region'],
                }),
            );
            setup(undefined, [tiles[0]], [], store);
            await waitFor(() =>
                expect(
                    store.getState().parameters.tileParameterStateSources,
                ).toHaveProperty('tile-open'),
            );
            expect(store.getState().parameters.tileParameterReferences).toEqual(
                { 'tile-open': ['a.region'] },
            );
        });

        it('keeps a report the new chart makes in the same render as the swap', async () => {
            mockApi.mockReturnValue(new Promise(() => {}));
            const store = createDashboardTestStore();
            store.dispatch(dashboardEditActions.setTiles([tiles[0]]));
            // A cached chart reports from its tile's effect in the commit that swaps it
            const Tile = () => {
                const key = useSyncExternalStore(store.subscribe, () =>
                    selectTileQuerySourcesKey(store.getState()),
                );
                useEffect(() => {
                    if (!key.includes('chart-9')) return;
                    store.dispatch(
                        dashboardParametersActions.setTileChartSavedParameters({
                            tileUuid: 'tile-open',
                            values: { status: 'Open' },
                        }),
                    );
                }, [key]);
                return null;
            };
            const Dashboard = () => {
                useDashboardTileParameterReferences({
                    store,
                    projectUuid: 'project-uuid',
                });
                return <Tile />;
            };
            render(
                <QueryClientProvider client={new QueryClient()}>
                    <Dashboard />
                </QueryClientProvider>,
            );
            await waitFor(() =>
                expect(
                    store.getState().parameters.tileParameterStateSources,
                ).toHaveProperty('tile-open'),
            );
            swap(store);
            expect(
                store.getState().parameters.tileChartSavedParameters,
            ).toEqual({ 'tile-open': { status: 'Open' } });
        });
    });

    it('keeps a good listing of the same source when a refetch fails for it', async () => {
        mockApi.mockResolvedValue([
            {
                tileUuid: 'tile-open',
                parameterReferences: null,
                error: 'Request failed',
            },
            {
                tileUuid: 'tile-sql',
                parameterReferences: null,
                error: 'Request failed',
            },
        ]);
        const store = createDashboardTestStore();
        store.dispatch(
            dashboardParametersActions.addDiscoveredParameterReferences({
                references: { 'tile-open': ['orders.region'] },
                definitions: {},
                sources: {
                    'tile-open': JSON.stringify({
                        tileUuid: 'tile-open',
                        savedChartUuid: 'chart-1',
                        savedSqlUuid: null,
                    }),
                },
                chartSavedValues: { 'tile-open': {} },
                virtualViewSavedValues: { 'tile-open': {} },
            }),
        );
        setup(undefined, tiles, [], store);
        await waitFor(() =>
            expect(
                Object.keys(
                    store.getState().parameters.tileFailedParameterSources,
                ),
            ).toEqual(['tile-sql']),
        );
        expect(
            store.getState().parameters.tileListedParameterReferences,
        ).toEqual({ 'tile-open': ['orders.region'] });
    });

    it('sends a large dashboard in requests of at most 200 tiles', async () => {
        const manyTiles = Array.from({ length: 450 }, (_, index) =>
            tile(
                `tile-${index}`,
                'tab-1',
                DashboardTileTypes.SAVED_CHART,
                `chart-${index}`,
            ),
        );
        mockApi.mockImplementation(async ({ body }: { body: string }) =>
            listingOf(body, ['orders.region']),
        );

        const store = setup(undefined, manyTiles);

        await waitFor(() =>
            expect(
                Object.keys(
                    store.getState().parameters.tileParameterReferences,
                ),
            ).toHaveLength(450),
        );
        expect(
            mockApi.mock.calls.map(
                ([{ body }]) => JSON.parse(body).tiles.length,
            ),
        ).toEqual([200, 200, 50]);
    });

    it('keeps the batches that succeed when one batch fails', async () => {
        const manyTiles = Array.from({ length: 450 }, (_, index) =>
            tile(
                `tile-${index}`,
                'tab-1',
                DashboardTileTypes.SAVED_CHART,
                `chart-${index}`,
            ),
        );
        mockApi.mockImplementation(async ({ body }: { body: string }) => {
            const batch = (
                JSON.parse(body) as { tiles: { tileUuid: string }[] }
            ).tiles;
            if (batch[0].tileUuid === 'tile-200') {
                throw new Error('Request failed');
            }
            return listingOf(body, ['orders.region']);
        });

        const store = setup(undefined, manyTiles);

        await waitFor(() =>
            expect(
                Object.keys(
                    store.getState().parameters.tileParameterReferences,
                ),
            ).toHaveLength(250),
        );
        const listed =
            store.getState().parameters.tileListedParameterReferences;
        expect(listed['tile-199']).toEqual(['orders.region']);
        expect(listed['tile-200']).toBeUndefined();
        expect(listed['tile-449']).toEqual(['orders.region']);
        await waitFor(() =>
            expect(
                Object.keys(
                    store.getState().parameters.tileFailedParameterSources,
                ),
            ).toHaveLength(200),
        );
        expect(
            store.getState().parameters.tileFailedParameterSources['tile-200'],
        ).toBeDefined();
    });

    it("requests through the embed's API client, which sends its token", async () => {
        const embedApi = vi
            .fn()
            .mockResolvedValue([listedTile('tile-open', ['orders.region'])]);

        const store = setup(embedApi as unknown as LightdashApi);

        await waitFor(() =>
            expect(store.getState().parameters.tileParameterReferences).toEqual(
                { 'tile-open': ['orders.region'] },
            ),
        );
        expect(embedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/dashboards/tile-parameter-references',
                version: 'v2',
            }),
        );
        expect(mockApi).not.toHaveBeenCalled();
    });

    it('lists tiles on a dashboard with a single tab', async () => {
        mockApi.mockResolvedValue([listedTile('tile-open', ['orders.region'])]);

        const store = setup(undefined, [tiles[0]], [dashboardTabs[0]]);

        await waitFor(() =>
            expect(
                store.getState().parameters.tileListedParameterReferences,
            ).toEqual({ 'tile-open': ['orders.region'] }),
        );
    });

    it('lists tiles and their saved values on dashboards with tabs', async () => {
        mockApi.mockResolvedValue([
            {
                ...listedTile('tile-unopened', ['orders.region']),
                chartSavedValues: { 'orders.region': 'EU' },
                virtualViewSavedValues: { 'orders.week': 'W1' },
            },
        ]);

        const store = setup(undefined, tiles, dashboardTabs);

        await waitFor(() =>
            expect(
                store.getState().parameters.tileChartSavedParameters,
            ).toEqual({ 'tile-unopened': { 'orders.region': 'EU' } }),
        );
        expect(
            store.getState().parameters.tileVirtualViewSavedParameters,
        ).toEqual({ 'tile-unopened': { 'orders.week': 'W1' } });
    });

    it('requests again when the tile set changes in edit mode', async () => {
        mockApi.mockImplementation(async ({ body }: { body: string }) =>
            listingOf(body, ['orders.region']),
        );

        const store = setup(undefined, [tiles[0]]);

        await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(1));
        store.dispatch(dashboardEditActions.setTiles(tiles));

        await waitFor(() => expect(mockApi).toHaveBeenCalledTimes(2));
        expect(
            JSON.parse(mockApi.mock.calls[1][0].body).tiles.map(
                ({ tileUuid }: { tileUuid: string }) => tileUuid,
            ),
        ).toEqual(['tile-open', 'tile-unopened', 'tile-sql']);
    });

    it('makes no request with the flag off', async () => {
        flag.enabled = false;

        const store = setup();

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockApi).not.toHaveBeenCalled();
        expect(store.getState().parameters.tileParameterReferences).toEqual({});
    });
});
