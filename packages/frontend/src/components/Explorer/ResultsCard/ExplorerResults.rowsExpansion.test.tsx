import {
    DEFAULT_RESULTS_PAGE_SIZE,
    QueryHistoryStatus,
    type ReadyQueryResultsPage,
} from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';

const { harness } = vi.hoisted(() => ({
    harness: {
        source: 'main' as 'main' | 'unpivoted',
        useExplorerQuery: (() => ({})) as () => unknown,
    },
}));

vi.mock('../../../api');

vi.mock('../../../hooks/useQueryError', () => ({
    default: () => vi.fn(),
}));

vi.mock('../../../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => harness.useExplorerQuery(),
}));

vi.mock('../../../features/explorer/store', () => {
    const value =
        <T,>(v: T) =>
        () =>
            v;
    return {
        explorerActions: {
            setColumnOrder: vi.fn(),
            removeField: vi.fn(),
        },
        selectAdditionalMetrics: value([]),
        selectChartConfig: value({ type: 'table', config: {} }),
        selectColumnOrder: value(['orders_id']),
        selectDimensions: value(['orders_id']),
        selectMetrics: value([]),
        selectCustomDimensions: value([]),
        selectIsEditMode: value(false),
        selectParameters: value(undefined),
        selectTableCalculations: value([]),
        selectTableName: value('orders'),
        useExplorerDispatch: () => vi.fn(),
        useExplorerSelector: (selector: () => unknown) => selector(),
    };
});

vi.mock('../../../ee/providers/Embed/useUiStrings', () => ({
    useUiStrings: () => (key: string) => key,
}));

vi.mock('../../../features/mergeQuery/context/useMerge', () => ({
    useMergeSafe: () => null,
}));

vi.mock('../../../hooks/useAsyncCalculateTotal', () => ({
    useColumnTotalsEnabledByDefault: () => false,
}));

vi.mock('../../../hooks/useColumns', () => ({
    useColumns: () => [{ id: 'orders_id' }],
}));

vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, isInitialLoading: false }),
}));

vi.mock('../useIsResultsStale', () => ({
    useIsResultsStale: () => false,
}));

vi.mock('./useGroupedResultsAvailability', () => ({
    useGroupedResultsAvailability: () => ({
        hasPivotColumns: harness.source === 'unpivoted',
        canShowGroupedResults: false,
    }),
}));

vi.mock('./usePivotTableData', () => ({
    usePivotTableData: () => ({
        isLoading: false,
        data: undefined,
        error: null,
    }),
}));

vi.mock('./CellContextMenu', () => ({ default: () => null }));
vi.mock('./ColumnHeaderContextMenu', () => ({ default: () => null }));
vi.mock('./ExplorerResultsNonIdealStates', () => ({
    EmptyStateExploreLoading: () => null,
    EmptyStateNoColumns: () => null,
    EmptyStateNoTableData: () => null,
    ExploreLoadingState: () => null,
    MissingRequiredParameters: () => null,
    NoTableSelected: () => null,
}));
vi.mock('../../common/RunningBar', () => ({ default: () => null }));
vi.mock('../../common/PivotTable', () => ({ default: () => null }));

vi.mock('../../common/Table', () => ({
    default: ({
        status,
        data,
        notice,
    }: {
        status: string;
        data: unknown[];
        notice?: React.ReactNode;
    }) => (
        <div>
            <span data-testid="table-status">{status}</span>
            <span data-testid="table-rows">{data.length}</span>
            {notice}
        </div>
    ),
}));

/* eslint-disable import/first */
import { sharedLightdashApi } from '../../../api';
import { getFirstResultsPageSize } from '../../../hooks/resultsFirstPage';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
import { ExplorerResults } from './ExplorerResults';
import { ResultsViewMode } from './types';
/* eslint-enable import/first */

const WIDE_COLUMNS = 879;
const TOTAL_ROWS = 2000;

let failExpansion = true;

const isExpansion = (page: number, pageSize: number) =>
    page === 1 && pageSize === DEFAULT_RESULTS_PAGE_SIZE;

