import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createExplorerStore } from '../features/explorer/store';
import { useExplorerQuery } from './useExplorerQuery';
import { useExplorerQueryManager } from './useExplorerQueryManager';
import {
    executeQueryAndWaitForResults,
    useCancelQuery,
} from './useQueryResults';
import { useServerFeatureFlag } from './useServerOrClientFeatureFlag';

// Mock the hooks that depend on external APIs
vi.mock('./useExplore', () => ({
    useExplore: vi.fn(() => ({ data: null })),
}));

vi.mock('./useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
}));

vi.mock('./parameters/useParameters', () => ({
    useParameters: vi.fn(() => ({ data: {} })),
}));

vi.mock('../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: vi.fn(() => [
        {
            query: { isFetched: false, isFetching: false },
            queryResults: {
                queryUuid: null,
                totalResults: 0,
                isFetchingFirstPage: false,
                isFetchingAllPages: false,
                error: null,
            },
        },
        vi.fn(),
    ]),
}));

vi.mock('./useExplorerQueryManager', () => ({
    useExplorerQueryManager: vi.fn(),
}));

vi.mock('./useQueryResults', () => ({
    executeQueryAndWaitForResults: vi.fn(),
    useCancelQuery: vi.fn(() => ({ mutate: vi.fn() })),
}));

type ManagerMock = ReturnType<typeof useExplorerQueryManager>;

const buildManagerMock = (overrides: Partial<ManagerMock> = {}): ManagerMock =>
    ({
        query: { isFetched: false, isFetching: false },
        queryResults: {
            queryUuid: null,
            totalResults: 0,
            isFetchingFirstPage: false,
            isFetchingAllPages: false,
            error: null,
        },
        unpivotedQuery: { isFetched: false, isFetching: false },
        unpivotedQueryResults: {
            queryUuid: null,
            totalResults: 0,
            isFetchingFirstPage: false,
            isFetchingAllPages: false,
            error: null,
        },
        isLoading: false,
        activeFields: new Set<string>(),
        missingRequiredParameters: null,
        validQueryArgs: null,
        tableName: '',
        projectUuid: 'p',
        explore: null,
        computedMetricQuery: {
            exploreName: '',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
        },
        parameters: {},
        runQuery: vi.fn(),
        ...overrides,
    }) as unknown as ManagerMock;

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });
    const store = createExplorerStore();

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <MemoryRouter>{children}</MemoryRouter>
            </Provider>
        </QueryClientProvider>
    );
};

