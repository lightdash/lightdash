import {
    ApiError,
    ApiJobStatusResponse,
    ApiTestSchedulerResponse,
    CreateSchedulerAndTargets,
    SchedulerAndTargets,
    SchedulerJobStatus,
    SchedulerWithLogs,
} from '@lightdash/common';
import { useMutation, useQuery, UseQueryOptions } from 'react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

const getScheduler = async (uuid: string) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const getSchedulerLogs = async (projectUuid: string) =>
    lightdashApi<SchedulerWithLogs>({
        url: `/schedulers/${projectUuid}/logs`,
        method: 'GET',
        body: undefined,
    });

const sendNowScheduler = async (scheduler: CreateSchedulerAndTargets) =>
    lightdashApi<ApiTestSchedulerResponse>({
        url: `/schedulers/send`,
        method: 'POST',
        body: JSON.stringify(scheduler),
    });

// export const useSendNowScheduler = () => {
//     const { showToastSuccess, showToastError } = useToaster();
//     return useMutation<undefined, ApiError, CreateSchedulerAndTargets>(
//         (data) => sendNowScheduler(data),
//         {
//             onSuccess: async () => {
//                 showToastSuccess({
//                     title: 'Scheduled delivery sent successfully',
//                 });
//             },
//             onError: (error) => {
//                 showToastError({
//                     title: `Failed to send scheduled delivery`,
//                     subtitle: error.error.message,
//                 });
//             },
//         },
//     );
// };

export const useScheduler = (
    uuid: string,
    useQueryOptions?: UseQueryOptions<SchedulerAndTargets, ApiError>,
) =>
    useQuery<SchedulerAndTargets, ApiError>({
        queryKey: ['scheduler', uuid],
        queryFn: () => getScheduler(uuid),
        ...useQueryOptions,
    });

export const useSchedulerLogs = (projectUuid: string) =>
    useQuery<SchedulerWithLogs, ApiError>({
        queryKey: ['schedulerLogs', projectUuid],
        queryFn: () => getSchedulerLogs(projectUuid),
    });

const getJobStatus = async (
    jobId: string,
    onComplete: () => void,
    onError: (error: Error) => void,
) => {
    lightdashApi<ApiJobStatusResponse['results']>({
        url: `/schedulers/job/${jobId}/status`,
        method: 'GET',
        body: undefined,
    })
        .then((data) => {
            if (data.status === SchedulerJobStatus.COMPLETED) {
                return onComplete();
            } else {
                setTimeout(
                    () => getJobStatus(jobId, onComplete, onError),
                    2000,
                );
            }
        })
        .catch((error) => {
            return onError(error);
        });
};

export const pollJobStatus = async (jobId: string) => {
    return new Promise<void>((resolve, reject) => {
        getJobStatus(
            jobId,
            () => resolve(),
            (error) => reject(error),
        );
    });
};

export const useSendNowScheduler = () => {
    const { showToastSuccess, showToastError, showToastInfo } = useToaster();

    return useMutation<
        ApiTestSchedulerResponse,
        ApiError,
        CreateSchedulerAndTargets
    >((data) => sendNowScheduler(data), {
        mutationKey: 'sendNowScheduler',
        onSuccess: async (response) => {
            console.log('response', response);

            // Show loading spinner
            const toastId = showToastInfo({
                title: 'Processing...',
                // description: 'Waiting for the job to complete.',
            });

            try {
                // Poll job status
                await pollJobStatus(response.jobId);

                // Update toast to success message
                showToastSuccess({
                    title: 'Scheduled delivery sent successfully',
                });
            } catch (error) {
                showToastError({
                    title: 'Failed to send scheduled delivery',
                    subtitle: error.message,
                });
            } finally {
                // Remove loading spinner
                // Assuming there's a method to remove the toast
                // removeToast(toastId);
            }
        },
        onError: (error) => {
            showToastError({
                title: 'Failed to send scheduled delivery',
                subtitle: error.error.message,
            });
        },
    });
};
