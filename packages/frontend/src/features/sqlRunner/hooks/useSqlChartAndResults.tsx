import {
    SchedulerJobStatus,
    type ApiError,
    type ApiJobStatusResponse,
    type ApiSqlChartWithResults,
    type ResultRow,
    type SqlChart,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

const scheduleSavedSqlChartJobAndGetResults = async ({
    projectUuid,
    savedSqlUuid,
}: {
    projectUuid: string;
    savedSqlUuid: string;
}) =>
    lightdashApi<ApiSqlChartWithResults['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/chart-and-results`,
        method: 'GET',
        body: undefined,
    });

/**
 * Gets the Chart and SQL query results from the server
 *
 * Steps:
 * 1. Schedule the SQL query job and get the jobId + chart
 * 2. Get the status of the scheduled job
 * 3. Fetch the results of the job
 */
export const useSqlChartAndResults = ({
    savedSqlUuid,
    projectUuid,
}: {
    savedSqlUuid: string | null;
    projectUuid: string;
}) => {
    const { showToastError } = useToaster();
    const [chart, setChart] = useState<SqlChart>();
    const sqlChartAndResultsQuery = useQuery<
        ApiSqlChartWithResults['results'],
        ApiError
    >(
        ['sqlChartAndResults', projectUuid, savedSqlUuid],
        () =>
            scheduleSavedSqlChartJobAndGetResults({
                projectUuid,
                savedSqlUuid: savedSqlUuid!,
            }),
        {
            enabled: Boolean(savedSqlUuid),
        },
    );

    const { data: sqlChartAndResultsJob } = sqlChartAndResultsQuery;

    useEffect(() => {
        // Set the chart if it exists
        if (sqlChartAndResultsJob?.chart) {
            setChart(sqlChartAndResultsJob.chart);
        }
    }, [sqlChartAndResultsJob]);

    const { data: scheduledDeliveryJobStatus } = useQuery<
        ApiJobStatusResponse['results'] | undefined,
        ApiError
    >(
        ['jobStatus', sqlChartAndResultsJob?.jobId],
        () => {
            if (!sqlChartAndResultsJob?.jobId) return;
            return getSchedulerJobStatus(sqlChartAndResultsJob.jobId);
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
            enabled: Boolean(sqlChartAndResultsJob?.jobId !== undefined),
        },
    );

    const { data: sqlQueryResults, isLoading: isResultsLoading } = useQuery<
        ResultRow[] | undefined,
        ApiError
    >(
        ['sqlChartQueryResults', sqlChartAndResultsJob?.jobId],
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
        },
    );

    const isLoading = useMemo(
        () =>
            sqlChartAndResultsQuery.isLoading ||
            (scheduledDeliveryJobStatus?.status ===
                SchedulerJobStatus.STARTED &&
                isResultsLoading) ||
            chart === undefined,
        [
            sqlChartAndResultsQuery.isLoading,
            scheduledDeliveryJobStatus?.status,
            isResultsLoading,
            chart,
        ],
    );

    return {
        ...sqlChartAndResultsQuery,
        isLoading,
        data: { results: sqlQueryResults, chart },
    };
};
