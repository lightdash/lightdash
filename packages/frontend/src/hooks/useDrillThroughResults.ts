import {
    assertUnreachable,
    QueryHistoryStatus,
    sleep,
    type ApiError,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiQueryResults,
    type DashboardFilters,
    type DrillStep,
    type ResultRow,
    type SortField,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { useProjectUuid } from './useProjectUuid';

type DrillThroughResults = ApiQueryResults & {
    queryUuid: string;
};

export type DashboardDrillContext = {
    dashboardFilters?: DashboardFilters;
    dashboardSorts?: SortField[];
    dateZoom?: { granularity?: string };
};

/**
 * Executes a chart drill via the chart-drill endpoint.
 * The backend loads the source chart, resolves drill paths,
 * applies accumulated filters, and executes — all with view-level permissions.
 */
const getDrillThroughResults = async (
    projectUuid: string,
    sourceChartUuid: string,
    drillSteps: DrillStep[],
    dashboardContext?: DashboardDrillContext,
): Promise<DrillThroughResults> => {
    const executeResponse =
        await lightdashApi<ApiExecuteAsyncMetricQueryResults>({
            url: `/projects/${projectUuid}/query/chart-drill`,
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                chartUuid: sourceChartUuid,
                drillSteps,
                ...dashboardContext,
            }),
        });

    let allRows: ResultRow[] = [];
    let currentPage: ApiGetAsyncQueryResults | undefined;
    let backoffMs = 250;

    while (
        !currentPage ||
        currentPage.status === QueryHistoryStatus.PENDING ||
        currentPage.status === QueryHistoryStatus.QUEUED ||
        currentPage.status === QueryHistoryStatus.EXECUTING ||
        (currentPage.status === QueryHistoryStatus.READY &&
            currentPage.nextPage)
    ) {
        const page =
            currentPage?.status === QueryHistoryStatus.READY
                ? currentPage?.nextPage
                : 1;

        const searchParams = new URLSearchParams();
        if (page) searchParams.set('page', page.toString());

        currentPage = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${
                executeResponse.queryUuid
            }${searchParams.toString() ? `?${searchParams.toString()}` : ''}`,
            version: 'v2',
            method: 'GET',
            body: undefined,
        });

        const { status } = currentPage;

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
                throw {
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: 'Query cancelled',
                        data: {},
                    },
                } as ApiError;
            case QueryHistoryStatus.ERROR:
            case QueryHistoryStatus.EXPIRED:
                throw {
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: currentPage.error ?? 'Query failed',
                        data: {},
                    },
                } as ApiError;
            case QueryHistoryStatus.READY:
                allRows = allRows.concat(currentPage.rows);
                break;
            case QueryHistoryStatus.PENDING:
            case QueryHistoryStatus.QUEUED:
            case QueryHistoryStatus.EXECUTING:
                await sleep(backoffMs);
                if (backoffMs < 1000) backoffMs = Math.min(backoffMs * 2, 1000);
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }
    }

    return {
        queryUuid: currentPage.queryUuid,
        metricQuery: executeResponse.metricQuery,
        cacheMetadata: executeResponse.cacheMetadata,
        rows: allRows,
        fields: executeResponse.fields,
    };
};

/**
 * Hook to execute a linked chart drill-through.
 * Uses the chart-drill endpoint which handles view-level permissions.
 */
export const useDrillThroughResults = (
    sourceChartUuid: string | undefined,
    drillSteps: DrillStep[],
    enabled: boolean,
    dashboardContext?: DashboardDrillContext,
) => {
    const projectUuid = useProjectUuid();

    return useQuery<DrillThroughResults, ApiError>({
        queryKey: [
            'linkedChartDrillResults',
            projectUuid,
            sourceChartUuid,
            drillSteps,
            dashboardContext,
        ],
        enabled: enabled && !!projectUuid && !!sourceChartUuid && drillSteps.length > 0,
        queryFn: () =>
            getDrillThroughResults(
                projectUuid!,
                sourceChartUuid!,
                drillSteps,
                dashboardContext,
            ),
        retry: false,
    });
};
