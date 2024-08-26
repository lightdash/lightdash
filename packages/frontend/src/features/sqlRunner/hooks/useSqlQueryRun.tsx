import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiError,
    type ApiJobScheduledResponse,
    type ResultRow,
    type SqlRunnerBody,
    type VizSqlColumn,
} from '@lightdash/common';
import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getResultsFromStream, getSqlRunnerCompleteJob } from './requestUtils';

const scheduleSqlJob = async ({
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
    results: ResultRow[];
    columns: VizSqlColumn[];
};

type UseSqlQueryRunParams = {
    sql: SqlRunnerBody['sql'];
    limit: SqlRunnerBody['limit'];
};

export const useSqlQueryRun = (
    projectUuid: string,
    useMutationOptions?: UseMutationOptions<
        ResultsAndColumns | undefined,
        ApiError,
        UseSqlQueryRunParams
    >,
) =>
    useMutation<ResultsAndColumns | undefined, ApiError, UseSqlQueryRunParams>(
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
                const results = await getResultsFromStream<ResultRow>(url);

                return {
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
