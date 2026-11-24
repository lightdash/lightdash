import {
    assertUnreachable,
    DEFAULT_RESULTS_PAGE_SIZE,
    DownloadFileType,
    isBigqueryTokenErrorMessage,
    isPreviewWarehouseSignInExpiredMessage,
    LightdashCustomSqlProvenanceChartUuidHeader,
    ParameterError,
    QueryExecutionContext,
    QueryHistoryStatus,
    sleep,
    type ApiError,
    type ApiExecuteAsyncDashboardChartQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiJobScheduledResponse,
    type ApiSuccessEmpty,
    type DashboardTileRenderRequest,
    type DateGranularity,
    type DownloadOptions,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type MetricQuery,
    type ParametersValuesMap,
    type PivotConfiguration,
    type ReadyQueryResultsPage,
    type ResultRow,
    type UUID,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LightdashApi } from '../api';
import { pollForResults } from '../features/queryRunner/executeQuery';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';
import { convertDateFilters } from '../utils/dateFilter';
import { getFirstResultsPageSize } from './resultsFirstPage';
import useQueryError from './useQueryError';

export type QueryResultsProps = {
    projectUuid: string;
    tableId: string;
    query?: MetricQuery;
    csvLimit?: number | null; // null = all results, capped by the org CSV cells limit
    chartUuid?: string;
    chartVersionUuid?: string;
    includeUnpublishedDraft?: boolean;
    dateZoomGranularity?: DateGranularity | string;
    context?: QueryExecutionContext;
    invalidateCache?: boolean;
    usePreAggregateCache?: boolean;
    parameters?: ParametersValuesMap;
    pivotConfiguration?: PivotConfiguration;
    pivotResults?: boolean;
    customSqlProvenanceChartUuid?: UUID;
    // Headless renders only: run the saved chart as this dashboard tile ran it
    dashboardTileRenderRequest?: DashboardTileRenderRequest;
};

/**
 * Run query & get first results page
 */

export type ReadyQueryResultsPageWithClientFetchTimeMs =
    ReadyQueryResultsPage & {
        clientFetchTimeMs: number;
    };

const isRedshiftIamTokenErrorMessage = (message: string): boolean => {
    const normalizedMessage = message.toLowerCase();
    return (
        normalizedMessage.includes('redshift iam') &&
        normalizedMessage.includes('expired')
    );
};

const getAsyncQueryErrorType = (
    message: string,
): Pick<ApiError['error'], 'name' | 'statusCode'> => {
    if (isRedshiftIamTokenErrorMessage(message)) {
        return { name: 'RedshiftIamTokenError', statusCode: 401 };
    }
    if (isPreviewWarehouseSignInExpiredMessage(message)) {
        return { name: 'PreviewWarehouseSignInExpiredError', statusCode: 401 };
    }
    if (isBigqueryTokenErrorMessage(message)) {
        return { name: 'BigqueryTokenError', statusCode: 401 };
    }
    return { name: 'Error', statusCode: 500 };
};

export const getAsyncQueryError = (message: string | null): ApiError => {
    const errorMessage = message || 'Query failed';
    const { name, statusCode } = getAsyncQueryErrorType(errorMessage);

    return {
        status: 'error',
        error: {
            name,
            statusCode,
            message: errorMessage,
            data: {},
        },
    };
};

const executeAsyncMetricQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: ExecuteAsyncMetricQueryRequestParams,
    options: {
        signal?: AbortSignal;
        customSqlProvenanceChartUuid?: UUID;
    },
): Promise<ApiExecuteAsyncMetricQueryResults> => {
    return lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/metric-query`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
        headers: options.customSqlProvenanceChartUuid
            ? {
                  [LightdashCustomSqlProvenanceChartUuidHeader]:
                      options.customSqlProvenanceChartUuid,
              }
            : undefined,
        signal: options.signal,
    });
};

const executeAsyncSavedChartQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    data: ExecuteAsyncSavedChartRequestParams,
    options: { signal?: AbortSignal },
): Promise<ApiExecuteAsyncMetricQueryResults> => {
    return lightdashApi<ApiExecuteAsyncMetricQueryResults>({
        url: `/projects/${projectUuid}/query/chart`,
        version: 'v2',
        method: 'POST',
        body: JSON.stringify(data),
        signal: options.signal,
    });
};

export const scheduleDownloadQuery = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    queryUuid: string,
    options: DownloadOptions = {},
) => {
    return lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/query/${queryUuid}/schedule-download`,
        method: 'POST',
        body: JSON.stringify({
            type: options.fileType || DownloadFileType.CSV,
            onlyRaw: options.onlyRaw,
            showTableNames: options.showTableNames,
            customLabels: options.customLabels,
            columnOrder: options.columnOrder,
            hiddenFields: options.hiddenFields,
            pivotConfig: options.pivotConfig,
            exportPivotedData: options.exportPivotedData,
            attachmentDownloadName: options.attachmentDownloadName,
            conditionalFormattings: options.conditionalFormattings,
            showColumnTotals: options.showColumnTotals,
            xlsxContent: options.xlsxContent,
            showSubtotals: options.showSubtotals,
        }),
        version: 'v2',
    });
};

