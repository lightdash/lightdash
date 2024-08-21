import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiSqlRunnerJobStatusResponse,
    type ApiSqlRunnerJobSuccessResponse,
    type ResultRow,
} from '@lightdash/common';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

// To be reused across all hooks that need to fetch SQL query results
export const getResultsFromStream = async (url: string | undefined) => {
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

// recursively check job status until it's complete
export const getSqlRunnerCompleteJob = async (
    jobId: string,
): Promise<ApiSqlRunnerJobSuccessResponse['results'] | ApiError> => {
    const job = await getSchedulerJobStatus<
        ApiSqlRunnerJobStatusResponse['results']
    >(jobId);
    if (
        job.status === SchedulerJobStatus.SCHEDULED ||
        job.status === SchedulerJobStatus.STARTED
    ) {
        return new Promise((resolve) => {
            setTimeout(async () => {
                resolve(await getSqlRunnerCompleteJob(jobId));
            }, 1000);
        });
    }
    if (isApiSqlRunnerJobSuccessResponse(job)) {
        return job;
    } else {
        return <ApiError>{
            status: SchedulerJobStatus.ERROR,
            error: {
                name: 'Error',
                statusCode: 500,
                message: isErrorDetails(job.details)
                    ? job.details.error
                    : 'Job failed',
                data: isErrorDetails(job.details) ? job.details : {},
            },
        };
    }
};
