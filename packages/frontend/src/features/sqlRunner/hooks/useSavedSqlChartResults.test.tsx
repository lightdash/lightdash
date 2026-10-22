import { type SqlChart } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
    WarehouseSignInPreflight,
    WarehouseSignInPreflightContext,
} from '../../../components/NavBar/warehouseSignInPreflight';
import {
    getDashboardSqlChartPivotChartData,
    getSqlChartPivotChartData,
} from '../../queryRunner/sqlRunnerPivotQueries';
import { useSavedSqlChartResults } from './useSavedSqlChartResults';
import { fetchSavedSqlChart } from './useSavedSqlCharts';

vi.mock('./useSavedSqlCharts', () => ({
    fetchSavedSqlChart: vi.fn(),
    fetchEmbedDashboardSqlChartTile: vi.fn(),
}));
vi.mock('../../../hooks/useQueryRetry', () => ({
    CHART_RESULTS_ERROR_NAME: 'ChartResultsError',
    useQueryRetryConfig: () => ({ retry: false }),
}));
vi.mock('../../../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('../../queryRunner/sqlRunnerPivotQueries', () => ({
    getSqlChartPivotChartData: vi.fn(() => new Promise(() => {})),
    getDashboardSqlChartPivotChartData: vi.fn(),
    getEmbedDashboardSqlChartPivotChartData: vi.fn(),
}));

describe('useSavedSqlChartResults', () => {
    it('runs the results once when a cached chart was edited before remount', async () => {
        const args = { projectUuid: 'project', slug: 'sql-slug' };
        const cachedChart = {
            savedSqlUuid: 'sql-uuid',
            lastUpdatedAt: new Date('2026-01-01T00:00:00Z'),
        } as SqlChart;
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false, staleTime: 0 } },
        });
        client.setQueryData(
            ['savedSqlChart', 'sql-slug', 'registered', undefined, 'project'],
            cachedChart,
        );
        client.setQueryData(
            [
                'savedSqlChartResults',
                'sql-slug',
                args,
                cachedChart.lastUpdatedAt,
            ],
            {},
        );
        let resolveChart: (chart: SqlChart) => void = () => {};
        vi.mocked(fetchSavedSqlChart).mockReturnValue(
            new Promise((resolve) => {
                resolveChart = resolve;
            }),
        );
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                {children}
            </QueryClientProvider>
        );

        const { result } = renderHook(() => useSavedSqlChartResults(args), {
            wrapper,
        });
        await waitFor(() =>
            expect(result.current.chartQuery.isFetching).toBe(true),
        );
        expect(getSqlChartPivotChartData).not.toHaveBeenCalled();

        const editedAt = new Date('2026-01-02T00:00:00Z');
        resolveChart({ ...cachedChart, lastUpdatedAt: editedAt });
        await waitFor(() =>
            expect(result.current.chartQuery.data?.lastUpdatedAt).toBe(
                editedAt,
            ),
        );
        await waitFor(() =>
            expect(getSqlChartPivotChartData).toHaveBeenCalledTimes(1),
        );
    });

    it.each([true, false])(
        'sends invalidateCache=%s for a dashboard tile so refresh skips the results cache',
        async (invalidateCache) => {
            const chart = {
                savedSqlUuid: 'sql-uuid',
                lastUpdatedAt: new Date('2026-01-01T00:00:00Z'),
            } as SqlChart;
            vi.mocked(fetchSavedSqlChart).mockResolvedValue(chart);
            vi.mocked(getDashboardSqlChartPivotChartData).mockReturnValue(
                new Promise(() => {}),
            );
            const client = new QueryClient({
                defaultOptions: { queries: { retry: false } },
            });
            const wrapper = ({ children }: PropsWithChildren) => (
                <QueryClientProvider client={client}>
                    {children}
                </QueryClientProvider>
            );

            renderHook(
                () =>
                    useSavedSqlChartResults({
                        projectUuid: 'project',
                        savedSqlUuid: 'sql-uuid',
                        dashboardUuid: 'dashboard',
                        tileUuid: 'tile',
                        dashboardFilters: {
                            dimensions: [],
                            metrics: [],
                            tableCalculations: [],
                        },
                        dashboardSorts: [],
                        invalidateCache,
                    }),
                { wrapper },
            );

            await waitFor(() =>
                expect(getDashboardSqlChartPivotChartData).toHaveBeenCalledWith(
                    expect.anything(),
                    expect.objectContaining({ invalidateCache }),
                ),
            );
        },
    );
});

it.each([null, 'connection_extra'])(
    'saved SQL metadata mounts before results preflight for binding %s',
    async (binding) => {
        vi.clearAllMocks();
        const metadata = Promise.withResolvers<SqlChart>();
        vi.mocked(fetchSavedSqlChart).mockReturnValue(metadata.promise);
        vi.mocked(getSqlChartPivotChartData).mockReturnValue(
            new Promise(() => {}),
        );
        const projectUuid = 'project_a';
        const preflight = new WarehouseSignInPreflight(
            { projectUuid, userUuid: 'user_a', pageGeneration: 'page_a' },
            true,
            false,
        );
        const client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={client}>
                <WarehouseSignInPreflightContext.Provider value={preflight}>
                    {children}
                </WarehouseSignInPreflightContext.Provider>
            </QueryClientProvider>
        );
        renderHook(
            () =>
                useSavedSqlChartResults({ projectUuid, savedSqlUuid: 'sql_a' }),
            { wrapper },
        );
        await waitFor(() => expect(fetchSavedSqlChart).toHaveBeenCalled());
        expect(preflight.checks.size).toBe(0);
        expect(getSqlChartPivotChartData).not.toHaveBeenCalled();
        await act(async () =>
            metadata.resolve({
                savedSqlUuid: 'sql_a',
                warehouseConnectionUuid: binding,
                lastUpdatedAt: new Date(),
            } as SqlChart),
        );
        const key = binding ?? 'original';
        await waitFor(() => expect(preflight.checks.has(key)).toBe(true));
        expect(getSqlChartPivotChartData).not.toHaveBeenCalled();
        await act(() =>
            preflight.settle(
                binding,
                preflight.checks.get(key)!.generation,
                null,
            ),
        );
        await waitFor(() =>
            expect(getSqlChartPivotChartData).toHaveBeenCalledOnce(),
        );
        const generation = preflight.checks.get(key)!.generation;
        const refreshed = Promise.withResolvers<SqlChart>();
        vi.mocked(fetchSavedSqlChart).mockReturnValue(refreshed.promise);
        act(() => {
            void client.invalidateQueries({ queryKey: ['savedSqlChart'] });
        });
        await waitFor(() =>
            expect(fetchSavedSqlChart).toHaveBeenCalledTimes(2),
        );
        expect(preflight.checks.get(key)?.generation).toBe(generation);
        expect(preflight.ready(binding)).toBe(true);
        client.clear();
    },
);