export const executeAsyncQuery = (
    lightdashApi: LightdashApi,
    data?: QueryResultsProps | null,
    signal?: AbortSignal,
) => {
    if (data?.chartUuid && data?.chartVersionUuid) {
        return executeAsyncSavedChartQuery(
            lightdashApi,
            data.projectUuid,
            {
                context: QueryExecutionContext.CHART_HISTORY,
                chartUuid: data.chartUuid,
                versionUuid: data.chartVersionUuid,
                limit: data.csvLimit,
                invalidateCache: data.invalidateCache,
                parameters: data.parameters,
                pivotResults: data.pivotResults,
            },
            { signal },
        );
    } else if (data?.chartUuid && data.dashboardTileRenderRequest) {
        return lightdashApi<ApiExecuteAsyncDashboardChartQueryResults>({
            url: `/projects/${data.projectUuid}/query/dashboard-chart`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                ...data.dashboardTileRenderRequest,
                chartUuid: data.chartUuid,
                context: data.context ?? QueryExecutionContext.DASHBOARD,
                pivotResults: data.pivotResults,
            }),
            signal,
        }).then((results) => ({ ...results, warnings: [] }));
    } else if (data?.chartUuid) {
        return executeAsyncSavedChartQuery(
            lightdashApi,
            data.projectUuid,
            {
                // Screenshot renders pass context=scheduledDelivery so the
                // query is attributed to the delivery, as dashboards do.
                context: data.context ?? QueryExecutionContext.CHART,
                chartUuid: data.chartUuid,
                includeUnpublishedDraft:
                    data.includeUnpublishedDraft || undefined,
                limit: data.csvLimit,
                invalidateCache: data.invalidateCache,
                parameters: data.parameters,
                pivotResults: data.pivotResults,
            },
            { signal },
        );
    } else if (data?.query) {
        return executeAsyncMetricQuery(
            lightdashApi,
            data.projectUuid,
            {
                context: data.context ?? QueryExecutionContext.EXPLORE,
                limit: data.csvLimit,
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
                invalidateCache: data.invalidateCache,
                usePreAggregateCache: data.usePreAggregateCache,
                parameters: data.parameters,
                pivotConfiguration: data.pivotConfiguration,
            },
            {
                signal,
                customSqlProvenanceChartUuid: data.customSqlProvenanceChartUuid,
            },
        );
    }
    return Promise.reject(new ParameterError('Missing QueryResultsProps'));
};

export const executeQueryAndWaitForResults = async (
    lightdashApi: LightdashApi,
    data?: QueryResultsProps | null,
) => {
    if (!data) throw new Error('Missing data');

    const query = await executeAsyncQuery(lightdashApi, data, undefined);

    const results = await pollForResults(
        lightdashApi,
        data.projectUuid,
        query.queryUuid,
    );

    if (
        results.status === QueryHistoryStatus.ERROR ||
        results.status === QueryHistoryStatus.EXPIRED
    ) {
        throw new Error(results.error || 'Error executing SQL query');
    }

    if (results.status !== QueryHistoryStatus.READY) {
        throw new Error('Unexpected query status');
    }

    return results;
};

/**
 * @param data - The query data to execute
 * @param missingRequiredParameters - The parameters that are missing for the query to execute. If null, this means we still don't know the missing parameters, so we can't run the query.
 * @returns The query results
 */
