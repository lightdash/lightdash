import {
    QueryHistoryStatus,
    type ApiGetAsyncQueryResults,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import {
    focusManager,
    QueryClient,
    QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';
import { useInfiniteQueryResults } from './useQueryResults';

let mockGetResultsPage: Mock<
    (
        projectUuid: string,
        queryUuid: string,
        page: number,
        pageSize: number | null,
    ) => Promise<ApiGetAsyncQueryResults>
>;

vi.mock('../api', () => ({
    lightdashApi: vi.fn(),
}));

import { lightdashApi } from '../api';

vi.mock('./useQueryError', () => ({
    default: () => vi.fn(),
}));

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}

function makeReadyPage(
    page: number,
    opts?: {
        queryUuid?: string;
        rows?: number;
        totalResults?: number;
        nextPage?: number;
    },
): ReadyQueryResultsPage {
    const rowCount = opts?.rows ?? 5;
    return {
        queryUuid: opts?.queryUuid ?? 'q1',
        status: QueryHistoryStatus.READY,
        page,
        pageSize: 500,
        totalPageCount: 1,
        nextPage: opts?.nextPage,
        previousPage: page > 1 ? page - 1 : undefined,
        columns: {},
        rows: Array.from({ length: rowCount }, (_, i) => ({
            [`col`]: { value: { raw: `row-${page}-${i}`, formatted: '' } },
        })),
        metadata: {
            performance: {
                initialQueryExecutionMs: 100,
                resultsPageExecutionMs: 50,
                queueTimeMs: null,
            },
            preAggregate: null,
        },
        pivotDetails: null,
        totalResults: opts?.totalResults ?? rowCount,
    };
}

describe('useInfiniteQueryResults', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetResultsPage = lightdashApi as unknown as Mock;
    });

    it('does not duplicate pages when React Query re-delivers the same READY result', async () => {
        const page1 = makeReadyPage(1);
        mockGetResultsPage.mockResolvedValue(page1);

        const { result, rerender } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.rows.length).toBe(5);
        });

        // Simulate re-renders from React Query re-delivering the same result
        rerender();
        rerender();
        rerender();

        expect(result.current.rows.length).toBe(5);
    });

    it('accumulates multiple distinct pages correctly', async () => {
        const page1 = makeReadyPage(1, {
            rows: 5,
            totalResults: 10,
            nextPage: 2,
        });
        const page2 = makeReadyPage(2, {
            rows: 5,
            totalResults: 10,
        });

        mockGetResultsPage
            .mockResolvedValueOnce(page1)
            .mockResolvedValueOnce(page2);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.rows.length).toBe(5);
        });

        act(() => {
            result.current.fetchMoreRows();
        });

        await waitFor(() => {
            expect(result.current.rows.length).toBe(10);
        });
    });

    it('falls back to a non-empty message when the backend error is empty (PROD-7011)', async () => {
        const errorResponse: ApiGetAsyncQueryResults = {
            queryUuid: 'q1',
            status: QueryHistoryStatus.ERROR,
            error: '',
            erroredAt: new Date(),
        };
        mockGetResultsPage.mockResolvedValue(errorResponse);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });

        // Empty backend error must not surface as an empty message — the tile
        // UI renders 'Error running query' when the message is empty, masking
        // the real failure. See PROD-7011.
        expect(result.current.error?.error?.message).toBeTruthy();
    });

    it('surfaces expired Redshift IAM async query failures as token errors', async () => {
        const errorResponse: ApiGetAsyncQueryResults = {
            queryUuid: 'q1',
            status: QueryHistoryStatus.ERROR,
            error: 'Failed to mint Redshift IAM credentials: The security token included in the request is expired',
            erroredAt: new Date(),
        };
        mockGetResultsPage.mockResolvedValue(errorResponse);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });

        expect(result.current.error?.error?.name).toBe('RedshiftIamTokenError');
        expect(result.current.error?.error?.statusCode).toBe(401);
    });

    it('surfaces friendly Redshift IAM expiry messages as token errors', async () => {
        const errorResponse: ApiGetAsyncQueryResults = {
            queryUuid: 'q1',
            status: QueryHistoryStatus.ERROR,
            error: 'Your Redshift IAM AWS session has expired. Generate new AWS credentials and log in to Redshift again.',
            erroredAt: new Date(),
        };
        mockGetResultsPage.mockResolvedValue(errorResponse);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });

        expect(result.current.error?.error?.name).toBe('RedshiftIamTokenError');
    });

    it('surfaces a rejected BigQuery refresh token as a token error', async () => {
        const errorResponse: ApiGetAsyncQueryResults = {
            queryUuid: 'q1',
            status: QueryHistoryStatus.ERROR,
            error: 'Google rejected the BigQuery refresh token (invalid_grant: Token has been expired or revoked.; invalid_rapt). Reconnect your BigQuery account in personal settings.',
            erroredAt: new Date(),
        };
        mockGetResultsPage.mockResolvedValue(errorResponse);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });

        expect(result.current.error?.error?.name).toBe('BigqueryTokenError');
        expect(result.current.error?.error?.statusCode).toBe(401);
    });

    it('leaves a bare invalid_grant message as a generic error', async () => {
        const errorResponse: ApiGetAsyncQueryResults = {
            queryUuid: 'q1',
            status: QueryHistoryStatus.ERROR,
            error: 'invalid_grant',
            erroredAt: new Date(),
        };
        mockGetResultsPage.mockResolvedValue(errorResponse);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });

        expect(result.current.error?.error?.name).toBe('Error');
        expect(result.current.error?.error?.statusCode).toBe(500);
    });

    it('leaves an unrelated query failure as a generic error', async () => {
        const errorResponse: ApiGetAsyncQueryResults = {
            queryUuid: 'q1',
            status: QueryHistoryStatus.ERROR,
            error: 'BigQuery quota exceeded. Query exceeded the daily quota',
            erroredAt: new Date(),
        };
        mockGetResultsPage.mockResolvedValue(errorResponse);

        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.error).not.toBeNull();
        });

        expect(result.current.error?.error?.name).toBe('Error');
    });

    it('resets pages when queryUuid changes', async () => {
        const page1Q1 = makeReadyPage(1, { queryUuid: 'q1', rows: 5 });
        const page1Q2 = makeReadyPage(1, { queryUuid: 'q2', rows: 3 });

        mockGetResultsPage
            .mockResolvedValueOnce(page1Q1)
            .mockResolvedValueOnce(page1Q2);

        let queryUuid = 'q1';
        const { result, rerender } = renderHook(
            () => useInfiniteQueryResults('p1', queryUuid),
            { wrapper: createWrapper() },
        );

        await waitFor(() => {
            expect(result.current.rows.length).toBe(5);
        });

        queryUuid = 'q2';
        rerender();

        await waitFor(() => {
            expect(result.current.rows.length).toBe(3);
        });

        expect(result.current.rows.length).toBe(3);
    });
});