describe('useExplorerQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useExplorerQueryManager).mockReturnValue(buildManagerMock());
        vi.mocked(executeQueryAndWaitForResults).mockResolvedValue({
            queryUuid: 'download-uuid',
        } as never);
        vi.mocked(useCancelQuery).mockReturnValue({
            mutate: vi.fn(),
        } as never);
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: false },
        } as never);
    });

    it('should return query state and actions', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current).toHaveProperty('query');
        expect(result.current).toHaveProperty('queryResults');
        expect(result.current).toHaveProperty('isLoading');
        expect(result.current).toHaveProperty('runQuery');
        expect(result.current).toHaveProperty('resetQueryResults');
        expect(result.current).toHaveProperty('getDownloadQueryUuid');
        expect(result.current).toHaveProperty('activeFields');
    });

    it('should compute loading state correctly', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        // Should be false initially when not fetching
        expect(result.current.isLoading).toBe(false);
    });

    it('should have empty activeFields when no dimensions/metrics selected', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current.activeFields.size).toBe(0);
    });

    it('should provide validQueryArgs as null initially', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current.validQueryArgs).toBeNull();
    });

    describe('getDownloadQueryUuid pivotConfiguration leak (#19117)', () => {
        // https://github.com/lightdash/lightdash/issues/19117 / PR #19115
        // Repro: with USE_SQL_PIVOT_RESULTS enabled and a chart that has a
        // pivotConfiguration in validQueryArgs, calling Download CSV with
        // exportPivotedResults=false used to spread pivotConfiguration into
        // the download query — producing CSVs with empty columns where
        // pivoted dimensions used to be.
        // Expectation: when exportPivotedResults is false, the download
        // query payload must explicitly set pivotConfiguration to undefined
        // (and pivotResults to false), regardless of what validQueryArgs
        // carries. The fix is a 6-line ternary; trivial to revert via
        // refactor that re-enables `...validQueryArgs` spread without the
        // override.
        const pivotConfiguration = {
            indexColumn: { reference: 'date', type: 'time' },
            valuesColumns: [{ reference: 'revenue', aggregation: 'sum' }],
            groupByColumns: [{ reference: 'category' }],
            sortBy: undefined,
        };
        const validQueryArgs = {
            projectUuid: 'p',
            tableId: 'orders',
            query: { dimensions: [], metrics: [], filters: {} },
            pivotResults: true,
            pivotConfiguration,
        } as never;

        it('omits pivotConfiguration from the download query when exportPivotedResults is false', async () => {
            vi.mocked(useExplorerQueryManager).mockReturnValue(
                buildManagerMock({
                    validQueryArgs,
                    queryResults: {
                        queryUuid: 'current-uuid',
                        totalResults: 100,
                        isFetchingFirstPage: false,
                        isFetchingAllPages: false,
                        error: null,
                    } as never,
                }),
            );
            // USE_SQL_PIVOT_RESULTS feature flag enabled — the worst-case
            // path where the leak manifested in production.
            vi.mocked(useServerFeatureFlag).mockReturnValue({
                data: { enabled: true },
            } as never);

            const { result } = renderHook(() => useExplorerQuery(), {
                wrapper: createWrapper(),
            });

            // Force a new query (limit !== totalResults) so the function
            // calls executeQueryAndWaitForResults rather than reusing the
            // existing queryUuid.
            await result.current.getDownloadQueryUuid(50, false);

            expect(executeQueryAndWaitForResults).toHaveBeenCalledTimes(1);
            const callArg = vi.mocked(executeQueryAndWaitForResults).mock
                .calls[0][0];
            expect(callArg).not.toBeNull();

            // The leak prevention: pivotConfiguration must be explicitly
            // undefined, NOT spread from validQueryArgs.
            expect(callArg).toHaveProperty('pivotConfiguration', undefined);
            expect(callArg).toHaveProperty('pivotResults', false);
            // csvLimit was actually applied so we know we hit the new-query
            // path, not the queryUuid-reuse path.
            expect(callArg).toHaveProperty('csvLimit', 50);
        });

        it('preserves pivotConfiguration in the download query when exportPivotedResults is true and the SQL pivot flag is enabled', async () => {
            vi.mocked(useExplorerQueryManager).mockReturnValue(
                buildManagerMock({
                    validQueryArgs,
                    queryResults: {
                        queryUuid: 'current-uuid',
                        totalResults: 100,
                        isFetchingFirstPage: false,
                        isFetchingAllPages: false,
                        error: null,
                    } as never,
                }),
            );
            vi.mocked(useServerFeatureFlag).mockReturnValue({
                data: { enabled: true },
            } as never);

            const { result } = renderHook(() => useExplorerQuery(), {
                wrapper: createWrapper(),
            });

            await result.current.getDownloadQueryUuid(50, true);

            expect(executeQueryAndWaitForResults).toHaveBeenCalledTimes(1);
            const callArg = vi.mocked(executeQueryAndWaitForResults).mock
                .calls[0][0];
            expect(callArg).toMatchObject({
                pivotResults: true,
                pivotConfiguration,
                csvLimit: 50,
            });
        });

        it('omits pivotConfiguration when SQL pivot flag is disabled even if exportPivotedResults is requested', async () => {
            // shouldPivot = exportPivotedResults && useSqlPivotResults.enabled.
            // Locks the second half of that ternary — flag-off should also
            // strip the configuration.
            vi.mocked(useExplorerQueryManager).mockReturnValue(
                buildManagerMock({
                    validQueryArgs,
                    queryResults: {
                        queryUuid: 'current-uuid',
                        totalResults: 100,
                        isFetchingFirstPage: false,
                        isFetchingAllPages: false,
                        error: null,
                    } as never,
                }),
            );
            vi.mocked(useServerFeatureFlag).mockReturnValue({
                data: { enabled: false },
            } as never);

            const { result } = renderHook(() => useExplorerQuery(), {
                wrapper: createWrapper(),
            });

            await result.current.getDownloadQueryUuid(50, true);

            expect(executeQueryAndWaitForResults).toHaveBeenCalledTimes(1);
            const callArg = vi.mocked(executeQueryAndWaitForResults).mock
                .calls[0][0];
            expect(callArg).toHaveProperty('pivotConfiguration', undefined);
            expect(callArg).toHaveProperty('pivotResults', false);
        });
    });
});
