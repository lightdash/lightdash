import {
    isApiSqlRunnerJobSuccessResponse,
    isErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiSqlRunnerJobStatusResponse,
    type ApiSqlRunnerJobSuccessResponse,
} from '@lightdash/common';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

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