export const useGetReadyQueryResults = (
    data: QueryResultsProps | null,
    missingRequiredParameters: string[] | null,
) => {
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError();

    const isEnabled = useMemo(() => {
        if (!data || missingRequiredParameters === null) return false;

        // Only run the query if there are no missing required parameters
        return missingRequiredParameters.length === 0;
    }, [data, missingRequiredParameters]);

    const result = useQuery<ApiExecuteAsyncMetricQueryResults, ApiError>({
        enabled: isEnabled,
        queryKey: ['create-query', data, missingRequiredParameters],
        keepPreviousData: true, // needed to keep the last metric query which could break cartesian chart config
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        queryFn: ({ signal }) => {
            return executeAsyncQuery(
                lightdashApi,
                data
                    ? {
                          ...data,
                          pivotResults: data.pivotResults ?? true,
                      }
                    : null,
                signal,
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
export const getResultsPage = async (
    lightdashApi: LightdashApi,
    projectUuid: string,
    queryUuid: string,
    page: number = 1,
    pageSize: number | null = null,
    resultsUrl: string | null = null,
    signal?: AbortSignal,
): Promise<ApiGetAsyncQueryResults> => {
    const searchParams = new URLSearchParams();
    if (page) {
        searchParams.set('page', page.toString());
    }
    if (pageSize) {
        searchParams.set('pageSize', pageSize.toString());
    }

    if (resultsUrl !== null) {
        return lightdashApi<ApiGetAsyncQueryResults>({
            url: `${resultsUrl}&${searchParams}`,
            method: 'GET',
            signal,
        });
    }
    const urlQueryParams = searchParams.toString();
    return lightdashApi<ApiGetAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/${queryUuid}${
            urlQueryParams ? `?${urlQueryParams}` : ''
        }`,
        version: 'v2',
        method: 'GET',
        signal,
    });
};

// Headless renders poll many tiles at once, so poll them less often
const isHeadlessBrowser = () => navigator.userAgent.includes('HeadlessChrome');
const getInitialBackoffMs = () => (isHeadlessBrowser() ? 1000 : 250);
const getMaxBackoffMs = () => (isHeadlessBrowser() ? 5000 : 1000);

export type InfiniteQueryResults = Partial<
    Pick<
        ReadyQueryResultsPage,
        'queryUuid' | 'totalResults' | 'metadata' | 'pivotDetails' | 'columns'
    >
> & {
    projectUuid?: string;
    queryStatus?: QueryHistoryStatus;
    rows: ResultRow[];
    isInitialLoading: boolean;
    isFetchingFirstPage: boolean;
    isFetchingRows: boolean;
    isFetchingAllPages: boolean;
    isExpandingFirstPage?: boolean;
    rowsExpansionError?: ApiError | null;
    retryFetchRows?: () => void;
    fetchMoreRows: () => void;
    refetchRows: () => Promise<unknown>;
    setFetchAll: (value: boolean) => void;
    fetchAll: boolean;
    hasFetchedAllRows: boolean;
    totalClientFetchTimeMs: number | undefined;
    error: ApiError | null;
};

type FetchedResultsPage = ReadyQueryResultsPage & {
    clientFetchTimeMs: number;
    firstVisibleClientFetchTimeMs?: number;
    requestedPageSize: number;
};

const isPartialFirstPage = (page: FetchedResultsPage) =>
    page.page === 1 &&
    page.requestedPageSize < DEFAULT_RESULTS_PAGE_SIZE &&
    page.rows.length < page.totalResults;

const isForbiddenError = (error: ApiError) => error.error?.statusCode === 403;

// This hook lazy load results has they are needed in the UI
export const useInfiniteQueryResults = (
    projectUuid?: string,
    queryUuid?: string,
    chartName?: string,
    resultsUrl: string | null = null,
    {
        toastErrors = true,
        firstPageColumnCount,
    }: { toastErrors?: boolean; firstPageColumnCount?: number } = {},
): InfiniteQueryResults => {
    const firstPageSize = getFirstResultsPageSize(firstPageColumnCount);
    const lightdashApi = useLightdashApi();
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: chartName
            ? `Error running query for chart '${chartName}'`
            : 'Error running query',
        chartName,
        toastErrors,
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
    const [fetchedPages, setFetchedPages] = useState<FetchedResultsPage[]>([]);
    const [fetchAll, setFetchAll] = useState(false);

    const prevResultsUrlRef = useRef(resultsUrl);
    const prevQueryUuidRef = useRef<string | undefined>(null);
    const prevProjectUuidRef = useRef<string | undefined>(null);
    // Detect input changes during render to avoid exposing stale data
    const dependenciesChanged =
        resultsUrl !== prevResultsUrlRef.current ||
        projectUuid !== prevProjectUuidRef.current ||
        queryUuid !== prevQueryUuidRef.current;

    const fetchMoreRows = useCallback(() => {
        const lastPage = fetchedPages[fetchedPages.length - 1];
        if (lastPage && isPartialFirstPage(lastPage)) return;
        const nextPageToFetch = lastPage?.nextPage;
        if (nextPageToFetch && queryUuid === lastPage.queryUuid) {
            setFetchArgs((prev) => ({
                ...prev,
                page: nextPageToFetch,
                pageSize: DEFAULT_RESULTS_PAGE_SIZE,
            }));
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

    const hasPartialFirstPage = fetchedPages.some(isPartialFirstPage);

    const queryClient = useQueryClient();

    const backoffRef = useRef(getInitialBackoffMs());

    const requestArgs = useMemo(
        () =>
            fetchAll
                ? { ...fetchArgs, pageSize: DEFAULT_RESULTS_PAGE_SIZE }
                : fetchArgs,
        [fetchAll, fetchArgs],
    );

    const nextPage = useQuery<
        ApiGetAsyncQueryResults & {
            clientFetchTimeMs: number;
            requestedPageSize: number;
        },
        ApiError
    >({
        enabled: !!requestArgs.projectUuid && !!requestArgs.queryUuid,
        queryKey: [
            'query-page',
            requestArgs,
            ...(resultsUrl === null ? [] : [resultsUrl]),
        ],
        queryFn: async ({ signal }) => {
            const startTime = performance.now();
            const results = await getResultsPage(
                lightdashApi,
                requestArgs.projectUuid!,
                requestArgs.queryUuid!,
                requestArgs.page,
                requestArgs.pageSize,
                resultsUrl,
                signal,
            );

            const { status } = results;

            const clientFetchTimeMs = performance.now() - startTime;

            switch (status) {
                case QueryHistoryStatus.ERROR:
                case QueryHistoryStatus.EXPIRED: {
                    backoffRef.current = getInitialBackoffMs();
                    throw getAsyncQueryError(results.error);
                }
                case QueryHistoryStatus.CANCELLED: {
                    backoffRef.current = getInitialBackoffMs();
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
                case QueryHistoryStatus.PENDING:
                case QueryHistoryStatus.QUEUED:
                case QueryHistoryStatus.EXECUTING: {
                    // Invalidate page. Note we can't use refetch as it bypasses the "enabled" check: https://github.com/TanStack/query/issues/1965
                    void sleep(backoffRef.current).then(() =>
                        queryClient.invalidateQueries([
                            'query-page',
                            requestArgs,
                            ...(resultsUrl === null ? [] : [resultsUrl]),
                        ]),
                    );
                    // Double the backoff until it reaches the cap
                    const maxBackoffMs = getMaxBackoffMs();
                    if (backoffRef.current < maxBackoffMs) {
                        backoffRef.current = Math.min(
                            backoffRef.current * 2,
                            maxBackoffMs,
                        );
                    }
                    return {
                        ...results,
                        clientFetchTimeMs,
                        requestedPageSize: requestArgs.pageSize,
                    };
                }
                case QueryHistoryStatus.READY: {
                    backoffRef.current = getInitialBackoffMs();
                    return {
                        ...results,
                        clientFetchTimeMs,
                        requestedPageSize: requestArgs.pageSize,
                    };
                }
                default:
                    return assertUnreachable(status, 'Unknown query status');
            }
        },
        staleTime: Infinity, // the data will never be considered stale
    });
    const { data: nextPageData } = nextPage;

    const isExpansionFailure =
        !dependenciesChanged &&
        hasPartialFirstPage &&
        !!nextPage.error &&
        !isForbiddenError(nextPage.error);
    const rowsExpansionError =
        isExpansionFailure && !nextPage.isFetching ? nextPage.error : null;

    const { refetch: refetchNextPage } = nextPage;
    const retryFetchRows = useCallback(() => {
        void refetchNextPage();
    }, [refetchNextPage]);

    const isFetchingRows = useMemo(() => {
        if (rowsExpansionError) return false;
        const isFetchingPage =
            fetchArgs.page > fetchedPages.length || hasPartialFirstPage;

        return (
            (!!projectUuid &&
                !!queryUuid &&
                (isFetchingPage || (fetchAll && !hasFetchedAllRows))) ||
            dependenciesChanged
        );
    }, [
        fetchedPages,
        fetchArgs.page,
        projectUuid,
        queryUuid,
        fetchAll,
        hasFetchedAllRows,
        dependenciesChanged,
        hasPartialFirstPage,
        rowsExpansionError,
    ]);

    // On error
    useEffect(() => {
        if (nextPage.error && !isExpansionFailure) {
            setErrorResponse(nextPage.error);
        }
    }, [nextPage.error, isExpansionFailure, setErrorResponse]);

    useEffect(() => {
        const pageData = nextPage.data;
        if (pageData?.status === QueryHistoryStatus.READY) {
            setFetchedPages((prevState) => {
                // Deduplicate: avoid appending a page that was already fetched.
                // This can happen when React Query re-delivers the same READY
                // result after an invalidation or re-render, creating a new
                // object reference even though the contents are identical.
                const existingPage = prevState.find(
                    (p) =>
                        p.queryUuid === pageData.queryUuid &&
                        p.page === pageData.page,
                );
                if (!existingPage) return [...prevState, pageData];
                if (
                    existingPage.requestedPageSize >= pageData.requestedPageSize
                ) {
                    return prevState;
                }
                return prevState.map((p) =>
                    p === existingPage
                        ? {
                              ...pageData,
                              firstVisibleClientFetchTimeMs:
                                  existingPage.firstVisibleClientFetchTimeMs ??
                                  existingPage.clientFetchTimeMs,
                          }
                        : p,
                );
            });
            if (isPartialFirstPage(pageData)) {
                setFetchArgs((prev) =>
                    prev.queryUuid === pageData.queryUuid && prev.page === 1
                        ? { ...prev, pageSize: DEFAULT_RESULTS_PAGE_SIZE }
                        : prev,
                );
            }
        }
    }, [nextPage.data]);

    useEffect(() => {
        const hasQueryUuidChanged = queryUuid !== prevQueryUuidRef.current;
        const hasProjectUuidChanged =
            projectUuid !== prevProjectUuidRef.current;

        if (
            hasQueryUuidChanged ||
            hasProjectUuidChanged ||
            resultsUrl !== prevResultsUrlRef.current
        ) {
            // Reset fetched pages before updating the fetch args
            setFetchedPages([]);
            backoffRef.current = getInitialBackoffMs();
            // Reset fetchAll before updating the fetch args
            setFetchAll(false);
            setFetchArgs({
                queryUuid,
                projectUuid,
                page: 1,
                pageSize: firstPageSize,
            });

            // Update refs
            prevResultsUrlRef.current = resultsUrl;
            prevQueryUuidRef.current = queryUuid;
            prevProjectUuidRef.current = projectUuid;
        }
    }, [projectUuid, queryUuid, resultsUrl, firstPageSize]);

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
            : Math.round(
                  fetchedPages[0]?.firstVisibleClientFetchTimeMs ??
                      fetchedPages[0]?.clientFetchTimeMs ??
                      0,
              ); // If we're not fetching all pages, only return the time for the first visible page (enough to render the viz)

        return (
            totalPagesFetchTime +
            (fetchedPages[0]?.metadata.performance.initialQueryExecutionMs ?? 0) // Add the time it took to execute the initial query
        );
    }, [fetchAll, fetchedPages]);

    const isInitialLoading = useMemo(() => {
        return fetchAll ? !hasFetchedAllRows : fetchedPages.length < 1;
    }, [fetchedPages, fetchAll, hasFetchedAllRows]);

    return useMemo(
        () => ({
            projectUuid,
            queryUuid,
            queryStatus: dependenciesChanged ? undefined : nextPageData?.status, // show latest status
            totalResults: fetchedPages[0]?.totalResults,
            metadata: fetchedPages[0]?.metadata,
            pivotDetails: fetchedPages[0]?.pivotDetails,
            columns: fetchedPages[0]?.columns,
            hasFetchedAllRows,
            rows: fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            refetchRows: nextPage.refetch,
            setFetchAll,
            totalClientFetchTimeMs,
            isInitialLoading: isInitialLoading || dependenciesChanged,
            isFetchingFirstPage:
                dependenciesChanged ||
                (!!queryUuid && !fetchedPages.length) ||
                (!!queryUuid && fetchedPages[0]?.totalResults === undefined),
            isFetchingAllPages: !!queryUuid && fetchAll && !hasFetchedAllRows,
            isExpandingFirstPage:
                !dependenciesChanged &&
                hasPartialFirstPage &&
                !rowsExpansionError,
            rowsExpansionError,
            retryFetchRows,
            fetchAll,
            error: isExpansionFailure ? null : nextPage.error,
        }),
        [
            projectUuid,
            queryUuid,
            dependenciesChanged,
            nextPageData?.status,
            fetchedPages,
            hasFetchedAllRows,
            fetchedRows,
            isFetchingRows,
            fetchMoreRows,
            nextPage.refetch,
            totalClientFetchTimeMs,
            isInitialLoading,
            nextPage.error,
            fetchAll,
            hasPartialFirstPage,
            rowsExpansionError,
            retryFetchRows,
            isExpansionFailure,
        ],
    );
};

export const useCancelQuery = (projectUuid?: string, queryUuid?: string) => {
    const lightdashApi = useLightdashApi();
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
