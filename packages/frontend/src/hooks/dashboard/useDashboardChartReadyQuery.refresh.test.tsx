import { type SavedChart } from '@lightdash/common';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type FC, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { dashboardTileStatusActions } from '../../features/dashboard/store';
import { createQueryClient } from '../../providers/ReactQuery/createQueryClient';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { useDashboardChartReadyQuery } from './useDashboardChartReadyQuery';
import { useDashboardRefresh } from './useDashboardRefresh';

const mocks = vi.hoisted(() => ({
    lightdashApi: vi.fn(),
}));

const chart = {
    uuid: 'chart-uuid',
    projectUuid: 'project-uuid',
    tableName: 'orders',
    parameters: {},
    chartConfig: { type: 'table', config: {} },
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
} as unknown as SavedChart;
const explore = { name: 'orders', tables: {} };
const noFilters = { dimensions: [], metrics: [], tableCalculations: [] };

vi.mock('../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => mocks.lightdashApi,
}));
vi.mock('../useSavedQuery', () => ({
    useSavedQuery: () => ({ data: chart }),
}));
vi.mock('../useExplore', () => ({
    useExplore: () => ({ data: explore, error: null }),
}));
vi.mock('./useDashboardFiltersForTile', () => ({
    default: () => noFilters,
}));
vi.mock('./useTileVirtualViewSavedParameters', () => ({
    useTileVirtualViewSavedParameters: () => {},
}));
vi.mock('../useQueryRetry', () => ({
    useQueryRetryConfig: () => ({}),
}));
vi.mock('../useSessionTimezone', () => ({
    useSessionTimezone: () => null,
}));
vi.mock('../useSearchParams', () => ({ default: () => undefined }));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: { uuid: 'dashboard-uuid' },
            projectUuid: 'project-uuid',
            includeUnpublishedDraft: false,
            addParameterReferences: () => {},
            setTileChartSavedParameters: () => {},
            setTilesWithDateZoomApplied: () => {},
            addParameterDefinitions: () => {},
            setChartZoomableFields: () => {},
        }),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: (selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            markTileLoaded: () => {},
            addAvailableCustomGranularities: () => {},
        }),
}));

const tileQueriesSent = (): boolean[] =>
    mocks.lightdashApi.mock.calls
        .filter(([request]) => request.url.endsWith('/query/dashboard-chart'))
        .map(([request]) => JSON.parse(request.body).invalidateCache);

describe('useDashboardChartReadyQuery refresh', () => {
    it('runs the tile query again on every refresh, not just the first', async () => {
        mocks.lightdashApi.mockResolvedValue({ queryUuid: 'query-uuid' });
        const store = createDashboardTestStore();
        const queryClient = createQueryClient({ queries: { retry: false } });
        const wrapper: FC<PropsWithChildren> = ({ children }) => (
            <QueryClientProvider client={queryClient}>
                <DashboardStoreTestProvider store={store}>
                    {children}
                </DashboardStoreTestProvider>
            </QueryClientProvider>
        );
        const { result } = renderHook(
            () => ({
                tile: useDashboardChartReadyQuery('tile-uuid', 'chart-uuid'),
                refresh: useDashboardRefresh(),
            }),
            { wrapper },
        );
        await waitFor(() => expect(result.current.tile.isSuccess).toBe(true));
        const sentOnLoad = tileQueriesSent().length;
        expect(sentOnLoad).toBe(1);

        // Mirrors the dashboard refresh button
        const pressRefresh = async (press: number) => {
            await act(async () => {
                result.current.refresh.removeDashboardResultsQueries();
                store.dispatch(dashboardTileStatusActions.refresh());
                await result.current.refresh.invalidateDashboardRelatedQueries();
            });
            await waitFor(() =>
                expect(tileQueriesSent()).toHaveLength(sentOnLoad + press),
            );
        };

        await pressRefresh(1);
        await pressRefresh(2);
        await pressRefresh(3);

        expect(tileQueriesSent().slice(sentOnLoad)).toEqual([true, true, true]);
    });
});
