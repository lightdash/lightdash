import {
    isErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiSqlRunnerJobStatusResponse,
    type ResultRow,
    type SqlColumn,
    type SqlRunnerBody,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';
import { useAppSelector } from '../store/hooks';

const scheduleSqlJob = async ({
    projectUuid,
    sql,
}: {
    projectUuid: string;
    sql: SqlRunnerBody['sql'];
}) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/sqlRunner/run`,
        method: 'POST',
        body: JSON.stringify({ sql }),
    });

export type ResultsAndColumns = {
    results: ResultRow[];
    columns: SqlColumn[];
};

/**
 * Gets the SQL query results from the server
 *
 * Steps:
 * 1. Schedule the SQL query job
 * 2. Get the status of the scheduled job
 * 3. Fetch the results of the job
 */
export const useSqlQueryRun = ({
    onSuccess,
}: {
    onSuccess: (data: ResultsAndColumns | undefined) => void;
}) => {
    const { showToastError } = useToaster();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const {
        mutate,
        isLoading: isMutating,
        data: sqlQueryJob,
    } = useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        {
            sql: SqlRunnerBody['sql'];
        }
    >(({ sql }) => scheduleSqlJob({ projectUuid, sql }), {
        mutationKey: ['sqlRunner', 'run'],
    });

    const { data: scheduledDeliveryJobStatus, isFetching: jobIsLoading } =
        useQuery<
            ApiSqlRunnerJobStatusResponse['results'] | undefined,
            ApiError
        >(
            ['jobStatus', sqlQueryJob?.jobId],
            () => {
                if (!sqlQueryJob?.jobId) return;
                return getSchedulerJobStatus<ApiSqlRunnerJobStatusResponse>(
                    sqlQueryJob.jobId,
                );
            },
            {
                refetchInterval: (data, query) => {
                    if (
                        !!query.state.error ||
                        data?.status === SchedulerJobStatus.COMPLETED ||
                        data?.status === SchedulerJobStatus.ERROR
                    )
                        return false;
                    return 1000;
                },
                onSuccess: (data) => {
                    if (data?.status === SchedulerJobStatus.ERROR) {
                        if (isErrorDetails(data?.details)) {
                            showToastError({
                                title: 'Could not run SQL query',
                                subtitle: data?.details?.error,
                            });
                        }
                    }
                },
                enabled: Boolean(
                    sqlQueryJob && sqlQueryJob?.jobId !== undefined,
                ),
            },
        );

    const { data: sqlQueryResults, isFetching: isResultsLoading } = useQuery<
        ResultRow[] | undefined,
        ApiError,
        ResultsAndColumns | undefined
    >(
        ['sqlQueryResults', sqlQueryJob?.jobId],
        async () => {
            const url =
                !isErrorDetails(scheduledDeliveryJobStatus?.details) &&
                scheduledDeliveryJobStatus?.details?.fileUrl;
            if (!url) {
                throw new Error('Missing file URL');
            }
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
            });
            const rb = response.body;
            const reader = rb?.getReader();

            const stream = new ReadableStream({
                start(controller) {
                    function push() {
                        void reader?.read().then(({ done, value }) => {
                            if (done) {
                                // Close the stream
                                controller.close();
                                return;
                            }
                            // Enqueue the next data chunk into our target stream
                            controller.enqueue(value);

                            push();
                        });
                    }

                    push();
                },
            });

            const responseStream = new Response(stream, {
                headers: { 'Content-Type': 'application/json' },
            });
            const result = await responseStream.text();

            // Split the JSON strings by newline
            const jsonStrings = result.trim().split('\n');
            const jsonObjects: ResultRow[] = jsonStrings
                .map((jsonString) => {
                    try {
                        return JSON.parse(jsonString);
                    } catch (e) {
                        throw new Error('Error parsing JSON');
                    }
                })
                .filter((obj) => obj !== null);

            return jsonObjects;
        },
        {
            onError: (data) => {
                showToastError({
                    title: 'Could not fetch SQL query results',
                    subtitle: data.error.message,
                });
            },
            enabled: Boolean(
                scheduledDeliveryJobStatus?.status ===
                    SchedulerJobStatus.COMPLETED &&
                    !isErrorDetails(scheduledDeliveryJobStatus?.details) &&
                    scheduledDeliveryJobStatus?.details?.fileUrl !== undefined,
            ),
            select: (data) => {
                if (
                    !data ||
                    isErrorDetails(scheduledDeliveryJobStatus?.details) ||
                    !scheduledDeliveryJobStatus?.details?.columns
                ) {
                    return undefined;
                }

                return {
                    results: data,
                    columns: scheduledDeliveryJobStatus.details.columns,
                };
            },
            onSuccess: (data) => {
                onSuccess(data);
            },
            keepPreviousData: true,
        },
    );

    const isLoading = useMemo(
        () =>
            isMutating ||
            jobIsLoading ||
            scheduledDeliveryJobStatus?.status === SchedulerJobStatus.STARTED ||
            isResultsLoading,
        [
            isMutating,
            jobIsLoading,
            scheduledDeliveryJobStatus?.status,
            isResultsLoading,
        ],
    );

    return {
        mutate,
        isLoading,
        data: sqlQueryResults,
    };
};
