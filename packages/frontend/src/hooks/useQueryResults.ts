import {
    type ApiError,
    type ApiExecuteAsyncQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiQueryResults,
    assertUnreachable,
    type DashboardFilters,
    type DateGranularity,
    type ExecuteAsyncQueryRequestParams,
    FeatureFlags,
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
import { useFeatureFlag } from './useFeatureFlagEnabled';
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
export const getQueryPaginatedResults = async (
    projectUuid: string,
    data: ExecuteAsyncQueryRequestParams,
    pageSize?: number, // pageSize is used when getting the results but not when creating the query
): Promise<
    ApiQueryResults & {
        queryUuid: string;
        appliedDashboardFilters: DashboardFilters | null;
    }
> => {
    const firstPage = await lightdashApi<ApiExecuteAsyncQueryResults>({
        url: `/projects/${projectUuid}/query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });

    // Get all page rows in sequence
    let allRows: ResultRow[] = [];
    let currentPage: ApiGetAsyncQueryResults | undefined;

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
            url: `/projects/${projectUuid}/query/${firstPage.queryUuid}${
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
            case QueryHistoryStatus.READY:
                allRows = allRows.concat(currentPage.rows);
                break;
            case QueryHistoryStatus.PENDING:
                await sleep(200);
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }
    }

    return {
        queryUuid: currentPage.queryUuid,
        metricQuery: currentPage.metricQuery,
        cacheMetadata: {
            // todo: to be replaced once we have save query metadata in the DB
            cacheHit: false,
        },
        rows: allRows,
        fields: currentPage.fields,
        appliedDashboardFilters: firstPage.appliedDashboardFilters,
    };
};

const DEFAULT_PAGE_SIZE = 500;

/**
 * Run query & get first results page
 */
const getFirstPage = async (
    projectUuid: string,
    data: ExecuteAsyncQueryRequestParams,
): Promise<ReadyQueryResultsPage> => {
    const query = await lightdashApi<ApiExecuteAsyncQueryResults>({
        url: `/projects/${projectUuid}/query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
    });
    let firstPage: ApiGetAsyncQueryResults | undefined;
    // Wait for first page
    while (!firstPage || firstPage.status === QueryHistoryStatus.PENDING) {
        firstPage = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${query.queryUuid}?pageSize=${DEFAULT_PAGE_SIZE}`,
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
                await sleep(200);
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }
    }

    return firstPage as ReadyQueryResultsPage;
};

export const useQueryResults = (data: QueryResultsProps | null) => {
    const queryClient = useQueryClient();
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });
    const { data: queryPaginationEnabled } = useFeatureFlag(
        FeatureFlags.QueryPagination,
    );
    const result = useQuery<ReadyQueryResultsPage, ApiError>({
        enabled: !!data && !!queryPaginationEnabled,
        queryKey: ['create-query', data],
        queryFn: () => {
            if (data?.chartUuid && data?.chartVersionUuid) {
                return getFirstPage(data.projectUuid, {
                    context: QueryExecutionContext.CHART_HISTORY,
                    chartUuid: data.chartUuid,
                    versionUuid: data.chartVersionUuid,
                });
            } else if (data?.chartUuid) {
                return getFirstPage(data.projectUuid, {
                    context: QueryExecutionContext.CHART,
                    chartUuid: data.chartUuid,
                });
            } else if (data?.query) {
                return getFirstPage(data.projectUuid, {
                    context: QueryExecutionContext.EXPLORE,
                    query: {
                        ...data.query,
                        filters: convertDateFilters(data.query.filters),
                        timezone: data.query.timezone ?? undefined,
                        exploreName: data.tableId,
                        granularity: data.dateZoomGranularity,
                    },
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
                    DEFAULT_PAGE_SIZE,
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

// This hook lazy load results has they are needed in the UI
export const useInfiniteQueryResults = (
    projectUuid?: string,
    queryUuid?: string,
) => {
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });
    const [fetchedPages, setFetchedPages] = useState<ReadyQueryResultsPage[]>(
        [],
    );
    const [fetchAll, setFetchAll] = useState(false);
    const [pageToFetch, setPageToFetch] = useState<number>(1);

    const fetchMoreRows = useCallback(() => {
        const nextPageToFetch = fetchedPages[fetchedPages.length - 1]?.nextPage;
        if (nextPageToFetch) {
            setPageToFetch(nextPageToFetch);
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

    const isFetchingRows = useMemo(() => {
        const isFetchingPage = pageToFetch > fetchedPages.length;
        return !!projectUuid && !!queryUuid && isFetchingPage;
    }, [fetchedPages, pageToFetch, projectUuid, queryUuid]);

    const nextPage = useQuery<ReadyQueryResultsPage, ApiError>({
        enabled: !!projectUuid && !!queryUuid,
        queryKey: [
            'query-page',
            projectUuid,
            queryUuid,
            pageToFetch,
            DEFAULT_PAGE_SIZE,
        ],
        queryFn: () => {
            return getResultsPage(
                projectUuid!,
                queryUuid!,
                pageToFetch!,
                DEFAULT_PAGE_SIZE,
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
        // Reset pagination state
        setFetchedPages([]);
        setPageToFetch(1);
    }, [projectUuid, queryUuid]);

    useEffect(() => {
        if (fetchAll) {
            // keep fetching the next page
            fetchMoreRows();
        }
    }, [fetchAll, fetchMoreRows]);

    return useMemo(
        () => ({
            projectUuid,
            queryUuid,
            metricQuery: fetchedPages[0]?.metricQuery,
            fields: fetchedPages[0]?.fields,
            totalResults: fetchedPages[0]?.totalResults,
            hasFetchedAllRows:
                fetchedRows.length >= fetchedPages[0]?.totalResults,
            rows: fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            setFetchAll,
        }),
        [
            projectUuid,
            queryUuid,
            fetchedPages,
            fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            setFetchAll,
        ],
    );
};
