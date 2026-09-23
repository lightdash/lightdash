import { ChartType } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import {
    executeSavedChartPreviewQuery,
    type SavedChartPreviewQueryResult,
} from '../utils/savedChartPreviewQuery';
import { useSavedChartPreviewData } from './useSavedChartPreviewData';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../utils/savedChartPreviewQuery', () => ({
    executeSavedChartPreviewQuery: vi.fn(),
}));

const mockedLightdashApi = vi.mocked(lightdashApi);
const mockedExecuteSavedChartPreviewQuery = vi.mocked(
    executeSavedChartPreviewQuery,
);

const previewResult: SavedChartPreviewQueryResult = {
    rows: [],
    itemsMap: {},
    pivotDetails: null,
};

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useSavedChartPreviewData', () => {
    beforeEach(() => {
        mockedLightdashApi.mockReset().mockResolvedValue({
            name: 'Orders by status',
            spaceName: 'Finance',
        } as never);
        mockedExecuteSavedChartPreviewQuery
            .mockReset()
            .mockResolvedValue(previewResult);
    });

    it.each([
        { enabled: false, savedChartUuid: 'chart-a' },
        { enabled: true, savedChartUuid: null },
    ])(
        'does not fetch when enabled is $enabled and the chart is $savedChartUuid',
        ({ enabled, savedChartUuid }) => {
            const { result } = renderHook(
                () =>
                    useSavedChartPreviewData({
                        projectUuid: 'project-1',
                        savedChartUuid,
                        enabled,
                    }),
                { wrapper: createWrapper() },
            );

            expect(result.current.data).toEqual({ status: 'notRun' });

            act(() => result.current.retry());

            expect(mockedLightdashApi).not.toHaveBeenCalled();
            expect(mockedExecuteSavedChartPreviewQuery).not.toHaveBeenCalled();
        },
    );

    it('exposes the saved layout and pivot with the ready query results', async () => {
        const chartConfig = {
            type: ChartType.CARTESIAN,
            config: {
                layout: { xField: 'orders_date', yField: ['orders_count'] },
                eChartsConfig: {},
            },
        };
        const pivotConfig = { columns: ['orders_status'] };
        mockedLightdashApi.mockResolvedValue({
            name: 'Orders by status',
            chartConfig,
            pivotConfig,
        } as never);
        const { result } = renderHook(
            () =>
                useSavedChartPreviewData({
                    projectUuid: 'project-1',
                    savedChartUuid: 'chart-a',
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(result.current.data).toMatchObject({
                status: 'ready',
                sourceChart: { chartConfig, pivotConfig },
            }),
        );
        expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledOnce();
    });

    it('runs a selected chart only once for the same query key', async () => {
        const args = {
            projectUuid: 'project-1',
            savedChartUuid: 'chart-a',
            enabled: true,
        };
        const { result, rerender } = renderHook(
            () => useSavedChartPreviewData(args),
            { wrapper: createWrapper() },
        );

        await waitFor(() => expect(result.current.data.status).toBe('ready'));

        rerender();

        expect(mockedLightdashApi).toHaveBeenCalledTimes(1);
        expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledTimes(1);
        expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledWith({
            projectUuid: 'project-1',
            chartUuid: 'chart-a',
        });
    });

    it('waits for source bindings even when the row query finishes first', async () => {
        let resolveChart!: (value: unknown) => void;
        mockedLightdashApi.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveChart = resolve;
                }) as never,
        );
        const { result } = renderHook(
            () =>
                useSavedChartPreviewData({
                    projectUuid: 'project-1',
                    savedChartUuid: 'chart-a',
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledOnce(),
        );
        expect(result.current.data.status).toBe('running');
        act(() => resolveChart({ name: 'Orders' }));
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
    });

    it('reports source metadata failures and retries both requests', async () => {
        mockedLightdashApi.mockRejectedValueOnce({
            status: 'error',
            error: { message: 'Chart unavailable', statusCode: 500 },
        });
        const { result } = renderHook(
            () =>
                useSavedChartPreviewData({
                    projectUuid: 'project-1',
                    savedChartUuid: 'chart-a',
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(result.current.data).toMatchObject({
                status: 'error',
                message: 'Chart unavailable',
            }),
        );
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        expect(mockedLightdashApi).toHaveBeenCalledTimes(2);
        expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledTimes(2);
    });

    it('uses the executed merged query field IDs to derive preview bindings', async () => {
        const metricQuery = {
            exploreName: 'orders',
            dimensions: ['orders_orders_date', 'merge_region'],
            metrics: ['orders_orders_count'],
            tableCalculations: [],
            sorts: [],
            filters: {},
            limit: 500,
        };
        mockedLightdashApi.mockResolvedValue({
            name: 'Merged orders',
            metricQuery: {
                ...metricQuery,
                dimensions: ['orders_date'],
                metrics: ['orders_count'],
            },
        } as never);
        mockedExecuteSavedChartPreviewQuery.mockResolvedValue({
            ...previewResult,
            metricQuery,
        });
        const { result } = renderHook(
            () =>
                useSavedChartPreviewData({
                    projectUuid: 'project-1',
                    savedChartUuid: 'chart-a',
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(result.current.data).toMatchObject({
                status: 'ready',
                sourceChart: {
                    metricQuery,
                    originalMetricQuery: {
                        ...metricQuery,
                        dimensions: ['orders_date'],
                        metrics: ['orders_count'],
                    },
                },
            }),
        );
    });

    it('runs again when the selected chart changes', async () => {
        const { result, rerender } = renderHook(
            ({ savedChartUuid }) =>
                useSavedChartPreviewData({
                    projectUuid: 'project-1',
                    savedChartUuid,
                    enabled: true,
                }),
            {
                initialProps: { savedChartUuid: 'chart-a' },
                wrapper: createWrapper(),
            },
        );

        await waitFor(() => expect(result.current.data.status).toBe('ready'));

        rerender({ savedChartUuid: 'chart-b' });

        await waitFor(() =>
            expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledTimes(
                2,
            ),
        );
        expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenNthCalledWith(2, {
            projectUuid: 'project-1',
            chartUuid: 'chart-b',
        });
    });

    it('recovers from an execution error when retried', async () => {
        mockedExecuteSavedChartPreviewQuery
            .mockRejectedValueOnce(new Error('Query failed'))
            .mockResolvedValueOnce(previewResult);
        const { result } = renderHook(
            () =>
                useSavedChartPreviewData({
                    projectUuid: 'project-1',
                    savedChartUuid: 'chart-a',
                    enabled: true,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() =>
            expect(result.current.data).toMatchObject({
                status: 'error',
                message: 'Query failed',
            }),
        );

        act(() => result.current.retry());

        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        expect(mockedExecuteSavedChartPreviewQuery).toHaveBeenCalledTimes(2);
    });
});
