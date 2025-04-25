import {
    type ApiError,
    type ApiExecuteAsyncQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiQueryResults,
    assertUnreachable,
    type DashboardFilters,
    type DateGranularity,
    DEFAULT_RESULTS_PAGE_SIZE,
    type ExecuteAsyncQueryRequestParams,
    type MetricQuery,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ReadyQueryResultsPage,
    type ResultRow,
    sleep,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
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
 * Aggregates pagination results for a query
 */
const getQueryPaginatedResults = async (
    projectUuid: string,
    data: ExecuteAsyncQueryRequestParams,
    pageSize?: number, // pageSize is used when getting the results but not when creating the query
): Promise<
    ApiQueryResults & {
        queryUuid: string;
        appliedDashboardFilters: DashboardFilters | null;
        warehouseExecutionTimeMs?: number;
        totalClientFetchTimeMs?: number;
    }
> => {
    const startTime = new Date();

    const executeQueryResponse =
        await lightdashApi<ApiExecuteAsyncQueryResults>({
            url: `/projects/${projectUuid}/query`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify(data),
        });

    // Get all page rows in sequence
    let allRows: ResultRow[] = [];
    let currentPage: ApiGetAsyncQueryResults | undefined;
    let backoffMs = 250; // Start with 250ms

    while (
        !currentPage ||
        currentPage.status === QueryHistoryStatus.PENDING ||
        (currentPage.status === QueryHistoryStatus.READY &&
            currentPage.nextPage)
    ) {
        const page =
            currentPage?.status === QueryHistoryStatus.READY
                ? currentPage?.nextPage
                : 1;

        const searchParams = new URLSearchParams();
        if (page) {
            searchParams.set('page', page.toString());
        }
        if (pageSize) {
            searchParams.set('pageSize', pageSize.toString());
        }

        const urlQueryParams = searchParams.toString();
        currentPage = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${
                executeQueryResponse.queryUuid
            }${urlQueryParams ? `?${urlQueryParams}` : ''}`,
            version: 'v2',
            method: 'GET',
            body: undefined,
        });

        const { status } = currentPage;

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                throw <ApiError>{
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: 'Query cancelled',
                        data: {},
                    },
                };
            case QueryHistoryStatus.ERROR:
                throw <ApiError>{
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: currentPage.error ?? 'Query failed',
                        data: {},
                    },
                };
            case QueryHistoryStatus.READY:
                allRows = allRows.concat(currentPage.rows);
                break;
            case QueryHistoryStatus.PENDING:
                await sleep(backoffMs);
                // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
                if (backoffMs < 1000) {
                    backoffMs = Math.min(backoffMs * 2, 1000);
                }
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }
    }

    const endTime = new Date();
    const totalTime = endTime.getTime() - startTime.getTime();

    return {
        queryUuid: currentPage.queryUuid,
        metricQuery: currentPage.metricQuery,
        cacheMetadata: executeQueryResponse.cacheMetadata,
        rows: allRows,
        fields: currentPage.fields,
        warehouseExecutionTimeMs:
            currentPage.status === QueryHistoryStatus.READY
                ? currentPage.initialQueryExecutionMs
                : undefined,
        totalClientFetchTimeMs: totalTime,
        appliedDashboardFilters: executeQueryResponse.appliedDashboardFilters,
    };
};

export const useUnderlyingDataResults = (
    filters: MetricQuery['filters'],
    underlyingDataSourceQueryUuid?: string,
    underlyingDataItemId?: string,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useQuery<ApiQueryResults, ApiError>({
        queryKey: [
            'underlyingDataResults',
            projectUuid,
            underlyingDataSourceQueryUuid,
            underlyingDataItemId,
            filters,
        ],
        enabled: Boolean(projectUuid) && Boolean(underlyingDataSourceQueryUuid),
        queryFn: () => {
            return getQueryPaginatedResults(projectUuid!, {
                context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                underlyingDataSourceQueryUuid: underlyingDataSourceQueryUuid!,
                underlyingDataItemId,
                filters: convertDateFilters(filters),
            });
        },
        retry: false,
    });
};

/**
 * Run query & get first results page
 */

export type ReadyQueryResultsPageWithClientFetchTimeMs =
    ReadyQueryResultsPage & {
        clientFetchTimeMs: number;
    };

export const executeQuery = async (
    projectUuid: string,
    data: ExecuteAsyncQueryRequestParams,
): Promise<ApiExecuteAsyncQueryResults> =>
    lightdashApi<ApiExecuteAsyncQueryResults>({
        url: `/projects/${projectUuid}/query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });

export const useGetReadyQueryResults = (data: QueryResultsProps | null) => {
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });

    const result = useQuery<ApiExecuteAsyncQueryResults, ApiError>({
        enabled: !!data,
        queryKey: ['create-query', data],
        queryFn: () => {
            if (data?.chartUuid && data?.chartVersionUuid) {
                return executeQuery(data.projectUuid, {
                    context: QueryExecutionContext.CHART_HISTORY,
                    chartUuid: data.chartUuid,
                    versionUuid: data.chartVersionUuid,
                });
            } else if (data?.chartUuid) {
                return executeQuery(data.projectUuid, {
                    context: QueryExecutionContext.CHART,
                    chartUuid: data.chartUuid,
                });
            } else if (data?.query) {
                return executeQuery(data.projectUuid, {
                    context: QueryExecutionContext.EXPLORE,
                    query: {
                        ...data.query,
                        filters: convertDateFilters(data.query.filters),
                        timezone: data.query.timezone ?? undefined,
                        exploreName: data.tableId,
                        granularity: data.dateZoomGranularity,
                    },
                    invalidateCache: true, // Note: do not cache explore queries
                });
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
        | 'metricQuery'
        | 'queryUuid'
        | 'totalResults'
        | 'fields'
        | 'initialQueryExecutionMs'
    >
> & {
    projectUuid?: string;
    rows: ResultRow[];
    isInitialLoading: boolean;
    isFetchingFirstPage: boolean;
    isFetchingRows: boolean;
    fetchMoreRows: () => void;
    setFetchAll: (value: boolean) => void;
    fetchAll: boolean;
    hasFetchedAllRows: boolean;
    totalClientFetchTimeMs: number | undefined;
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
        const nextPageToFetch = fetchedPages[fetchedPages.length - 1]?.nextPage;
        if (nextPageToFetch) {
            setFetchArgs((prev) => ({ ...prev, page: nextPageToFetch }));
        }
    }, [fetchedPages]);

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

    const nextPage = useQuery<
        ApiGetAsyncQueryResults & { clientFetchTimeMs: number },
        ApiError
    >({
        enabled: !!fetchArgs.projectUuid && !!fetchArgs.queryUuid,
        queryKey: [
            'query-page',
            fetchArgs.projectUuid,
            fetchArgs.queryUuid,
            fetchArgs.page,
            fetchArgs.pageSize,
        ],
        queryFn: async () => {
            const startTime = performance.now();
            const results = await getResultsPage(
                fetchArgs.projectUuid!,
                fetchArgs.queryUuid!,
                fetchArgs.page,
                fetchArgs.pageSize,
            );
            return {
                ...results,
                clientFetchTimeMs: performance.now() - startTime,
            };
        },
        staleTime: Infinity, // the data will never be considered stale
    });
    const { data: nextPageData, refetch: refetchNextPage } = nextPage;

    // On error
    useEffect(() => {
        if (nextPage.error) {
            setErrorResponse(nextPage.error);
        }
    }, [nextPage.error, setErrorResponse]);

    // Initial backoff time in ms
    const backoffRef = useRef(250);
    // On success
    useEffect(() => {
        if (!nextPageData) return;
        const { status } = nextPageData;
        switch (status) {
            case QueryHistoryStatus.ERROR: {
                backoffRef.current = 250;
                setErrorResponse({
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: nextPageData.error ?? 'Query failed',
                        data: {},
                    },
                });
                break;
            }
            case QueryHistoryStatus.CANCELLED: {
                backoffRef.current = 250;
                setErrorResponse({
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: 'Query cancelled',
                        data: {},
                    },
                });
                break;
            }
            case QueryHistoryStatus.PENDING: {
                // Re-fetch page
                void sleep(backoffRef.current).then(() => refetchNextPage());
                // Implement backoff: 250ms -> 500ms -> 1000ms (then stay at 1000ms)
                if (backoffRef.current < 1000) {
                    backoffRef.current = Math.min(backoffRef.current * 2, 1000);
                }
                break;
            }
            case QueryHistoryStatus.READY: {
                backoffRef.current = 250;
                setFetchedPages((prevState) => [...prevState, nextPageData]);
                break;
            }
            default:
                return assertUnreachable(status, 'Unknown query status');
        }
    }, [nextPageData, refetchNextPage, setErrorResponse]);

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

        return fetchAll
            ? Math.round(
                  fetchedPages.reduce((acc, page) => {
                      return acc + page.clientFetchTimeMs;
                  }, 0),
              )
            : Math.round(fetchedPages[0]?.clientFetchTimeMs ?? 0); // If we're not fetching all pages, only return the time for the first page (enough to render the viz)
    }, [fetchAll, fetchedPages]);

    const isInitialLoading = useMemo(() => {
        return fetchAll ? !hasFetchedAllRows : fetchedPages.length < 1;
    }, [fetchedPages, fetchAll, hasFetchedAllRows]);

    return useMemo(
        () => ({
            projectUuid,
            queryUuid,
            metricQuery: fetchedPages[0]?.metricQuery,
            fields: fetchedPages[0]?.fields,
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
            fetchAll,
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
        ],
    );
};
