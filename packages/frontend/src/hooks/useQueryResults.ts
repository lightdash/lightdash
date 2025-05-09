import {
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiSuccessEmpty,
    assertUnreachable,
    type DateGranularity,
    DEFAULT_RESULTS_PAGE_SIZE,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type MetricQuery,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ReadyQueryResultsPage,
    type ResultRow,
    sleep,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';
import useQueryError from './useQueryError';

export type QueryResultsProps = {
    projectUuid: string;
    tableId: string;
    query?: MetricQuery;
    csvLimit?: number | null; //giving null returns all results (no limit)
    chartUuid?: string;
    chartVersionUuid?: string;
    dateZoomGranularity?: DateGranularity;
    context?: string;
};

/**
 * Run query & get first results page
 */

export type ReadyQueryResultsPageWithClientFetchTimeMs =
    ReadyQueryResultsPage & {
        clientFetchTimeMs: number;
    };

const executeAsyncMetricQuery = async (
    projectUuid: string,
    data: ExecuteAsyncMetricQueryRequestParams,
    options: { signal?: AbortSignal } = {},
): Promise<ApiExecuteAsyncMetricQueryResults> =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/metric-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
        signal: options.signal,
    });

const executeAsyncSavedChartQuery = async (
    projectUuid: string,
    data: ExecuteAsyncSavedChartRequestParams,
    options: { signal?: AbortSignal } = {},
): Promise<ApiExecuteAsyncMetricQueryResults> =>
    lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/chart`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
        signal: options.signal,
    });

export const useGetReadyQueryResults = (data: QueryResultsProps | null) => {
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });

    const result = useQuery<ApiExecuteAsyncMetricQueryResults, ApiError>({
        enabled: !!data,
        queryKey: ['create-query', data],
        queryFn: ({ signal }) => {
            if (data?.chartUuid && data?.chartVersionUuid) {
                return executeAsyncSavedChartQuery(
                    data.projectUuid,
                    {
                        context: QueryExecutionContext.CHART_HISTORY,
                        chartUuid: data.chartUuid,
                        versionUuid: data.chartVersionUuid,
                    },
                    { signal },
                );
            } else if (data?.chartUuid) {
                return executeAsyncSavedChartQuery(
                    data.projectUuid,
                    {
                        context: QueryExecutionContext.CHART,
                        chartUuid: data.chartUuid,
                    },
                    { signal },
                );
            } else if (data?.query) {
                return executeAsyncMetricQuery(
                    data.projectUuid,
                    {
                        context: QueryExecutionContext.EXPLORE,
                        query: {
                            ...data.query,
                            filters: convertDateFilters(data.query.filters),
                            timezone: data.query.timezone ?? undefined,
                            exploreName: data.tableId,
                            dateZoom: data.dateZoomGranularity
                                ? {
                                      granularity: data.dateZoomGranularity,
                                  }
                                : undefined,
                        },
                        invalidateCache: true, // Note: do not cache explore queries
                    },
                    { signal },
                );
            }
            return Promise.reject(
                new ParameterError('Missing QueryResultsProps'),
            );
        },
    });

    // On Error
    useEffect(() => {
        if (result.error) {
            setErrorResponse(result.error);
        }
    }, [result.error, setErrorResponse]);

    return result;
};

/**
 * Get single results page
 */
const getResultsPage = async (
    projectUuid: string,
    queryUuid: string,
    page: number = 1,
    pageSize: number | null = null,
): Promise<ApiGetAsyncQueryResults> => {
    const searchParams = new URLSearchParams();
    if (page) {
        searchParams.set('page', page.toString());
    }
    if (pageSize) {
        searchParams.set('pageSize', pageSize.toString());
    }

    const urlQueryParams = searchParams.toString();
    return lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}${
            urlQueryParams ? `?${urlQueryParams}` : ''
        }`,
        version: 'v2',
        method: 'GET',
        body: undefined,
    });
};

export type InfiniteQueryResults = Partial<
    Pick<
        ReadyQueryResultsPage,
        'queryUuid' | 'totalResults' | 'initialQueryExecutionMs'
    >
