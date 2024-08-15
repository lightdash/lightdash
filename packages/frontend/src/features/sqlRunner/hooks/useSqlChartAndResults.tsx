import {
    isErrorDetails,
    type ApiError,
    type ApiSqlChartWithResults,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getResultsFromStream, getSqlRunnerCompleteJob } from './requestUtils';
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
    const job = await getSqlRunnerCompleteJob(chartAndScheduledJob.jobId);
    const url =
        job?.details && !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    const results = await getResultsFromStream(url);

    return {
        chart: chartAndScheduledJob.chart,
        resultsAndColumns: {
            results,
            columns:
                job?.details && !isErrorDetails(job.details)
                    ? job.details.columns
                    : [],
        },
    };
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
        ApiError
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
