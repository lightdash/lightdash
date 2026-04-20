import {
    QueryHistoryStatus,
    type ApiGetAsyncQueryResults,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
