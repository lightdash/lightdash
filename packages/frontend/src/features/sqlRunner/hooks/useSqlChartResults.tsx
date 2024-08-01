import {
    isErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiSqlChartWithResults,
    type ApiSqlRunnerJobStatusResponse,
    type ResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';
import { type ResultsAndColumns } from './useSqlQueryRun';

const scheduleSavedSqlChartResultsJob = async ({
    projectUuid,
    slug,
}: {
    projectUuid: string;
    slug: string;
}) =>
    lightdashApi<ApiSqlChartWithResults['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}/results-job`,
        method: 'GET',
        body: undefined,
    });

/**
 * Gets the SQL chart results from the server
 *
 * Steps:
 * 1. Schedule the SQL chart job
 * 2. Get the status of the scheduled job
 * 3. Fetch the results of the job
 */
export const useSqlQueryRun = (
    projectUuid: string,
    slug: string | undefined,
) => {
    const { showToastError } = useToaster();
    const jobQuery = useQuery<ApiSqlChartWithResults['results'], ApiError>(
        ['sqlChartResults', projectUuid, slug],
        () =>
            scheduleSavedSqlChartResultsJob({
                projectUuid,
                slug: slug!,
            }),
        {
            enabled: Boolean(slug),
        },
    );

    const {
        data: scheduledDeliveryJobStatus,
        isFetching: jobIsLoading,
        error: jobError,
    } = useQuery<
        ApiSqlRunnerJobStatusResponse['results'] | undefined,
        ApiError
    >(
        ['jobStatus', jobQuery.data?.jobId],
        () => {
            return getSchedulerJobStatus<ApiSqlRunnerJobStatusResponse>(
                jobQuery.data!.jobId,
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
            enabled: Boolean(jobQuery.data?.jobId),
        },
    );

    const {
        data: sqlQueryResults,
        isFetching: isResultsLoading,
        error: resultsError,
    } = useQuery<
        ResultRow[] | undefined,
        ApiError,
        ResultsAndColumns | undefined
    >(
        ['sqlChartResults', jobQuery.data?.jobId],
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
            keepPreviousData: true,
        },
    );

    const error = useMemo(
        () => jobQuery.error || jobError || resultsError,
        [jobQuery.error, jobError, resultsError],
    );

    const isLoading = useMemo(
        () =>
            jobQuery.isLoading ||
            jobIsLoading ||
            scheduledDeliveryJobStatus?.status === SchedulerJobStatus.STARTED ||
            isResultsLoading,
        [
            jobQuery.isLoading,
            jobIsLoading,
            scheduledDeliveryJobStatus?.status,
            isResultsLoading,
        ],
    );

    return {
        isLoading,
        data: sqlQueryResults,
        error,
    };
};
