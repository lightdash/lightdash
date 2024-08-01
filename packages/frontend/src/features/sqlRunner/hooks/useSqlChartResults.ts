import {
    isErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiJobScheduledResponse,
    type ApiSqlRunnerJobStatusResponse,
    type ResultRow,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

const getResultsStream = async (url: string | undefined) => {
    try {
        if (!url) {
            throw new Error('No URL provided');
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
    } catch (e) {
        // convert error to ApiError
        throw <ApiError>{
            status: 'error',
            error: {
                name: 'Error',
                statusCode: 500,
                message: e.message,
                data: {},
            },
        };
    }
};

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

    // recursively check job status until it's complete
    async function getCompleteJob(): Promise<
        ApiSqlRunnerJobStatusResponse['results']
    > {
        const job = await getSchedulerJobStatus<
            ApiSqlRunnerJobStatusResponse['results']
        >(scheduledJob.jobId);
        if (
            job.status === SchedulerJobStatus.SCHEDULED ||
            job.status === SchedulerJobStatus.STARTED
        ) {
            return new Promise((resolve) => {
                setTimeout(async () => {
                    resolve(await getCompleteJob());
                }, 3000);
            });
        }
        if (job.status === SchedulerJobStatus.COMPLETED) {
            return job;
        } else {
            throw <ApiError>{
                status: 'error',
                error: {
                    name: 'Error',
                    statusCode: 500,
                    message: isErrorDetails(job.details)
                        ? job.details.error
                        : 'Job failed',
                    data: {},
                },
            };
        }
    }

    const job = await getCompleteJob();
    const url =
        job?.details && !isErrorDetails(job.details)
            ? job.details.fileUrl
            : undefined;
    return getResultsStream(url);
};

export const useSqlQueryRun = (
    projectUuid: string,
    slug: string | undefined,
) => {
    return useQuery<ResultRow[] | undefined, ApiError>(
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
