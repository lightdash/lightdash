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
