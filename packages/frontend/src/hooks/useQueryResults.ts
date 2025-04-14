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
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
        totalTimeMs?: number;
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
        totalTimeMs: totalTime,
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
export const executeQueryAndGetFirstPage = async (
    projectUuid: string,
    data: ExecuteAsyncQueryRequestParams,
): Promise<ReadyQueryResultsPage & ApiExecuteAsyncQueryResults> => {
    const query = await lightdashApi<ApiExecuteAsyncQueryResults>({
        url: `/projects/${projectUuid}/query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });
    let firstPage: ApiGetAsyncQueryResults | undefined;
    let backoffMs = 250; // Start with 250ms

    // Wait for first page
    while (!firstPage || firstPage.status === QueryHistoryStatus.PENDING) {
        firstPage = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${query.queryUuid}?pageSize=${DEFAULT_RESULTS_PAGE_SIZE}`,
            version: 'v2',
            method: 'GET',
            body: undefined,
        });

        const { status } = firstPage;

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
                        message: firstPage.error ?? 'Query failed',
                        data: {},
                    },
                };
            case QueryHistoryStatus.READY:
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

    return {
        ...(firstPage as ReadyQueryResultsPage),
        ...query,
    };
};

export const useGetReadyQueryResults = (data: QueryResultsProps | null) => {
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });

    const result = useQuery<
        ReadyQueryResultsPage & ApiExecuteAsyncQueryResults,
        ApiError
    >({
        enabled: !!data,
        queryKey: ['create-query', data],
        queryFn: () => {
            if (data?.chartUuid && data?.chartVersionUuid) {
                return executeQueryAndGetFirstPage(data.projectUuid, {
                    context: QueryExecutionContext.CHART_HISTORY,
                    chartUuid: data.chartUuid,
                    versionUuid: data.chartVersionUuid,
                });
            } else if (data?.chartUuid) {
                return executeQueryAndGetFirstPage(data.projectUuid, {
                    context: QueryExecutionContext.CHART,
                    chartUuid: data.chartUuid,
                });
            } else if (data?.query) {
                return executeQueryAndGetFirstPage(data.projectUuid, {
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

    // On Success
    useEffect(() => {
        if (result.data) {
            queryClient.setQueryData(
                [
                    'query-page',
                    data?.projectUuid,
                    result.data.queryUuid,
                    1,
                    DEFAULT_RESULTS_PAGE_SIZE,
                ],
                result.data,
            );
        }
    }, [data?.projectUuid, result.data, queryClient]);

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
): Promise<ReadyQueryResultsPage> => {
    const searchParams = new URLSearchParams();
    if (page) {
        searchParams.set('page', page.toString());
    }
    if (pageSize) {
        searchParams.set('pageSize', pageSize.toString());
    }

    const urlQueryParams = searchParams.toString();
    const currentPage = await lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}${
            urlQueryParams ? `?${urlQueryParams}` : ''
        }`,
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
        case QueryHistoryStatus.PENDING:
            throw <ApiError>{
                status: 'error',
                error: {
                    name: 'Error',
                    statusCode: 500,
                    message: 'Query pending',
                    data: {},
                },
            };
        case QueryHistoryStatus.READY:
            return currentPage;
        default:
            return assertUnreachable(status, 'Unknown query status');
    }
};

export type InfiniteQueryResults = Partial<
    Pick<
        ReadyQueryResultsPage,
        'metricQuery' | 'queryUuid' | 'totalResults' | 'fields'
    >
> & {
    projectUuid?: string;
    rows: ResultRow[];
    isFetchingRows: boolean;
    fetchMoreRows: () => void;
    setFetchAll: (value: boolean) => void;
    hasFetchedAllRows: boolean;
    totalTimeMs: number | undefined;
    fetchAll: boolean;
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
    const [fetchedPages, setFetchedPages] = useState<ReadyQueryResultsPage[]>(
        [],
    );
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

    const nextPage = useQuery<ReadyQueryResultsPage, ApiError>({
        enabled: !!fetchArgs.projectUuid && !!fetchArgs.queryUuid,
        queryKey: [
            'query-page',
            fetchArgs.projectUuid,
            fetchArgs.queryUuid,
            fetchArgs.page,
            fetchArgs.pageSize,
        ],
        queryFn: () => {
            return getResultsPage(
                fetchArgs.projectUuid!,
                fetchArgs.queryUuid!,
                fetchArgs.page,
                fetchArgs.pageSize,
            );
        },
        staleTime: Infinity, // the data will never be considered stale
    });

    // On error
    useEffect(() => {
        if (nextPage.error) {
            setErrorResponse(nextPage.error);
        }
    }, [nextPage.error, setErrorResponse]);

    // On success
    useEffect(() => {
        if (nextPage.data) {
            setFetchedPages((prevState) => [...prevState, nextPage.data]);
        }
    }, [nextPage.data]);

    useEffect(() => {
        // Reset fetched pages before updating the fetch args
        setFetchedPages([]);
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

    const totalTimeMs = useMemo(() => {
        if (fetchedPages.length === 0) {
            return undefined;
        }

        return fetchAll
            ? fetchedPages.reduce((acc, page) => {
                  return acc + page.resultsPageExecutionMs;
              }, 0)
            : fetchedPages[0]?.resultsPageExecutionMs; // If we're not fetching all pages, only return the time for the first page (enough to render the viz)
    }, [fetchAll, fetchedPages]);

    return useMemo(
        () => ({
            projectUuid,
            queryUuid,
            metricQuery: fetchedPages[0]?.metricQuery,
            fields: fetchedPages[0]?.fields,
            totalResults: fetchedPages[0]?.totalResults,
            hasFetchedAllRows,
            rows: fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            setFetchAll,
            fetchAll,
            totalTimeMs,
        }),
        [
            projectUuid,
            queryUuid,
            fetchedPages,
            hasFetchedAllRows,
            fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            fetchAll,
            totalTimeMs,
        ],
    );
};
