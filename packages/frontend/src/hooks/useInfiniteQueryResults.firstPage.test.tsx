import {
    ChartType,
    DEFAULT_RESULTS_PAGE_SIZE,
    QueryHistoryStatus,
    SessionStorageKeys,
    type ChartConfig,
    type ReadyQueryResultsPage,
    type TableChart,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { vi, type Mock } from 'vitest';
import { COLUMN_WIDTH_SAMPLE_ROWS } from '../components/common/Table/measureColumnWidth';
import {
    canUseSmallerFirstPage,
    getExplorerProgressiveFirstPage,
    getFirstResultsPageSize,
    getTableTileFirstPageColumnCount,
    getUnpivotedColumnCount,
    isCaptureRender,
    RESULTS_FIRST_PAGE_CELL_BUDGET,
    tableNeedsAllRows,
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
const calls: {
    page: number;
    pageSize: number;
    queryUuid: string;
    signal?: AbortSignal;
}[] = [];

type ServeOptions = {
    hold?: (request: {
        page: number;
        pageSize: number;
        queryUuid: string;
    }) => Promise<void> | undefined;
    fail?: (request: {
        page: number;
        pageSize: number;
        queryUuid: string;
    }) => unknown;
};

const deferred = () => {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

const serverError = (statusCode: number) => ({
    status: 'error',
    error: {
        name: statusCode === 403 ? 'ForbiddenError' : 'Error',
        statusCode,
        message: 'Page failed',
        data: {},
    },
});

const serveFromTable = (totalRows: number, options: ServeOptions = {}) => {
    (sharedLightdashApi as unknown as Mock).mockImplementation(
        async ({ url, signal }: { url: string; signal?: AbortSignal }) => {
            const params = new URL(url, 'http://x').searchParams;
            const page = Number(params.get('page') ?? 1);
            const pageSize = Number(
                params.get('pageSize') ?? DEFAULT_RESULTS_PAGE_SIZE,
            );
            const queryUuid = url.split('/query/')[1]?.split('?')[0] ?? 'q1';
            requests.push({ page, pageSize });
            calls.push({ page, pageSize, queryUuid, signal });
            const held = options.hold?.({ page, pageSize, queryUuid });
            if (held) await held;
            const failure = options.fail?.({ page, pageSize, queryUuid });
            if (failure) throw failure;
            const start = (page - 1) * pageSize;
            const end = Math.min(start + pageSize, totalRows);
            const totalPageCount = Math.ceil(totalRows / pageSize);
            const result: ReadyQueryResultsPage = {
                queryUuid,
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

    it('never goes below the rows sampled for column widths', () => {
        expect(getFirstResultsPageSize(100_000)).toBe(COLUMN_WIDTH_SAMPLE_ROWS);
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
        calls.length = 0;
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

const WIDE_METRIC_QUERY = {
    exploreName: 'e',
    dimensions: Array.from({ length: WIDE_COLUMNS }, (_, i) => `d${i}`),
    metrics: [],
    filters: {},
    sorts: [],
    limit: 5000,
    tableCalculations: [],
};

const tableChart = (config: TableChart = {}) => ({
    chartConfig: { type: ChartType.TABLE, config } as ChartConfig,
});

describe('tables that need every row', () => {
    it.each([
        ['subtotals', { showSubtotals: true }],
        [
            'show the last N rows',
            { rowLimit: { mode: 'show', direction: 'last', count: 10 } },
        ],
        [
            'hide the first N rows',
            { rowLimit: { mode: 'hide', direction: 'first', count: 10 } },
        ],
        [
            'hide the last N rows',
            { rowLimit: { mode: 'hide', direction: 'last', count: 10 } },
        ],
    ] as [string, TableChart][])('%s', (_name, config) => {
        expect(tableNeedsAllRows(config)).toBe(true);
        expect(
            getTableTileFirstPageColumnCount(
                tableChart(config),
                WIDE_METRIC_QUERY,
            ),
        ).toBeUndefined();
        expect(
            canUseSmallerFirstPage({
                chartConfig: tableChart(config).chartConfig,
            }),
        ).toBe(false);
    });

    it.each([
        ['no row limit', {}],
        [
            'show the first N rows',
            { rowLimit: { mode: 'show', direction: 'first', count: 10 } },
        ],
        [
            'an empty row limit',
            { rowLimit: { mode: 'hide', direction: 'last', count: 0 } },
        ],
    ] as [string, TableChart][])('not for %s', (_name, config) => {
        expect(tableNeedsAllRows(config)).toBe(false);
        expect(
            getTableTileFirstPageColumnCount(
                tableChart(config),
                WIDE_METRIC_QUERY,
            ),
        ).toBe(WIDE_COLUMNS);
    });

    it.each([
        ['subtotals', { showSubtotals: true }],
        [
            'last N',
            { rowLimit: { mode: 'show', direction: 'last', count: 10 } },
        ],
        [
            'hide N',
            { rowLimit: { mode: 'hide', direction: 'first', count: 10 } },
        ],
    ] as [string, TableChart][])(
        'sends only 500-row pages for a wide table with %s',
        async (_name, config) => {
            vi.clearAllMocks();
            requests.length = 0;
            serveFromTable(1200);
            const { result } = renderHook(
                () => {
                    const results = useInfiniteQueryResults(
                        'p1',
                        'q1',
                        undefined,
                        null,
                        {
                            firstPageColumnCount:
                                getTableTileFirstPageColumnCount(
                                    tableChart(config),
                                    WIDE_METRIC_QUERY,
                                ),
                        },
                    );
                    return results;
                },
                { wrapper: createWrapper() },
            );
            act(() => result.current.setFetchAll(true));
            await waitFor(() =>
                expect(result.current.hasFetchedAllRows).toBe(true),
            );
            expect(requests).toEqual([
                { page: 1, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
                { page: 2, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
                { page: 3, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
            ]);
        },
    );
});

describe('canUseSmallerFirstPage', () => {
    it('allows unpivoted table charts', () => {
        expect(
            canUseSmallerFirstPage({ chartConfig: tableChart().chartConfig }),
        ).toBe(true);
    });

    it.each([
        ChartType.CARTESIAN,
        ChartType.BIG_NUMBER,
        ChartType.PIE,
        ChartType.CUSTOM,
    ])('keeps the full first page for %s charts', (type) => {
        expect(
            canUseSmallerFirstPage({
                chartConfig: { type, config: {} } as ChartConfig,
            }),
        ).toBe(false);
    });

    it('keeps the full first page for pivoted tables', () => {
        expect(
            canUseSmallerFirstPage({
                chartConfig: tableChart().chartConfig,
                pivotColumns: ['a'],
            }),
        ).toBe(false);
    });

    it('keeps the full first page for screenshot, export and unfurl renders', () => {
        expect(
            canUseSmallerFirstPage({
                chartConfig: tableChart().chartConfig,
                captureMode: true,
            }),
        ).toBe(false);
        expect(
            getTableTileFirstPageColumnCount(tableChart(), WIDE_METRIC_QUERY, {
                captureMode: true,
            }),
        ).toBeUndefined();
    });
});

describe('getExplorerProgressiveFirstPage', () => {
    const explore = (
        chartConfig: ChartConfig,
        overrides: Partial<{
            pivotColumns: string[];
            minimal: boolean;
            captureMode: boolean;
        }> = {},
    ) =>
        getExplorerProgressiveFirstPage({
            chartConfig,
            minimal: false,
            captureMode: false,
            ...overrides,
        });

    it('uses the smaller first page for an Explore table', () => {
        expect(explore(tableChart().chartConfig)).toEqual({
            main: true,
            unpivoted: true,
        });
    });

    it('keeps the full first page for the chart query of a non-table chart', () => {
        expect(
            explore({ type: ChartType.CARTESIAN, config: undefined }),
        ).toEqual({ main: false, unpivoted: true });
    });

    it('keeps the full first page for a table with subtotals or a pivot', () => {
        expect(
            explore(tableChart({ showSubtotals: true }).chartConfig).main,
        ).toBe(false);
        expect(
            explore(tableChart().chartConfig, { pivotColumns: ['a'] }).main,
        ).toBe(false);
    });

    it.each(['minimal', 'captureMode'] as const)(
        'keeps the full first page for both queries in %s renders',
        (flag) => {
            expect(explore(tableChart().chartConfig, { [flag]: true })).toEqual(
                {
                    main: false,
                    unpivoted: false,
                },
            );
        },
    );
});

describe('isCaptureRender', () => {
    afterEach(() => window.sessionStorage.clear());

    it('is off in a normal browser session', () => {
        expect(isCaptureRender()).toBe(false);
    });

    it('is on when the headless browser marks the session', () => {
        window.sessionStorage.setItem(
            SessionStorageKeys.HEADLESS_CAPTURE,
            JSON.stringify(true),
        );
        expect(isCaptureRender()).toBe(true);
    });
});

describe('useInfiniteQueryResults while the first 500 rows load', () => {
    const firstPageSize = getFirstResultsPageSize(WIDE_COLUMNS);
    const isExpansion = (r: { page: number; pageSize: number }) =>
        r.page === 1 && r.pageSize === DEFAULT_RESULTS_PAGE_SIZE;

    beforeEach(() => {
        vi.clearAllMocks();
        requests.length = 0;
        calls.length = 0;
    });

    const renderWide = (queryUuid = 'q1') =>
        renderHook(
            ({ uuid }: { uuid: string }) =>
                useInfiniteQueryResults('p1', uuid, undefined, null, {
                    firstPageColumnCount: WIDE_COLUMNS,
                }),
            { wrapper: createWrapper(), initialProps: { uuid: queryUuid } },
        );

    it('shows exactly the small page, ignores scrolling, then swaps in 500 rows', async () => {
        const expansion = deferred();
        serveFromTable(2000, {
            hold: (r) => (isExpansion(r) ? expansion.promise : undefined),
        });
        const { result } = renderWide();

        await waitFor(() => expect(calls.some(isExpansion)).toBe(true));
        expect(result.current.rows).toHaveLength(firstPageSize);
        expect(result.current.isExpandingFirstPage).toBe(true);
        expect(result.current.isFetchingFirstPage).toBe(false);

        act(() => result.current.fetchMoreRows());
        act(() => result.current.fetchMoreRows());
        expect(requests).toEqual([
            { page: 1, pageSize: firstPageSize },
            { page: 1, pageSize: DEFAULT_RESULTS_PAGE_SIZE },
        ]);

        expansion.resolve();
        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(result.current.isExpandingFirstPage).toBe(false);
        expect(result.current.isFetchingRows).toBe(false);
    });

    it('keeps the small page when the 500-row request fails, then retries', async () => {
        let failExpansion = true;
        serveFromTable(2000, {
            fail: (r) =>
                isExpansion(r) && failExpansion ? serverError(500) : undefined,
        });
        const { result } = renderWide();

        await waitFor(() =>
            expect(result.current.rowsExpansionError).not.toBeNull(),
        );
        expect(result.current.rows).toHaveLength(firstPageSize);
        expect(result.current.error).toBeNull();
        expect(result.current.isFetchingRows).toBe(false);
        expect(result.current.isExpandingFirstPage).toBe(false);

        failExpansion = false;
        act(() => result.current.retryFetchRows?.());

        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(result.current.rowsExpansionError).toBeNull();
        expect(result.current.error).toBeNull();
        expect(requests.filter(isExpansion)).toHaveLength(2);
    });

    it('still reports a permission error on the 500-row request as a tile error', async () => {
        serveFromTable(2000, {
            fail: (r) => (isExpansion(r) ? serverError(403) : undefined),
        });
        const { result } = renderWide();

        await waitFor(() => expect(result.current.error).not.toBeNull());
        expect(result.current.error?.error.statusCode).toBe(403);
    });

    it('cancels the 500-row request when the query changes', async () => {
        serveFromTable(2000, {
            hold: (r) =>
                isExpansion(r) && r.queryUuid === 'q1'
                    ? new Promise<void>(() => undefined)
                    : undefined,
        });
        const { result, rerender } = renderWide('q1');
        await waitFor(() => expect(calls.some(isExpansion)).toBe(true));
        const pending = calls.find(isExpansion)!;
        expect(pending.signal).toBeDefined();
        expect(pending.signal?.aborted).toBe(false);

        rerender({ uuid: 'q2' });

        await waitFor(() => expect(pending.signal?.aborted).toBe(true));
        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(result.current.queryUuid).toBe('q2');
    });

    it('cancels the 500-row request on unmount', async () => {
        serveFromTable(2000, {
            hold: (r) =>
                isExpansion(r) ? new Promise<void>(() => undefined) : undefined,
        });
        const { unmount } = renderWide();
        await waitFor(() => expect(calls.some(isExpansion)).toBe(true));
        const pending = calls.find(isExpansion)!;

        unmount();

        await waitFor(() => expect(pending.signal?.aborted).toBe(true));
    });

    it('reuses cached pages on remount without new requests', async () => {
        serveFromTable(2000);
        const queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        const render = () =>
            renderHook(
                () =>
                    useInfiniteQueryResults('p1', 'q1', undefined, null, {
                        firstPageColumnCount: WIDE_COLUMNS,
                    }),
                { wrapper },
            );
        const first = render();
        await waitFor(() =>
            expect(first.result.current.rows).toHaveLength(500),
        );
        first.unmount();
        const requestCount = requests.length;

        const second = render();
        await waitFor(() =>
            expect(second.result.current.rows).toHaveLength(500),
        );
        expect(rowIds(second.result.current.rows as never)).toEqual(
            Array.from({ length: 500 }, (_, i) => i),
        );
        expect(requests).toHaveLength(requestCount);
        expect(second.result.current.isFetchingRows).toBe(false);
    });

    it('keeps the time to the first visible rows after the swap', async () => {
        serveFromTable(2000, {
            hold: (r) =>
                isExpansion(r)
                    ? new Promise<void>((resolve) => {
                          setTimeout(resolve, 200);
                      })
                    : undefined,
        });
        const { result } = renderWide();

        await waitFor(() =>
            expect(result.current.rows.length).toBeGreaterThan(0),
        );
        const firstVisible = result.current.totalClientFetchTimeMs;
        expect(firstVisible).toBeDefined();
        await waitFor(() => expect(result.current.rows).toHaveLength(500));
        expect(result.current.totalClientFetchTimeMs).toBe(firstVisible);
        expect(result.current.totalClientFetchTimeMs).toBeLessThan(150);
    });
});
