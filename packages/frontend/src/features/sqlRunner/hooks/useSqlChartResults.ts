import {
    type ApiError,
    type ApiExecuteAsyncQueryResults,
    type ApiGetAsyncQueryResults,
    type ApiJobScheduledResponse,
    assertUnreachable,
    type ExecuteAsyncDashboardSqlChartRequestParams,
    isApiSqlRunnerJobErrorResponse,
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    QueryHistoryStatus,
    type RawResultRow,
    type ResultRow,
    sleep,
    type VizColumn,
} from '@lightdash/common';
import { lightdashApi } from '../../../api';
import { getSqlRunnerCompleteJob } from './requestUtils';
import { type useResultsFromStreamWorker } from './useResultsFromStreamWorker';

const getSqlChartResults = async ({
    url,
    getResultsFromStream,
    context,
}: {
    url: string;
    getResultsFromStream: ReturnType<
        typeof useResultsFromStreamWorker
    >['getResultsFromStream'];
    context: string | undefined;
}) => {
    const scheduledJob = await lightdashApi<ApiJobScheduledResponse['results']>(
        {
            url: `${url}${context ? `?context=${context}` : ''}`,
            method: 'GET',
            body: undefined,
        },
    );
    const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);

    if (isApiSqlRunnerJobErrorResponse(job)) {
        throw job;
    }
    const fileUrl =
        isApiSqlRunnerJobSuccessResponse(job) &&
        job?.details &&
        !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    const results = await getResultsFromStream(fileUrl);

    return {
        fileUrl: fileUrl!,
        results,
        columns:
            isApiSqlRunnerJobSuccessResponse(job) &&
            job?.details &&
            !isErrorDetails(job.details)
                ? job.details.columns
                : [],
    };
};

export const getSqlChartResultsByUuid = async ({
    projectUuid,
    chartUuid,
    getResultsFromStream,
    context,
}: {
    projectUuid: string;
    chartUuid: string;
    getResultsFromStream: Parameters<
        typeof getSqlChartResults
    >[0]['getResultsFromStream'];
    context: Parameters<typeof getSqlChartResults>[0]['context'];
}) => {
    return getSqlChartResults({
        url: `/projects/${projectUuid}/sqlRunner/saved/${chartUuid}/results-job`,
        getResultsFromStream,
        context,
    });
};

export const getDashboardSqlChartResults = async (
    projectUuid: string,
    data: ExecuteAsyncDashboardSqlChartRequestParams,
): Promise<{ columns: VizColumn[]; results: RawResultRow[] }> => {
    const query = await lightdashApi<ApiExecuteAsyncQueryResults>({
        url: `/projects/${projectUuid}/query/dashboard-sql-chart`,
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

        const urlQueryParams = searchParams.toString();
        currentPage = await lightdashApi<ApiGetAsyncQueryResults>({
            url: `/projects/${projectUuid}/query/${query.queryUuid}${
                urlQueryParams ? `?${urlQueryParams}` : ''
            }`,
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
                } satisfies ApiError;
            case QueryHistoryStatus.ERROR:
                throw {
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 500,
                        message: currentPage.error ?? 'Query failed',
                        data: {},
                    },
                } satisfies ApiError;
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
    return {
        columns: Object.entries(currentPage.fields).map(([key, _field]) => ({
            reference: key,
        })),
        results: allRows.map((row) =>
            Object.fromEntries(
                Object.entries(row).map(([key, value]) => [
                    key,
                    value.value.raw,
                ]),
            ),
        ),
    };
};
