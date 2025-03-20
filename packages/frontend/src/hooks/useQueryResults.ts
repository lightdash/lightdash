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

const getUnderlyingDataResults = async ({
    projectUuid,
    tableId,
    query,
}: {
    projectUuid: string;
    tableId: string;
    query: MetricQuery;
}) => {
    const timezoneFixQuery = {
        ...query,
        filters: convertDateFilters(query.filters),
    };

    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runUnderlyingDataQuery`,
        method: 'POST',
        body: JSON.stringify(timezoneFixQuery),
    });
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
    tableId: string,
    query: MetricQuery,
    underlyingDataSourceQueryUuid?: string,
    underlyingDataItemId?: string,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: queryPaginationEnabled } = useFeatureFlag(
        FeatureFlags.QueryPagination,
    );

    const shouldUsePagination =
        underlyingDataSourceQueryUuid && queryPaginationEnabled?.enabled;

    const queryKey = shouldUsePagination
        ? [
              'underlyingDataResults',
              projectUuid,
              underlyingDataSourceQueryUuid,
              underlyingDataItemId,
              query.filters,
          ]
        : ['underlyingDataResults', projectUuid, JSON.stringify(query)];

    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        enabled: Boolean(projectUuid) && Boolean(queryPaginationEnabled),
        queryFn: () => {
            if (shouldUsePagination) {
                return getQueryPaginatedResults(projectUuid!, {
                    context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                    underlyingDataSourceQueryUuid,
                    underlyingDataItemId,
                    filters: query.filters,
                });
            }

            return getUnderlyingDataResults({
                projectUuid: projectUuid!,
                tableId,
                query,
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
    const [fetchedPages, setFetchedPages] = useState<ReadyQueryResultsPage[]>(
        [],
    );
    const [totalRows, setTotalRows] = useState<number | null>(null);
    const [rowIndexToFetch, setRowIndexToFetch] = useState<number | null>(null);

    // Aggregate rows from all fetched pages
    const fetchedRows = useMemo(() => {
        const rows: ResultRow[] = [];
        for (const page of fetchedPages) {
            rows.push(...page.rows);
        }
        return rows;
    }, [fetchedPages]);

    // Find what page to fetch next based on what was fetched already and the row index we want to fetch
    const nextPageToFetch = useMemo(() => {
        if (rowIndexToFetch === null) {
            return null;
        }
        const fetchedPagesCount = fetchedPages.length;
        // get first page
        if (fetchedPagesCount === 0 || totalRows === null) {
            return 1;
        }
        const fetchedRowsCount = fetchedRows.length;
        const hasFetchedEnoughRowsForNow = fetchedRowsCount >= rowIndexToFetch;
        const isFetchComplete = fetchedRowsCount >= totalRows;
        if (hasFetchedEnoughRowsForNow || isFetchComplete) {
            return null;
        }
        // fetch next page
        return fetchedPagesCount + 1;
    }, [rowIndexToFetch, fetchedRows.length, fetchedPages.length, totalRows]);

    useEffect(() => {
        // Reset pagination state
        setFetchedPages([]);
        setTotalRows(null);
        setRowIndexToFetch(DEFAULT_PAGE_SIZE); // prefetch first page
    }, [projectUuid, queryUuid]);

    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });
    const nextPage = useQuery<ReadyQueryResultsPage, ApiError>({
        enabled: !!projectUuid && !!queryUuid && !!nextPageToFetch,
        queryKey: [
            'query-page',
            projectUuid,
            queryUuid,
            nextPageToFetch,
            DEFAULT_PAGE_SIZE,
        ],
        queryFn: () => {
            return getResultsPage(
                projectUuid!,
                queryUuid!,
                nextPageToFetch!,
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
            setTotalRows(nextPage.data.totalResults);
            setFetchedPages((prevState) => [...prevState, nextPage.data]);
        }
    }, [nextPage.data]);

    const fetchMoreRows = useCallback((rowIndex: number) => {
        // Update row to fetch if higher than the current value
        setRowIndexToFetch((prevState) =>
            prevState ? Math.max(prevState, rowIndex) : rowIndex,
        );
    }, []);

    const isFetchingRows = useMemo(() => {
        return rowIndexToFetch
            ? rowIndexToFetch > fetchedRows.length &&
                  totalRows !== fetchedRows.length
            : false;
    }, [rowIndexToFetch, fetchedRows.length, totalRows]);

    return {
        fetchedRows,
        totalRows,
        isFetchingRows,
        fetchMoreRows,
    };
};
