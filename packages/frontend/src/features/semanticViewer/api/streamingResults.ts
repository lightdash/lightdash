import {
    isErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiSqlRunnerJobStatusResponse,
    type SemanticLayerQuery,
    type SemanticLayerResultRow,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

const scheduleSemanticLayerJob = async ({
    projectUuid,
    query,
}: {
    projectUuid: string;
    query: SemanticLayerQuery;
}) =>
    lightdashApi<ApiJobScheduledResponse['results']>({
        url: `/projects/${projectUuid}/semantic-layer/run`,
        method: 'POST',
        version: 'v2',
        body: JSON.stringify(query),
    });

export type SemanticLayerResults = {
    results: SemanticLayerResultRow[];
};

/**
 * Gets the SQL query results from the server
 *
 * Steps:
 * 1. Schedule the SQL query job
 * 2. Get the status of the scheduled job
 * 3. Fetch the results of the job
 */
export const useSemanticViewerQueryRun = (
    useQueryOptions?: UseQueryOptions<
        SemanticLayerResultRow[] | undefined,
        ApiError,
        SemanticLayerResults | undefined
    >,
) => {
    const { showToastError } = useToaster();

    const {
        mutateAsync,
        isLoading: isMutating,
        data: queryJob,
    } = useMutation<
        ApiJobScheduledResponse['results'],
        ApiError,
        {
            projectUuid: string;
            query: SemanticLayerQuery;
        }
    >(
        ({ projectUuid, query }) =>
            scheduleSemanticLayerJob({ projectUuid, query }),
        {
            mutationKey: ['semanticViewer', 'run'],
        },
    );

    const { data: scheduledDeliveryJobStatus, isFetching: jobIsLoading } =
        useQuery<
            ApiSqlRunnerJobStatusResponse['results'] | undefined,
            ApiError
        >(
            ['jobStatus', queryJob?.jobId],
            () => {
                if (!queryJob?.jobId) return;
                return getSchedulerJobStatus<ApiSqlRunnerJobStatusResponse>(
                    queryJob.jobId,
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
                enabled: Boolean(queryJob && queryJob?.jobId !== undefined),
            },
        );

    const { data: sqlQueryResults, isFetching: isResultsLoading } = useQuery<
        SemanticLayerResultRow[] | undefined,
        ApiError,
        SemanticLayerResults | undefined
    >(
        ['semanticViewerQueryResults', queryJob?.jobId],
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
            const jsonObjects: SemanticLayerResultRow[] = jsonStrings
                .map((jsonString) => {
                    try {
                        if (!jsonString) {
                            return {};
                        }

                        return JSON.parse(jsonString);
                    } catch (e) {
                        throw new Error('Error parsing JSON');
                    }
                })
                .filter((obj) => obj !== null);
            return jsonObjects;
        },
        {
            enabled: Boolean(
                scheduledDeliveryJobStatus?.status ===
                    SchedulerJobStatus.COMPLETED &&
                    !isErrorDetails(scheduledDeliveryJobStatus?.details) &&
                    scheduledDeliveryJobStatus?.details?.fileUrl !== undefined,
            ),
            keepPreviousData: true,
            ...useQueryOptions,
            select: (data) => {
                if (
                    !data ||
                    isErrorDetails(scheduledDeliveryJobStatus?.details)
                ) {
                    return undefined;
                }

                return {
                    results: data,
                };
            },
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
        mutateAsync,
        isLoading,
        data: sqlQueryResults,
    };
};
