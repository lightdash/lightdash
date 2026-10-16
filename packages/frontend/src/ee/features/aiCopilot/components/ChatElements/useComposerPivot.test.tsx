import {
    DEFAULT_RESULTS_PAGE_SIZE,
    DimensionType,
    QueryHistoryStatus,
    QuerySourceType,
    VizAggregationOptions,
    VizIndexType,
    type PivotChartLayout,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../../../api';
import {
    pollForResults,
    readPivotQueryResults,
} from '../../../../../features/queryRunner/executeQuery';
import { useComposerPivot } from './useComposerPivot';

vi.mock('../../../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../../../features/queryRunner/executeQuery', () => ({
    pollForResults: vi.fn(),
    readPivotQueryResults: vi.fn(),
}));

const layout: PivotChartLayout = {
    x: { reference: 'x', type: VizIndexType.CATEGORY },
    y: [{ reference: 'y', aggregation: VizAggregationOptions.SUM }],
    groupBy: undefined,
    sortBy: undefined,
};
const pivotConfiguration = {
    indexColumn: layout.x,
    valuesColumns: layout.y,
    groupByColumns: layout.groupBy,
    sortBy: layout.sortBy,
};
const originalColumns = {
    original: { reference: 'original', type: DimensionType.NUMBER },
};
const readyPage = {
    status: QueryHistoryStatus.READY,
    queryUuid: 'pivot',
    columns: { x: { reference: 'x', type: DimensionType.NUMBER } },
    rows: [{ x: { value: { raw: 1, formatted: '1' } } }],
    pivotDetails: {
        totalColumnCount: 1,
        indexColumn: layout.x,
        valuesColumns: [],
        groupByColumns: undefined,
        sortBy: undefined,
        originalColumns,
    },
    page: 1,
    pageSize: DEFAULT_RESULTS_PAGE_SIZE,
    totalPageCount: 1,
    totalResults: 1,
    nextPage: undefined,
    previousPage: undefined,
    metadata: {
        performance: {
            initialQueryExecutionMs: null,
            resultsPageExecutionMs: 1,
            queueTimeMs: null,
        },
        preAggregate: null,
    },
} satisfies ReadyQueryResultsPage;

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, cacheTime: 0 } },
    });
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useComposerPivot', () => {
    beforeEach(() => vi.resetAllMocks());

    it('submits and polls a pivot through the artifact routes', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ queryUuid: 'pivot' })
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.PENDING,
                queryUuid: 'pivot',
            })
            .mockResolvedValueOnce(readyPage);
        const { result } = renderHook(
            () =>
                useComposerPivot({
                    projectUuid: 'p',
                    queryUuid: 'source',
                    layout,
                    artifact: {
                        agentUuid: 'a',
                        artifactUuid: 'art',
                        versionUuid: 'v',
                    },
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenNthCalledWith(1, {
            url: '/projects/p/aiAgents/a/artifacts/art/versions/v/pivot-query',
            method: 'POST',
            body: JSON.stringify({
                queryUuid: 'source',
                pivotConfiguration,
            }),
        });
        const resultsRequest = {
            url: `/projects/p/aiAgents/a/artifacts/art/versions/v/query-results?queryUuid=pivot&cached=false&page=1&pageSize=${DEFAULT_RESULTS_PAGE_SIZE}`,
            method: 'GET',
        };
        expect(lightdashApi).toHaveBeenNthCalledWith(2, resultsRequest);
        expect(lightdashApi).toHaveBeenNthCalledWith(3, resultsRequest);
        expect(result.current.data?.pivotChartData.results).toEqual([{ x: 1 }]);
        expect(result.current.data?.originalColumns).toEqual(originalColumns);
        expect(pollForResults).not.toHaveBeenCalled();
        expect(readPivotQueryResults).not.toHaveBeenCalled();
    });

    it('reads every pivot page through the artifact route', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({ queryUuid: 'pivot' })
            .mockResolvedValueOnce({ ...readyPage, nextPage: 2 })
            .mockResolvedValueOnce({
                ...readyPage,
                rows: [{ x: { value: { raw: 2, formatted: '2' } } }],
            });
        const { result } = renderHook(
            () =>
                useComposerPivot({
                    projectUuid: 'p',
                    queryUuid: 'source',
                    layout,
                    artifact: {
                        agentUuid: 'a',
                        artifactUuid: 'art',
                        versionUuid: 'v',
                    },
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(result.current.data?.pivotChartData.results).toEqual([
            { x: 1 },
            { x: 2 },
        ]);
        expect(lightdashApi).toHaveBeenNthCalledWith(3, {
            url: `/projects/p/aiAgents/a/artifacts/art/versions/v/query-results?queryUuid=pivot&cached=false&page=2&pageSize=${DEFAULT_RESULTS_PAGE_SIZE}`,
            method: 'GET',
        });
    });

    it.each([
        {
            status: QueryHistoryStatus.ERROR,
            error: 'Access refused',
            message: 'Access refused',
        },
        {
            status: QueryHistoryStatus.EXPIRED,
            error: null,
            message: 'Results expired',
        },
        {
            status: QueryHistoryStatus.CANCELLED,
            message: 'Pivot query was cancelled',
        },
    ] as const)(
        'reports a $status artifact pivot',
        async ({ message, ...response }) => {
            vi.mocked(lightdashApi)
                .mockResolvedValueOnce({ queryUuid: 'pivot' })
                .mockResolvedValueOnce({ queryUuid: 'pivot', ...response });
            const { result } = renderHook(
                () =>
                    useComposerPivot({
                        projectUuid: 'p',
                        queryUuid: 'source',
                        layout,
                        artifact: {
                            agentUuid: 'a',
                            artifactUuid: 'art',
                            versionUuid: 'v',
                        },
                    }),
                { wrapper: createWrapper() },
            );
            await waitFor(() => expect(result.current.isError).toBe(true));
            expect(result.current.error?.message).toBe(message);
            expect(lightdashApi).toHaveBeenCalledTimes(2);
        },
    );

    it('uses the generic query path without an artifact', async () => {
        vi.mocked(lightdashApi).mockResolvedValue({
            queries: [
                {
                    nodeId: 'viz_pivot',
                    sourceType: QuerySourceType.DUCKDB,
                    queryUuid: 'pivot',
                },
            ],
        });
        vi.mocked(pollForResults).mockResolvedValue(readyPage);
        vi.mocked(readPivotQueryResults).mockResolvedValue({
            queryUuid: 'pivot',
            fileUrl: '/api/v2/projects/p/query/pivot/results',
            results: [{ x: 1 }],
            columns: { x: { reference: 'x', type: DimensionType.NUMBER } },
            indexColumn: layout.x,
            valuesColumns: [],
            columnCount: 1,
            originalColumns,
        });
        const { result } = renderHook(
            () =>
                useComposerPivot({
                    projectUuid: 'p',
                    queryUuid: 'source',
                    layout,
                    artifact: null,
                }),
            { wrapper: createWrapper() },
        );
        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/p/query-sources/queries',
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                queries: [
                    {
                        sourceType: QuerySourceType.DUCKDB,
                        nodeId: 'viz_pivot',
                        sql: 'SELECT * FROM src',
                        references: { src: 'source' },
                        pivotConfiguration,
                    },
                ],
            }),
        });
        expect(pollForResults).toHaveBeenCalledWith('p', 'pivot');
        expect(readPivotQueryResults).toHaveBeenCalledWith('p', readyPage);
    });
});
