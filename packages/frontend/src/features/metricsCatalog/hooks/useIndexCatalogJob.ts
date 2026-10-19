import {
    SchedulerJobStatus,
    type ApiError,
    type ApiJobStatusResponse,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

// Recursively poll the job status until it is completed or errored
const getIndexCatalogCompleteJob = async (
    lightdashApi: LightdashApi,
    jobId: string,
): Promise<ApiJobStatusResponse['results']> => {
    const job = await getSchedulerJobStatus<ApiJobStatusResponse['results']>(
        lightdashApi,
        jobId,
    );
    if (job.status === SchedulerJobStatus.COMPLETED) {
        return job;
    }
    if (job.status === SchedulerJobStatus.ERROR) {
        throw <ApiError>{
            status: SchedulerJobStatus.ERROR,
            error: {
                name: 'Error',
                statusCode: 500,
                message: job.details?.error,
                data: job.details,
            },
        };
    }
    return new Promise((resolve) => {
        setTimeout(async () => {
            resolve(await getIndexCatalogCompleteJob(lightdashApi, jobId));
        }, 2000); // retry after 2 seconds
    });
};

export const useIndexCatalogJob = (
    jobId: string | undefined,
    onSuccess: (job: ApiJobStatusResponse['results']) => void,
) => {
    const lightdashApi = useLightdashApi();
    const { showToastApiError, showToastError } = useToaster();
    const queryClient = useQueryClient();
    return useQuery<ApiJobStatusResponse['results'], ApiError>({
        queryKey: ['index-catalog-job', jobId],
        queryFn: () => getIndexCatalogCompleteJob(lightdashApi, jobId || ''),
        enabled: !!jobId,
        staleTime: 0,
        onSuccess: async (job) => {
            if (job.status === SchedulerJobStatus.COMPLETED) {
                await queryClient.resetQueries(['metrics-catalog'], {
                    exact: false,
                });
                await queryClient.invalidateQueries(['catalog'], {
                    exact: false,
                });
                await queryClient.invalidateQueries(['project-tags'], {
                    exact: false,
                });
                await queryClient.invalidateQueries(['metrics-tree'], {
                    exact: false,
                });
                await queryClient.invalidateQueries(['metric-owners'], {
                    exact: false,
                });
                onSuccess(job);
            } else if (job.status === SchedulerJobStatus.ERROR) {
                showToastError({
                    title: 'Failed to refresh catalog',
                });
            }
        },
        onError: ({ error }: ApiError) => {
            showToastApiError({
                title: 'Failed to refresh catalog',
                apiError: error,
            });
        },
    });
};
