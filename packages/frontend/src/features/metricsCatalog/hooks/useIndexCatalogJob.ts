import {
    SchedulerJobStatus,
    type ApiError,
    type ApiJobStatusResponse,
} from '@lightdash/common';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import { getSchedulerJobStatus } from '../../scheduler/hooks/useScheduler';

// Recursively poll the job status until it is completed or errored
const getIndexCatalogCompleteJob = async (
    jobId: string,
): Promise<ApiJobStatusResponse['results']> => {
    const job =
        await getSchedulerJobStatus<ApiJobStatusResponse['results']>(jobId);
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
            resolve(await getIndexCatalogCompleteJob(jobId));
        }, 2000); // retry after 2 seconds
    });
};

export const useIndexCatalogJob = (
    jobId: string | undefined,
    onSuccess: (job: ApiJobStatusResponse['results']) => void,
) => {
    const { showToastApiError, showToastError } = useToaster();
    const { t } = useTranslation('metricsCatalog');
    const queryClient = useQueryClient();
    return useQuery<ApiJobStatusResponse['results'], ApiError>({
        queryKey: ['index-catalog-job', jobId],
        queryFn: () => getIndexCatalogCompleteJob(jobId || ''),
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
                    title: t('toasts.refreshCatalogFailed'),
                });
            }
        },
        onError: ({ error }: ApiError) => {
            showToastApiError({
                title: t('toasts.refreshCatalogFailed'),
                apiError: error,
            });
        },
    });
};
