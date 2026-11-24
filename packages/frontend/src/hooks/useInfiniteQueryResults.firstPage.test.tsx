import {
    ChartType,
    DEFAULT_RESULTS_PAGE_SIZE,
    QueryHistoryStatus,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';
import {
    getFirstResultsPageSize,
    getTableTileFirstPageColumnCount,
    getUnpivotedColumnCount,
    RESULTS_FIRST_PAGE_CELL_BUDGET,
} from './resultsFirstPage';
import { useInfiniteQueryResults } from './useQueryResults';

vi.mock('../api');

import { sharedLightdashApi } from '../api';

vi.mock('./useQueryError', () => ({
    default: () => vi.fn(),
}));

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

const requests: { page: number; pageSize: number }[] = [];

const serveFromTable = (totalRows: number) => {
    (sharedLightdashApi as unknown as Mock).mockImplementation(
        async ({ url }: { url: string }) => {
            const params = new URL(url, 'http://x').searchParams;
            const page = Number(params.get('page') ?? 1);
            const pageSize = Number(
                params.get('pageSize') ?? DEFAULT_RESULTS_PAGE_SIZE,
            );
            requests.push({ page, pageSize });
            const start = (page - 1) * pageSize;
            const end = Math.min(start + pageSize, totalRows);
            const totalPageCount = Math.ceil(totalRows / pageSize);
            const result: ReadyQueryResultsPage = {
                queryUuid: 'q1',
                status: QueryHistoryStatus.READY,
                page,
                pageSize: Math.max(0, end - start),
                totalPageCount,
                nextPage: page < totalPageCount ? page + 1 : undefined,
                previousPage: page > 1 ? page - 1 : undefined,
                columns: {},
                rows: Array.from(
                    { length: Math.max(0, end - start) },
                    (_, i) => ({
                        row_id: { value: { raw: start + i, formatted: '' } },
                    }),
                ),
                metadata: {
                    performance: {
                        initialQueryExecutionMs: 1,
                        resultsPageExecutionMs: 1,
                        queueTimeMs: null,
                    },
                    preAggregate: null,
                },
                pivotDetails: null,
                totalResults: totalRows,
            };
            return result;
        },
    );
};

const rowIds = (rows: { row_id: { value: { raw: unknown } } }[]) =>
    rows.map((row) => row.row_id.value.raw as number);

const WIDE_COLUMNS = 879;

describe('getFirstResultsPageSize', () => {
    it('keeps the default page for typical widths', () => {
        expect(getFirstResultsPageSize(undefined)).toBe(
            DEFAULT_RESULTS_PAGE_SIZE,
        );
        expect(getFirstResultsPageSize(30)).toBe(DEFAULT_RESULTS_PAGE_SIZE);
        expect(
            getFirstResultsPageSize(
                RESULTS_FIRST_PAGE_CELL_BUDGET / DEFAULT_RESULTS_PAGE_SIZE,
            ),
        ).toBe(DEFAULT_RESULTS_PAGE_SIZE);
    });

    it('keeps wide first pages inside the cell budget', () => {
        const size = getFirstResultsPageSize(WIDE_COLUMNS);
        expect(size).toBeLessThan(DEFAULT_RESULTS_PAGE_SIZE);
        expect(size * WIDE_COLUMNS).toBeLessThanOrEqual(
            RESULTS_FIRST_PAGE_CELL_BUDGET,
        );
    });

    it('never goes below a screenful of rows', () => {
        expect(getFirstResultsPageSize(100_000)).toBe(25);
    });
});

describe('getUnpivotedColumnCount', () => {
    it('counts dimensions, metrics and table calculations', () => {
        expect(
            getUnpivotedColumnCount({
                dimensions: ['a', 'b'],
                metrics: ['c'],
                tableCalculations: [
                    { name: 'tc', displayName: 'tc', sql: '1' },
                ],
            }),
        ).toBe(4);
    });

    it('returns nothing for pivoted queries, whose width is unknown', () => {
        expect(
            getUnpivotedColumnCount(
                { dimensions: ['a'], metrics: ['b'], tableCalculations: [] },
                {
                    indexColumn: undefined,
                    valuesColumns: [],
                    groupByColumns: [{ reference: 'a' }],
                    sortBy: undefined,
                },
            ),
        ).toBeUndefined();
    });
});

describe('getTableTileFirstPageColumnCount', () => {
    const metricQuery = {
        exploreName: 'e',
        dimensions: ['a', 'b'],
        metrics: ['c'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    };

    it('counts columns for unpivoted table charts', () => {
        expect(
            getTableTileFirstPageColumnCount(
                { chartConfig: { type: ChartType.TABLE, config: {} } },
                metricQuery,
            ),
        ).toBe(3);
    });

    it('returns nothing for pivoted table charts', () => {
        expect(
            getTableTileFirstPageColumnCount(
                {
                    chartConfig: { type: ChartType.TABLE, config: {} },
                    pivotConfig: { columns: ['a'] },
                },
                metricQuery,
            ),
        ).toBeUndefined();
    });

    it('returns nothing for charts that are not tables', () => {
        expect(
            getTableTileFirstPageColumnCount(
                {
                    chartConfig: {
                        type: ChartType.BIG_NUMBER,
                        config: {},
                    },
                },
                metricQuery,
            ),
        ).toBeUndefined();
    });
});

describe('useInfiniteQueryResults first page size', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requests.length = 0;
    });

    it('requests the default page size when no column count is given', async () => {
        serveFromTable(2000);
        const { result } = renderHook(
            () => useInfiniteQueryResults('p1', 'q1'),
            { wrapper: createWrapper() },
        );
        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(requests).toEqual([
            { page: 1, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
        ]);
    });

    it('keeps the default page for typical widths', async () => {
        serveFromTable(2000);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: 30,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(requests).toEqual([
            { page: 1, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
        ]);
    });

    it('shows a smaller first page for wide results, then completes the first 500 rows', async () => {
        serveFromTable(2000);
        const firstPageSize = getFirstResultsPageSize(WIDE_COLUMNS);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper() },
        );

        await waitFor(() =>
            expect(result.current.rows.length).toBeGreaterThan(0),
        );
        expect(requests[0]).toEqual({ page: 1, pageSize: firstPageSize });
        expect(result.current.isFetchingFirstPage).toBe(false);
        expect(result.current.totalResults).toBe(2000);

        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(requests[1]).toEqual({
            page: 1,
            pageSize: DEFAULT_RESULTS_PAGE_SIZE,
        });
        expect(rowIds(result.current.rows as never)).toEqual(
            Array.from({ length: 500 }, (_, i) => i),
        );
        expect(result.current.isFetchingRows).toBe(false);
    });

    it('does not fetch a small second page while the first 500 rows are loading', async () => {
        serveFromTable(2000);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(result.current.rows.length).toBeGreaterThan(0),
        );
        act(() => result.current.fetchMoreRows());
        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(
            requests.filter(
                (r) => r.pageSize < DEFAULT_RESULTS_PAGE_SIZE && r.page > 1,
            ),
        ).toEqual([]);
    });

    it('reaches every row exactly once by scrolling, with the total unchanged', async () => {
        serveFromTable(2345);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper() },
        );

        for (let i = 0; i < 20 && !result.current.hasFetchedAllRows; i += 1) {
            const before = result.current.rows.length;
            act(() => result.current.fetchMoreRows());
            // eslint-disable-next-line no-await-in-loop
            await waitFor(() =>
                expect(
                    result.current.rows.length > before ||
                        result.current.hasFetchedAllRows,
                ).toBe(true),
            );
        }

        expect(result.current.hasFetchedAllRows).toBe(true);
        expect(result.current.totalResults).toBe(2345);
        expect(rowIds(result.current.rows as never)).toEqual(
            Array.from({ length: 2345 }, (_, i) => i),
        );
    });

    it('switches to full pages when every row is needed before the first page lands', async () => {
        serveFromTable(1200);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper() },
        );
        act(() => result.current.setFetchAll(true));

        await waitFor(() =>
            expect(result.current.hasFetchedAllRows).toBe(true),
        );
        expect(rowIds(result.current.rows as never)).toEqual(
            Array.from({ length: 1200 }, (_, i) => i),
        );
        expect(requests.slice(-3)).toEqual([
            { page: 1, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
            { page: 2, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
            { page: 3, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
        ]);
        expect(
            requests.filter((r) => r.pageSize !== DEFAULT_RESULTS_PAGE_SIZE),
        ).toHaveLength(1);
    });

    it('loads every row when fetch all starts after the smaller first page', async () => {
        serveFromTable(1200);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(result.current.rows.length).toBeGreaterThan(0),
        );
        act(() => result.current.setFetchAll(true));

        await waitFor(() =>
            expect(result.current.hasFetchedAllRows).toBe(true),
        );
        expect(rowIds(result.current.rows as never)).toEqual(
            Array.from({ length: 1200 }, (_, i) => i),
        );
    });

    it('needs no second request when the small first page holds every row', async () => {
        serveFromTable(10);
        const { result } = renderHook(
            () =>
                useInfiniteQueryResults('p1', 'q1', undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() =>
            expect(result.current.hasFetchedAllRows).toBe(true),
        );
        expect(result.current.rows).toHaveLength(10);
        expect(result.current.isFetchingRows).toBe(false);
        expect(requests).toHaveLength(1);
    });
});
