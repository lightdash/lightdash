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
    type ResultRow,
    sleep,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
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

const getChartResults = async ({
    chartUuid,
    context,
}: {
    chartUuid?: string;
    context?: string;
}) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/results${
            context ? `?context=${context}` : ''
        }`,
        method: 'POST',
        body: undefined,
    });
};

const getQueryResults = async ({
    projectUuid,
    tableId,
    query,
    csvLimit,
    dateZoomGranularity,
    context,
}: QueryResultsProps) => {
    const timezoneFixQuery = query && {
        ...query,
        filters: convertDateFilters(query.filters),
        timezone: query.timezone ?? undefined,
    };

    return lightdashApi<ApiQueryResults>({
        url: `/projects/${projectUuid}/explores/${tableId}/runQuery`,
        method: 'POST',
        body: JSON.stringify({
            ...timezoneFixQuery,
            granularity: dateZoomGranularity,
            csvLimit,
            context,
        }),
    });
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

export const useUnderlyingDataResults = (
    tableId: string,
    query: MetricQuery,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryKey = [
        'underlyingDataResults',
        projectUuid,
        JSON.stringify(query),
    ];
    return useQuery<ApiQueryResults, ApiError>({
        queryKey,
        queryFn: () =>
            getUnderlyingDataResults({
                projectUuid: projectUuid!,
                tableId,
                query,
            }),
        retry: false,
    });
};

const getChartVersionResults = async (
    chartUuid: string,
    versionUuid: string,
) => {
    return lightdashApi<ApiQueryResults>({
        url: `/saved/${chartUuid}/version/${versionUuid}/results`,
        method: 'POST',
        body: undefined,
    });
};

/**
 * Aggregates pagination results for a query
 */
export const getQueryPaginatedResults = async (
    projectUuid: string,
    data: ExecuteAsyncQueryRequestParams,
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
        if (data.pageSize) {
            searchParams.set('pageSize', data.pageSize.toString());
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

export const useQueryResults = (data: QueryResultsProps | null) => {
    const setErrorResponse = useQueryError({
        forceToastOnForbidden: true,
        forbiddenToastTitle: 'Error running query',
    });
    const { data: queryPaginationEnabled } = useFeatureFlag(
        FeatureFlags.QueryPagination,
    );
    const result = useQuery<ApiQueryResults, ApiError>({
        enabled: !!data && !!queryPaginationEnabled,
        queryKey: ['query-all-results', data],
        queryFn: () => {
            if (data?.chartUuid && data?.chartVersionUuid) {
                if (queryPaginationEnabled?.enabled) {
                    return getQueryPaginatedResults(data.projectUuid, {
                        context: QueryExecutionContext.CHART_HISTORY,
                        chartUuid: data.chartUuid,
                        versionUuid: data.chartVersionUuid,
                    });
                }
                return getChartVersionResults(
                    data.chartUuid,
                    data.chartVersionUuid,
                );
            } else if (data?.chartUuid) {
                if (queryPaginationEnabled?.enabled) {
                    return getQueryPaginatedResults(data.projectUuid, {
                        context: QueryExecutionContext.CHART,
                        chartUuid: data.chartUuid,
                    });
                }
                return getChartResults(data);
            } else if (data?.query) {
                if (queryPaginationEnabled?.enabled) {
                    return getQueryPaginatedResults(data.projectUuid, {
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
                return getQueryResults(data);
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
