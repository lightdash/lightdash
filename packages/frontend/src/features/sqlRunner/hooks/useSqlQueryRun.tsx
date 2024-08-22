import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    type ApiError,
    type ApiJobScheduledResponse,
    type ResultRow,
    type SqlRunnerBody,
    type VizSqlColumn,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppSelector } from '../store/hooks';
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

/**
 * Gets the SQL query results from the server
 * This is a hook that is used to get the results of a SQL query - used in the SQL runner
 * @param onSuccess - The function to call when the results are fetched.
 * @returns The results of the SQL query
 */
export const useSqlQueryRun = ({
    onSuccess,
}: {
    onSuccess: (data: ResultsAndColumns | undefined) => void;
}) => {
    const { showToastError } = useToaster();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const [data, setData] = useState<ResultsAndColumns | undefined>(undefined);
    const previousDataRef = useRef<ResultsAndColumns | undefined>(undefined);

    const { mutate, isLoading } = useMutation<
        ResultsAndColumns | undefined,
        ApiError,
        {
            sql: SqlRunnerBody['sql'];
            limit: SqlRunnerBody['limit'];
        }
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
            onError: (err: ApiError) => {
                showToastError({
                    title: 'Could not fetch SQL query results',
                    subtitle: err.error.message,
                });
            },
            onMutate: () => {
                // Save the current data to the previousDataRef so we can simulate a keepPreviousData behavior
                previousDataRef.current = data;
            },
            onSuccess: (newData) => {
                setData(newData);
                onSuccess(newData);
            },
        },
    );

    const currentData = isLoading ? previousDataRef.current : data;

    return {
        mutate,
        isLoading,
        data: currentData,
    };
};
