import {
    isApiSemanticLayerJobSuccessResponse,
    isSemanticLayerJobErrorDetails,
    SchedulerJobStatus,
    type ApiError,
    type ApiSemanticLayerJobStatusResponse,
    type ApiSemanticLayerJobSuccessResponse,
} from '@lightdash/common';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

export const getSemanticLayerCompleteJob = async (
    jobId: string,
): Promise<ApiSemanticLayerJobSuccessResponse['results'] | ApiError> => {
    const job = await getSchedulerJobStatus<
        ApiSemanticLayerJobStatusResponse['results']
    >(jobId);
    if (
        job.status === SchedulerJobStatus.SCHEDULED ||
        job.status === SchedulerJobStatus.STARTED
    ) {
        return new Promise((resolve) => {
            setTimeout(async () => {
                resolve(await getSemanticLayerCompleteJob(jobId));
            }, 1000);
        });
    }
    if (isApiSemanticLayerJobSuccessResponse(job)) {
        return job;
    } else {
        return <ApiError>{
            status: SchedulerJobStatus.ERROR,
            error: {
                name: 'Error',
                statusCode: 500,
                message: isSemanticLayerJobErrorDetails(job.details)
                    ? job.details.error
                    : 'Job failed',
                data: isSemanticLayerJobErrorDetails(job.details)
                    ? job.details
                    : {},
            },
        };
    }
};
