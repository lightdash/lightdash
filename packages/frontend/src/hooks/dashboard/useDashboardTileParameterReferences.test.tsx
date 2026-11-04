import { DashboardTileTypes, type DashboardTile } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';

vi.mock('../../api');

const { flag } = vi.hoisted(() => ({ flag: { enabled: true } }));
vi.mock('../useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: flag.enabled } }),
}));

import { sharedLightdashApi, type LightdashApi } from '../../api';
import { dashboardEditActions } from '../../features/dashboard/store';
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

const setup = (
    embedApi?: LightdashApi,
    dashboardTiles = tiles,
    isEditMode = true,
) => {
    const store = createDashboardTestStore();
    store.dispatch(dashboardEditActions.setTiles(dashboardTiles));
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
                isEditMode,
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
            {
                tileUuid: 'tile-open',
                parameterReferences: ['orders.region'],
                error: null,
            },
            {
                tileUuid: 'tile-unopened',
                parameterReferences: ['payments.region'],
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
            (
                JSON.parse(body) as {
                    tiles: { tileUuid: string }[];
                }
            ).tiles.map(({ tileUuid }) => ({
                tileUuid,
                parameterReferences: ['orders.region'],
                error: null,
            })),
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
            return batch.map(({ tileUuid }) => ({
                tileUuid,
                parameterReferences: ['orders.region'],
                error: null,
            }));
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
    });

    it("requests through the embed's API client, which sends its token", async () => {
        const embedApi = vi.fn().mockResolvedValue([
            {
                tileUuid: 'tile-open',
                parameterReferences: ['orders.region'],
                error: null,
            },
        ]);

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

    it('makes no request in view mode', async () => {
        const store = setup(undefined, tiles, false);

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockApi).not.toHaveBeenCalled();
        expect(store.getState().parameters.tileParameterReferences).toEqual({});
    });

    it('requests again when the tile set changes in edit mode', async () => {
        mockApi.mockImplementation(async ({ body }: { body: string }) =>
            (JSON.parse(body) as { tiles: { tileUuid: string }[] }).tiles.map(
                ({ tileUuid }) => ({
                    tileUuid,
                    parameterReferences: ['orders.region'],
                    error: null,
                }),
            ),
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
