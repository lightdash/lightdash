import {
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

    if (job.status === SchedulerJobStatus.COMPLETED) {
        return job;
    }

    if (job.status === SchedulerJobStatus.ERROR) {
        return <ApiError>{
            status: SchedulerJobStatus.ERROR,
            error: {
                name: 'Error',
                statusCode: 500,
                message: job.details.error,
                data: job.details,
            },
        };
    }

    return new Promise((resolve) => {
        setTimeout(async () => {
            resolve(await getSemanticLayerCompleteJob(jobId));
        }, 1000);
    });
};