const serveRows = () => {
    (sharedLightdashApi as unknown as Mock).mockImplementation(
        async ({ url }: { url: string }) => {
            const params = new URL(url, 'http://x').searchParams;
            const page = Number(params.get('page') ?? 1);
            const pageSize = Number(
                params.get('pageSize') ?? DEFAULT_RESULTS_PAGE_SIZE,
            );
            const queryUuid = url.split('/query/')[1]?.split('?')[0] ?? 'q1';
            if (
                queryUuid === `q-${harness.source}` &&
                failExpansion &&
                isExpansion(page, pageSize)
            ) {
                throw {
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: 'Page failed',
                        data: {},
                    },
                };
            }
            const start = (page - 1) * pageSize;
            const end = Math.min(start + pageSize, TOTAL_ROWS);
            const totalPageCount = Math.ceil(TOTAL_ROWS / pageSize);
            const result: ReadyQueryResultsPage = {
                queryUuid,
                status: QueryHistoryStatus.READY,
                page,
                pageSize: end - start,
                totalPageCount,
                nextPage: page < totalPageCount ? page + 1 : undefined,
                previousPage: page > 1 ? page - 1 : undefined,
                columns: {},
                rows: Array.from({ length: end - start }, (_, i) => ({
                    orders_id: { value: { raw: start + i, formatted: '' } },
                })),
                metadata: {
                    performance: {
                        initialQueryExecutionMs: 1,
                        resultsPageExecutionMs: 1,
                        queueTimeMs: null,
                    },
                    preAggregate: null,
                },
                pivotDetails: null,
                totalResults: TOTAL_ROWS,
            };
            return result;
        },
    );
};

const readyQuery = (queryUuid: string) => ({
    data: { queryUuid, metricQuery: { dimensions: ['orders_id'] } },
    isFetching: false,
    status: 'success',
    error: null,
});

const useHarnessQuery = () => {
    const queryResults = useInfiniteQueryResults(
        'p1',
        'q-main',
        undefined,
        null,
        {
            firstPageColumnCount:
                harness.source === 'main' ? WIDE_COLUMNS : undefined,
        },
    );
    const unpivotedQueryResults = useInfiniteQueryResults(
        'p1',
        harness.source === 'unpivoted' ? 'q-unpivoted' : undefined,
        undefined,
        null,
        { firstPageColumnCount: WIDE_COLUMNS },
    );
    return {
        query: readyQuery('q-main'),
        queryResults,
        unpivotedQuery: readyQuery('q-unpivoted'),
        unpivotedQueryResults,
        unpivotedEnabled: harness.source === 'unpivoted',
        missingRequiredParameters: undefined,
        projectUuid: 'p1',
    };
};

describe('Explore results table when the first 500 rows fail to load', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        failExpansion = true;
        harness.useExplorerQuery = useHarnessQuery;
        serveRows();
    });

    it.each(['main', 'unpivoted'] as const)(
        'shows a retry on the %s results, and the retry loads 500 rows',
        async (source) => {
            harness.source = source;
            renderWithProviders(
                <ExplorerResults viewMode={ResultsViewMode.RESULTS} />,
            );

            await waitFor(() =>
                expect(screen.getByTestId('table-rows')).toHaveTextContent(
                    String(getFirstResultsPageSize(WIDE_COLUMNS)),
                ),
            );
            const retry = await screen.findByRole('button', {
                name: /retry/i,
            });
            expect(
                screen.getByText(/the rest of the rows did not load/i),
            ).toBeInTheDocument();
            expect(screen.getByTestId('table-rows')).toHaveTextContent(
                String(getFirstResultsPageSize(WIDE_COLUMNS)),
            );
            expect(screen.getByTestId('table-status')).toHaveTextContent(
                'success',
            );

            failExpansion = false;
            fireEvent.click(retry);

            await waitFor(() =>
                expect(screen.getByTestId('table-rows')).toHaveTextContent(
                    String(DEFAULT_RESULTS_PAGE_SIZE),
                ),
            );
            expect(
                screen.queryByText(/the rest of the rows did not load/i),
            ).toBeNull();
        },
    );
});
