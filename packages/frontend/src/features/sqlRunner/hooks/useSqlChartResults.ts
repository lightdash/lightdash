import {
    ArgumentsOf,
    isApiSqlRunnerJobErrorResponse,
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiError,
    type ApiJobScheduledResponse,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getSqlRunnerCompleteJob } from './requestUtils';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';
import { type ResultsAndColumns } from './useSqlQueryRun';

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

export const getSqlChartResultsBySlug = async ({
    projectUuid,
    slug,
    getResultsFromStream,
    context,
}: {
    projectUuid: string;
    slug: string;
    getResultsFromStream: Parameters<
        typeof getSqlChartResults
    >[0]['getResultsFromStream'];
    context: Parameters<typeof getSqlChartResults>[0]['context'];
}) => {
    return getSqlChartResults({
        url: `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}/results-job`,
        getResultsFromStream,
        context,
    });
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
    context?: string,
) => {
    const { getResultsFromStream } = useResultsFromStreamWorker();
    return useQuery<
        (ResultsAndColumns & { fileUrl: string }) | undefined,
        ApiError
    >(
        ['sqlChartResults', projectUuid, slug],
        () => {
            return getSqlChartResultsBySlug({
                projectUuid,
                slug: slug!,
                getResultsFromStream,
                context,
            });
        },
        {
            enabled: Boolean(slug) && Boolean(projectUuid),
        },
    );
};
