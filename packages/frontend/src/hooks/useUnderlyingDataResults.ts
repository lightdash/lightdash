import {
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiQueryResults,
    assertUnreachable,
    type DateZoom,
    type ExecuteAsyncUnderlyingDataRequestParams,
    type MetricQuery,
    QueryExecutionContext,
    QueryHistoryStatus,
    type ResultRow,
    sleep,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../api';
import { convertDateFilters } from '../utils/dateFilter';

type UnderlyingDataResults = ApiQueryResults & {
    queryUuid: string;
    warehouseExecutionTimeMs?: number;
    totalClientFetchTimeMs?: number;
};

/**
 * Aggregates pagination results for a query
 */
export const getUnderlyingDataResults = async (
    projectUuid: string,
    data: ExecuteAsyncUnderlyingDataRequestParams,
    pageSize?: number, // pageSize is used when getting the results but not when creating the query
): Promise<UnderlyingDataResults> => {
    const startTime = new Date();

    const executeQueryResponse =
        await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
            url: `/projects/${projectUuid}/query/underlying-data`,
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
        metricQuery: executeQueryResponse.metricQuery,
        cacheMetadata: executeQueryResponse.cacheMetadata,
        rows: allRows,
        fields: executeQueryResponse.fields,
        warehouseExecutionTimeMs:
            currentPage.status === QueryHistoryStatus.READY
                ? currentPage.initialQueryExecutionMs
                : undefined,
        totalClientFetchTimeMs: totalTime,
    };
};

export const useUnderlyingDataResults = (
    filters: MetricQuery['filters'],
    underlyingDataSourceQueryUuid?: string,
    underlyingDataItemId?: string,
    dateZoom?: DateZoom,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return useQuery<UnderlyingDataResults, ApiError>({
        queryKey: [
            'underlyingDataResults',
            projectUuid,
            underlyingDataSourceQueryUuid,
            underlyingDataItemId,
            filters,
            dateZoom,
        ],
        enabled: Boolean(projectUuid) && Boolean(underlyingDataSourceQueryUuid),
        queryFn: () => {
            return getUnderlyingDataResults(projectUuid!, {
                context: QueryExecutionContext.VIEW_UNDERLYING_DATA,
                underlyingDataSourceQueryUuid: underlyingDataSourceQueryUuid!,
                underlyingDataItemId,
                filters: convertDateFilters(filters),
                dateZoom,
            });
        },
        retry: false,
    });
};