> & {
    projectUuid?: string;
    queryStatus?: QueryHistoryStatus;
    rows: ResultRow[];
    isInitialLoading: boolean;
    isFetchingFirstPage: boolean;
    isFetchingRows: boolean;
    isFetchingAllPages: boolean;
    fetchMoreRows: () => void;
    setFetchAll: (value: boolean) => void;
    fetchAll: boolean;
    hasFetchedAllRows: boolean;
    totalClientFetchTimeMs: number | undefined;
    error: ApiError | null;
};

// This hook lazy load results has they are needed in the UI
export const useInfiniteQueryResults = (
    projectUuid?: string,
    queryUuid?: string,
): InfiniteQueryResults => {
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });
    const [fetchArgs, setFetchArgs] = useState<{
        queryUuid?: string;
        projectUuid?: string;
        page: number;
        pageSize: number;
    }>({
        queryUuid: undefined,
        projectUuid: undefined,
        page: 1,
        pageSize: DEFAULT_RESULTS_PAGE_SIZE,
    });
    const [fetchedPages, setFetchedPages] = useState<
        (ReadyQueryResultsPage & { clientFetchTimeMs: number })[]
    >([]);
    const [fetchAll, setFetchAll] = useState(false);

    const fetchMoreRows = useCallback(() => {
        const lastPage = fetchedPages[fetchedPages.length - 1];
        const nextPageToFetch = lastPage?.nextPage;
        if (nextPageToFetch && queryUuid === lastPage.queryUuid) {
            setFetchArgs((prev) => ({ ...prev, page: nextPageToFetch }));
        }
    }, [fetchedPages, queryUuid]);

    // Aggregate rows from all fetched pages
    const fetchedRows = useMemo(() => {
        const rows: ResultRow[] = [];
        for (const page of fetchedPages) {
            rows.push(...page.rows);
        }
        return rows;
    }, [fetchedPages]);

    const hasFetchedAllRows = useMemo(() => {
        if (fetchedPages.length === 0) {
            return false;
        }

        return fetchedRows.length >= fetchedPages[0].totalResults;
    }, [fetchedRows, fetchedPages]);

    const isFetchingRows = useMemo(() => {
        const isFetchingPage = fetchArgs.page > fetchedPages.length;

        return (
            !!projectUuid &&
            !!queryUuid &&
            (isFetchingPage || (fetchAll && !hasFetchedAllRows))
        );
    }, [
        fetchedPages,
        fetchArgs.page,
        projectUuid,
        queryUuid,
        fetchAll,
        hasFetchedAllRows,
    ]);

    const queryClient = useQueryClient();

    // Initial backoff time in ms
    const backoffRef = useRef(250);

    const nextPage = useQuery<
        ApiGetAsyncQueryResults & { clientFetchTimeMs: number },
        ApiError
    >({
        enabled: !!fetchArgs.projectUuid && !!fetchArgs.queryUuid,
        queryKey: ['query-page', fetchArgs],
        queryFn: async () => {
            const startTime = performance.now();
            const results = await getResultsPage(
                fetchArgs.projectUuid!,
                fetchArgs.queryUuid!,
                fetchArgs.page,
                fetchArgs.pageSize,
            );

            const { status } = results;

            const clientFetchTimeMs = performance.now() - startTime;

            switch (status) {
                case QueryHistoryStatus.ERROR: {
                    backoffRef.current = 250;
                    throw <ApiError>{
                        status: 'error',
                        error: {
                            name: 'Error',
                            statusCode: 500,
                            message: results.error ?? 'Query failed',
                            data: {},
                        },
                    };
                }
                case QueryHistoryStatus.CANCELLED: {
                    backoffRef.current = 250;
                    throw <ApiError>{
                        status: 'error',
                        error: {
                            name: 'Error',
                            statusCode: 500,
                            message: 'Query cancelled',
                            data: {},
                        },
                    };
                }
                case QueryHistoryStatus.PENDING: {
                    // Invalidate page. Note we can't use refetch as it bypasses the "enabled" check: https://github.com/TanStack/query/issues/1965
                    void sleep(backoffRef.current).then(() =>
                        queryClient.invalidateQueries([
                            'query-page',
                            fetchArgs,
                        ]),
                    );
                    // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
                    if (backoffRef.current < 1000) {
                        backoffRef.current = Math.min(
                            backoffRef.current * 2,
                            1000,
                        );
                    }
                    return {
                        ...results,
                        clientFetchTimeMs,
                    };
                }
                case QueryHistoryStatus.READY: {
                    backoffRef.current = 250;
                    return {
                        ...results,
                        clientFetchTimeMs,
                    };
                }
                default:
                    return assertUnreachable(status, 'Unknown query status');
            }
        },
        staleTime: Infinity, // the data will never be considered stale
    });
    const { data: nextPageData } = nextPage;

    // On error
    useEffect(() => {
        if (nextPage.error) {
            setErrorResponse(nextPage.error);
        }
    }, [nextPage.error, setErrorResponse]);

    useEffect(() => {
        const pageData = nextPage.data;
        if (pageData?.status === QueryHistoryStatus.READY) {
            setFetchedPages((prevState) => [...prevState, pageData]);
        }
    }, [nextPage.data]);

    useEffect(() => {
        // Reset fetched pages before updating the fetch args
        setFetchedPages([]);
        // Reset fetchAll before updating the fetch args
        setFetchAll(false);
        setFetchArgs({
            queryUuid,
            projectUuid,
            page: 1,
            pageSize: DEFAULT_RESULTS_PAGE_SIZE,
        });
    }, [projectUuid, queryUuid]);

    useEffect(() => {
        if (fetchAll) {
            // keep fetching the next page
            fetchMoreRows();
        }
    }, [fetchAll, fetchMoreRows]);

    const totalClientFetchTimeMs = useMemo(() => {
        if (fetchedPages.length === 0) {
            return undefined;
        }

        const totalPagesFetchTime = fetchAll
            ? Math.round(
                  fetchedPages.reduce((acc, page) => {
                      return acc + page.clientFetchTimeMs;
                  }, 0),
              )
            : Math.round(fetchedPages[0]?.clientFetchTimeMs ?? 0); // If we're not fetching all pages, only return the time for the first page (enough to render the viz)

        return (
            totalPagesFetchTime +
            (fetchedPages[0]?.initialQueryExecutionMs ?? 0) // Add the time it took to execute the initial query
        );
    }, [fetchAll, fetchedPages]);

    const isInitialLoading = useMemo(() => {
        return fetchAll ? !hasFetchedAllRows : fetchedPages.length < 1;
    }, [fetchedPages, fetchAll, hasFetchedAllRows]);

    return useMemo(
        () => ({
            projectUuid,
            queryUuid,
            queryStatus: nextPageData?.status, // show latest status
            totalResults: fetchedPages[0]?.totalResults,
            initialQueryExecutionMs: fetchedPages[0]?.initialQueryExecutionMs,
            hasFetchedAllRows,
            rows: fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            setFetchAll,
            totalClientFetchTimeMs,
            isInitialLoading,
            isFetchingFirstPage:
                !!queryUuid &&
                (fetchedPages[0]?.totalResults === undefined ||
                    (fetchedPages[0]?.totalResults > 0 &&
                        fetchedRows.length === 0)),
            isFetchingAllPages: !!queryUuid && fetchAll && !hasFetchedAllRows,
            fetchAll,
            error: nextPage.error,
        }),
        [
            projectUuid,
            queryUuid,
            fetchedPages,
            hasFetchedAllRows,
            fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            totalClientFetchTimeMs,
            isInitialLoading,
            fetchAll,
            nextPageData,
            nextPage.error,
        ],
    );
};

export const useCancelQuery = (projectUuid?: string, queryUuid?: string) => {
    return useMutation({
        mutationKey: ['cancel-query', projectUuid, queryUuid],
        mutationFn: () => {
            if (!projectUuid || !queryUuid) {
                throw new Error('Project UUID or Query UUID is undefined');
            }
            return lightdashApi<ApiSuccessEmpty>({
                method: 'POST',
                url: `/projects/${projectUuid}/query/${queryUuid}/cancel`,
                version: 'v2',
                body: JSON.stringify({}),
            });
        },
    });
};
