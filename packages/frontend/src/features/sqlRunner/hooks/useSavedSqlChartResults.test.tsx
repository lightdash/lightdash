import { type SqlChart } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getSqlChartPivotChartData } from '../../queryRunner/sqlRunnerPivotQueries';
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
});
