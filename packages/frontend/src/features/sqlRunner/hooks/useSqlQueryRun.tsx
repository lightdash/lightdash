import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiError,
    type ApiJobScheduledResponse,
    type RawResultRow,
    type SqlRunnerBody,
    type VizColumn,
} from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getSqlRunnerCompleteJob } from './requestUtils';
import { useResultsFromStreamWorker } from './useResultsFromStreamWorker';

export const scheduleSqlJob = async ({
    projectUuid,
    sql,
    limit,
}: {
    projectUuid: string;
    sql: SqlRunnerBody['sql'];
    limit: SqlRunnerBody['limit'];
}) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/sqlRunner/run`,
        method: 'POST',
        body: JSON.stringify({ sql, limit }),
    });

export type ResultsAndColumns = {
    fileUrl: string | undefined;
    results: RawResultRow[];
    columns: VizColumn[];
};

type UseSqlQueryRunParams = {
    sql: SqlRunnerBody['sql'];
    limit: SqlRunnerBody['limit'];
};

/**
 * Gets the SQL query results from the server
 * This is a hook that is used to get the results of a SQL query - used in the SQL runner
 */
export const useSqlQueryRun = (
    projectUuid: string,
    useMutationOptions?: UseMutationOptions<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >,
) => {
    const { getResultsFromStream } = useResultsFromStreamWorker();
    return useMutation<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >(
        async ({ sql, limit }) => {
            const scheduledJob = await scheduleSqlJob({
                projectUuid,
                sql,
                limit,
            });

            const job = await getSqlRunnerCompleteJob(scheduledJob.jobId);
            if (isApiSqlRunnerJobSuccessResponse(job)) {
                const url =
                    job.details && !isErrorDetails(job.details)
                        ? job.details.fileUrl
                        : undefined;

                const results = await getResultsFromStream(url);

                return {
                    fileUrl: url,
                    results,
                    columns:
                        job.details && !isErrorDetails(job.details)
                            ? job.details.columns
                            : [],
                };
            } else {
                throw job;
            }
        },
        {
            mutationKey: ['sqlRunner', 'run'],
            ...useMutationOptions,
        },
    );
};
