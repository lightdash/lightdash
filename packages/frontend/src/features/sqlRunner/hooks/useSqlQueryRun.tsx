import {
    SchedulerJobStatus,
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiJobStatusResponse,
    type ResultRow,
    type SqlRunnerBody,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setInitialResultsTableConfig } from '../store/sqlRunnerSlice';

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

/**
 * Gets the SQL query results from the server
 *
 * Steps:
 * 1. Schedule the SQL query job
 * 2. Get the status of the scheduled job
 * 3. Fetch the results of the job
 */
export const useSqlQueryRun = () => {
    const { showToastError } = useToaster();
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const sqlQueryRunMutation = useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        {
            sql: SqlRunnerBody['sql'];
        }
    >(({ sql }) => scheduleSqlJob({ projectUuid, sql }), {
        mutationKey: ['sqlRunner', 'run'],
    });

    const { data: sqlQueryJob } = sqlQueryRunMutation;

    const { data: scheduledDeliveryJobStatus } = useQuery<
        ApiJobStatusResponse['results'] | undefined,
        ApiError
    >(
        ['jobStatus', sqlQueryJob?.jobId],
        () => {
            if (!sqlQueryJob?.jobId) return;
            return getSchedulerJobStatus(sqlQueryJob.jobId);
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
                    showToastError({
                        title: 'Could not run SQL query',
                        subtitle: data.details?.error,
                    });
                }
            },
            enabled: Boolean(sqlQueryJob && sqlQueryJob?.jobId !== undefined),
        },
    );

    const { data: sqlQueryResults, isLoading: isResultsLoading } = useQuery<
        ResultRow[] | undefined,
        ApiError
    >(
        ['sqlQueryResults', sqlQueryJob?.jobId],
        async () => {
            const url = scheduledDeliveryJobStatus?.details?.fileUrl;
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
            onError: () => {
                showToastError({
                    title: 'Could not fetch SQL query results',
                });
            },
            enabled: Boolean(
                scheduledDeliveryJobStatus?.status ===
                    SchedulerJobStatus.COMPLETED &&
                    scheduledDeliveryJobStatus?.details?.fileUrl !== undefined,
            ),
            onSuccess: (data) => {
                if (data) {
                    // TODO: set initial results table config from data
                    // Update this once we start saving SQL-runner charts in the DB
                    dispatch(setInitialResultsTableConfig(data));
                }
            },
        },
    );

    const isLoading = useMemo(
        () =>
            sqlQueryRunMutation.isLoading ||
            (scheduledDeliveryJobStatus?.status ===
                SchedulerJobStatus.STARTED &&
                isResultsLoading),
        [
            sqlQueryRunMutation.isLoading,
            scheduledDeliveryJobStatus?.status,
            isResultsLoading,
        ],
    );

    return {
        ...sqlQueryRunMutation,
        isLoading,
        data: sqlQueryResults,
    };
};
