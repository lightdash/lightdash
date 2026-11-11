import { QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, vi, type Mock } from 'vitest';
import { createQueryClient } from '../../../../providers/ReactQuery/createQueryClient';
import {
    useEmbedDashboard,
    useEmbedDashboardRefreshKey,
    useEmbedSavedParameters,
} from './hooks';

vi.mock('./api', () => ({
    postEmbedDashboard: vi.fn(),
}));

const setSavedParameters = vi.hoisted(() => vi.fn());
vi.mock('../../../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (value: Record<string, unknown>) => unknown) =>
        selector({ setSavedParameters }),
}));

import { postEmbedDashboard } from './api';

const mockPostEmbedDashboard = postEmbedDashboard as unknown as Mock;

// Mirrors the NetworkError shape `handleError` (src/api.ts) synthesizes for a
// transient transport failure; `shouldRetryQuery` matches on `error.name`.
const transientNetworkError = {
    status: 'error',
    error: {
        name: 'NetworkError',
        statusCode: 500,
        message:
            'We are currently unable to reach the server. Please try again in a few moments.',
        data: {},
    },
};

const dashboard = { name: 'My dashboard', tiles: [], tabs: [] };

// Uses the production QueryClient defaults so the test exercises the same
// retry policy the app ships with.
function createWrapper(
    queryClient = createQueryClient({
        queries: { retryDelay: () => 0 },
    }),
) {
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

describe('useEmbedDashboard', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('recovers from a single transient NetworkError instead of surfacing a terminal error', async () => {
        mockPostEmbedDashboard
            .mockRejectedValueOnce(transientNetworkError)
            .mockResolvedValue(dashboard);

        const { result } = renderHook(() => useEmbedDashboard('project-uuid'), {
            wrapper: createWrapper(),
        });

        // A single transient blip must not strand the embed on
        // "unable to reach the Lightdash server" — the global retry
        // policy should re-attempt and succeed.
        await waitFor(() => expect(result.current.isSuccess).toBe(true), {
            timeout: 3000,
        });
        expect(result.current.data).toEqual(dashboard);
        expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(2);
    });

    it('surfaces a real API error immediately without retrying', async () => {
        const forbiddenError = {
            status: 'error',
            error: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'Your embed token has expired.',
                data: {},
            },
        };
        mockPostEmbedDashboard.mockRejectedValue(forbiddenError);

        const { result } = renderHook(() => useEmbedDashboard('project-uuid'), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(result.current.error).toEqual(forbiddenError);
        expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(1);
    });

    it('surfaces the error after exhausting retries during a persistent outage', async () => {
        mockPostEmbedDashboard.mockRejectedValue(transientNetworkError);

        const { result } = renderHook(() => useEmbedDashboard('project-uuid'), {
            wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isError).toBe(true), {
            timeout: 3000,
        });
        // initial attempt + MAX_QUERY_RETRIES (5) retries
        expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(6);
    });
});

describe('useEmbedSavedParameters', () => {
    beforeEach(() => {
        setSavedParameters.mockClear();
    });

    it('passes the dashboard saved parameters to the dashboard state', () => {
        const parameters = {
            status: { parameterName: 'status', value: 'shipped' },
        };
        renderHook(() => useEmbedSavedParameters({ parameters }));

        expect(setSavedParameters).toHaveBeenCalledWith(parameters);
    });

    it('clears saved parameters for a dashboard without any', () => {
        renderHook(() => useEmbedSavedParameters({ parameters: undefined }));

        expect(setSavedParameters).toHaveBeenCalledWith({});
    });

    it('waits for the dashboard to load', () => {
        renderHook(() => useEmbedSavedParameters(undefined));

        expect(setSavedParameters).not.toHaveBeenCalled();
    });
});

describe('useEmbedDashboardRefreshKey', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        mockPostEmbedDashboard.mockResolvedValue(dashboard);
    });

    const renderRefreshableDashboard = (
        initialProps: {
            refreshKey: number | undefined;
            isEditMode: boolean;
        },
        queryClient = createQueryClient({
            queries: { retryDelay: () => 0 },
        }),
    ) =>
        renderHook(
            ({ refreshKey, isEditMode }) => {
                useEmbedDashboardRefreshKey(refreshKey, isEditMode);
                return useEmbedDashboard('project-uuid');
            },
            { wrapper: createWrapper(queryClient), initialProps },
        );

    it('refetches the dashboard when the refresh key changes', async () => {
        const { result, rerender } = renderRefreshableDashboard({
            refreshKey: undefined,
            isEditMode: false,
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(1);

        rerender({ refreshKey: 1, isEditMode: false });

        await waitFor(() =>
            expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(2),
        );
    });

    it('invalidates saved SQL chart definitions', async () => {
        const queryClient = createQueryClient();
        const sqlChartKey = ['savedSqlChart', 'chart', 'embed', 'tile'];
        queryClient.setQueryData(sqlChartKey, { lastUpdatedAt: 'old' });
        const { result, rerender } = renderRefreshableDashboard(
            { refreshKey: 0, isEditMode: false },
            queryClient,
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        rerender({ refreshKey: 1, isEditMode: false });

        expect(queryClient.getQueryState(sqlChartKey)?.isInvalidated).toBe(
            true,
        );
    });

    it('does not refetch on rerenders with the same key', async () => {
        const { result, rerender } = renderRefreshableDashboard({
            refreshKey: 1,
            isEditMode: false,
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        rerender({ refreshKey: 1, isEditMode: false });

        expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(1);
    });

    it('waits for edit mode to end before refetching', async () => {
        const { result, rerender } = renderRefreshableDashboard({
            refreshKey: 0,
            isEditMode: true,
        });
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        rerender({ refreshKey: 1, isEditMode: true });
        expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(1);

        rerender({ refreshKey: 1, isEditMode: false });
        await waitFor(() =>
            expect(mockPostEmbedDashboard).toHaveBeenCalledTimes(2),
        );
    });
});
