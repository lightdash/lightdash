import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiError,
    type ApiJobScheduledResponse,
    type ResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getResultsFromStream, getSqlRunnerCompleteJob } from './requestUtils';
import { type ResultsAndColumns } from './useSqlQueryRun';

const getSqlChartResults = async ({
    projectUuid,
    slug,
}: {
    projectUuid: string;
    slug: string;
}) => {
    const scheduledJob = await lightdashApi<ApiJobScheduledResponse['results']>(
        {
            url: `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}/results-job`,
            method: 'GET',
            body: undefined,
        },
    );
    const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);
    const url =
        isApiSqlRunnerJobSuccessResponse(job) &&
        job?.details &&
        !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    const results = await getResultsFromStream<ResultRow>(url);

    return {
        results,
        columns:
            isApiSqlRunnerJobSuccessResponse(job) &&
            job?.details &&
            !isErrorDetails(job.details)
                ? job.details.columns
                : [],
    };
};

/**
 * Fetches the chart and results of a SQL query from the SQL runner.
 * This is a hook that is used to get the results of a saved SQL query - used when viewing a saved SQL query in the SQL runner
 * @param projectUuid - The UUID of the project.
 * @param slug - The slug of the SQL query.
 * @returns The results of the SQL query
 */
export const useSqlChartResults = (
    projectUuid: string,
    slug: string | undefined,
) => {
    return useQuery<ResultsAndColumns | undefined, ApiError>(
        ['sqlChartResults', projectUuid, slug],
        () => {
            return getSqlChartResults({
                projectUuid,
                slug: slug!,
            });
        },
        {
            enabled: Boolean(slug),
        },
    );
};