describe('query result polling', () => {
    let client: QueryClient;
    const advance = async (ms: number) => {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(ms);
        });
    };
    const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(lightdashApi).mockReset();
        client = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
    });
    afterEach(() => {
        client.clear();
        focusManager.setFocused(undefined);
        vi.useRealTimers();
        vi.restoreAllMocks();
    });
    it.each([
        {
            agent: 'HeadlessChrome/150',
            delays: [250, 500, 1000, 2000, 4000, 5000, 5000],
        },
        {
            agent: 'Chrome/150',
            delays: [250, 500, 1000, 1000, 1000, 1000, 1000],
        },
    ])(
        'fetches immediately and caps backoff for $agent',
        async ({ agent, delays }) => {
            vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
            vi.mocked(lightdashApi).mockResolvedValue({
                status: QueryHistoryStatus.EXECUTING,
                queryUuid: 'q1',
            });
            const { unmount } = renderHook(
                () => useInfiniteQueryResults('p1', 'q1'),
                { wrapper },
            );
            await advance(0);
            expect(lightdashApi).toHaveBeenCalledTimes(1);
            for (const [index, delay] of delays.entries()) {
                // eslint-disable-next-line no-await-in-loop
                await advance(delay - 1);
                expect(lightdashApi).toHaveBeenCalledTimes(index + 1);
                // eslint-disable-next-line no-await-in-loop
                await advance(1);
                expect(lightdashApi).toHaveBeenCalledTimes(index + 2);
            }
            unmount();
            await advance(10000);
            expect(lightdashApi).toHaveBeenCalledTimes(delays.length + 1);
        },
    );
    it.each([
        QueryHistoryStatus.READY,
        QueryHistoryStatus.ERROR,
        QueryHistoryStatus.EXPIRED,
        QueryHistoryStatus.CANCELLED,
    ] as const)('stops polling at %s', async (status) => {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
            'HeadlessChrome/150',
        );
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.PENDING,
                queryUuid: 'q1',
            })
            .mockResolvedValue(
                status === QueryHistoryStatus.READY
                    ? makeReadyPage(1)
                    : status === QueryHistoryStatus.CANCELLED
                      ? { status, queryUuid: 'q1' }
                      : { status, error: 'failed', queryUuid: 'q1' },
            );
        const { unmount } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper },
        );
        await advance(0);
        await advance(250);
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        await advance(10000);
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        unmount();
    });
    it('resets backoff for a new query and does not refetch the old query', async () => {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
            'HeadlessChrome/150',
        );
        vi.mocked(lightdashApi).mockResolvedValue({
            status: QueryHistoryStatus.QUEUED,
            queryUuid: 'q1',
        });
        const { rerender, unmount } = renderHook(
            ({ query }) => useInfiniteQueryResults('p1', query),
            { wrapper, initialProps: { query: 'q1' } },
        );
        await advance(0);
        await advance(250);
        await advance(500);
        expect(lightdashApi).toHaveBeenCalledTimes(3);
        rerender({ query: 'q2' });
        await advance(0);
        expect(lightdashApi).toHaveBeenCalledTimes(4);
        await advance(250);
        expect(lightdashApi).toHaveBeenCalledTimes(5);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.slice(3)
                .every(([args]) => args.url.includes('/q2?')),
        ).toBe(true);
        unmount();
    });
    it('continues polling while the rendering page is in the background', async () => {
        focusManager.setFocused(false);
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
            'HeadlessChrome/150',
        );
        vi.mocked(lightdashApi).mockResolvedValue({
            status: QueryHistoryStatus.PENDING,
            queryUuid: 'q1',
        });
        const { unmount } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper },
        );
        await advance(0);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
        await advance(250);
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        unmount();
    });
    it('aborts the active fetch when unmounted', async () => {
        let signal: AbortSignal | undefined;
        vi.mocked(lightdashApi).mockImplementation(async (args) => {
            signal = args.signal ?? undefined;
            return new Promise(() => {});
        });
        const { unmount } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper },
        );
        await advance(0);
        expect(signal?.aborted).toBe(false);
        unmount();
        expect(signal?.aborted).toBe(true);
        await advance(10000);
        expect(lightdashApi).toHaveBeenCalledTimes(1);
    });
});
