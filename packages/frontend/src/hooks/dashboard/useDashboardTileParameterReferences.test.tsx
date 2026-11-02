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

import { sharedLightdashApi } from '../../api';
import { dashboardEditActions } from '../../features/dashboard/store';
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

const setup = () => {
    const store = createDashboardTestStore();
    store.dispatch(dashboardEditActions.setTiles(tiles));
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
    renderHook(
        () =>
            useDashboardTileParameterReferences({
                store,
                projectUuid: 'project-uuid',
                embedToken: undefined,
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

    it('makes no request with the flag off', async () => {
        flag.enabled = false;

        const store = setup();

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockApi).not.toHaveBeenCalled();
        expect(store.getState().parameters.tileParameterReferences).toEqual({});
    });
});
