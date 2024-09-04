import {
    isApiSqlRunnerJobErrorResponse,
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiError,
    type ApiSqlChartWithResults,
    type RawResultRow,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import {
    getResultsFromStream,
    getSqlRunnerCompleteJob,
} from '../../../utils/requestUtils';
import { type ResultsAndColumns } from './useSqlQueryRun';

const getSqlChartAndResults = async ({
    projectUuid,
    savedSqlUuid,
}: {
    projectUuid: string;
    savedSqlUuid: string;
}): Promise<{ resultsAndColumns: ResultsAndColumns; chart: SqlChart }> => {
    const chartAndScheduledJob = await lightdashApi<
        ApiSqlChartWithResults['results']
    >({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/chart-and-results`,
        method: 'GET',
        body: undefined,
    });
    const slug = chartAndScheduledJob.chart.slug;
    const job = await getSqlRunnerCompleteJob(chartAndScheduledJob.jobId);

    if (isApiSqlRunnerJobErrorResponse(job)) {
        throw {
            ...job,
            slug,
        };
    }
    const url =
        isApiSqlRunnerJobSuccessResponse(job) &&
        job?.details &&
        !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    try {
        const results = await getResultsFromStream<RawResultRow>(url);

        return {
            chart: chartAndScheduledJob.chart,
            resultsAndColumns: {
                results,
                columns:
                    isApiSqlRunnerJobSuccessResponse(job) &&
                    job?.details &&
                    !isErrorDetails(job.details)
                        ? job.details.columns
                        : [],
            },
        };
    } catch (streamError) {
        throw {
            ...streamError,
            slug,
        };
    }
};

/**
 * Fetches the chart and results of a SQL query from the SQL runner.
 * This is a hook that is used to get the chart and results of a saved SQL query - used in dashboards
 * @param savedSqlUuid - The UUID of the saved SQL query.
 * @param projectUuid - The UUID of the project.
 * @returns The chart and results of the SQL query
 */
export const useSqlChartAndResults = ({
    savedSqlUuid,
    projectUuid,
}: {
    savedSqlUuid: string | null;
    projectUuid: string;
}) => {
    return useQuery<
        { resultsAndColumns: ResultsAndColumns; chart: SqlChart },
        ApiError & { slug?: string }
    >(
        ['sqlChartResults', projectUuid, savedSqlUuid],
        () => {
            return getSqlChartAndResults({
                projectUuid,
                savedSqlUuid: savedSqlUuid!,
            });
        },
        {
            enabled: Boolean(savedSqlUuid),
        },
    );
};
