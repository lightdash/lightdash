import {
    SchedulerJobStatus,
    type ApiError,
    type ApiJobStatusResponse,
    type ApiTestSchedulerResponse,
    type CreateSchedulerAndTargets,
    type SchedulerAndTargets,
    type SchedulerWithLogs,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';
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

export const getSchedulerJobStatus = async (jobId: string) =>
    lightdashApi<ApiJobStatusResponse['results']>({
        url: `/schedulers/job/${jobId}/status`,
        method: 'GET',
        body: undefined,
    });

const sendNowScheduler = async (scheduler: CreateSchedulerAndTargets) =>
    lightdashApi<ApiTestSchedulerResponse['results']>({
        url: `/schedulers/send`,
        method: 'POST',
        body: JSON.stringify(scheduler),
    });

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
    getSchedulerJobStatus(jobId)
        .then((data) => {
            if (data.status === SchedulerJobStatus.COMPLETED) {
                return onComplete();
            } else if (data.status === SchedulerJobStatus.ERROR) {
                onError(new Error(data.details?.error || 'Job failed'));
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
    return new Promise<void>((resolve, reject) =>
        getJobStatus(
            jobId,
            () => resolve(),
            (error) => reject(error),
        ),
    );
};

export const useSendNowScheduler = () => {
    const queryClient = useQueryClient();
    const {
        showToastError,
        showToastInfo,
        showToastSuccess,
        showToastApiError,
    } = useToaster();

    const sendNowMutation = useMutation<
        ApiTestSchedulerResponse['results'],
        ApiError,
        CreateSchedulerAndTargets
    >(
        (res) => {
            showToastInfo({
                key: 'toast-info-job-status',
                title: 'Processing job...',
                loading: true,
                autoClose: false,
            });
            return sendNowScheduler(res);
        },
        {
            mutationKey: ['sendNowScheduler'],
            onSuccess: () => {},
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to process job',
                    apiError: error,
                });
            },
        },
    );

    const { data: sendNowData } = sendNowMutation;

    const { data: scheduledDeliveryJobStatus } = useQuery<
        ApiJobStatusResponse['results'] | undefined,
        ApiError
    >(
        ['jobStatus', sendNowData?.jobId],
        () => {
            if (!sendNowData?.jobId) return;

            setTimeout(() => {
                notifications.hide('toast-info-job-status');
            }, 1000);

            return getSchedulerJobStatus(sendNowData.jobId);
        },
        {
            refetchInterval: (data) => {
                if (
                    data?.status === SchedulerJobStatus.COMPLETED ||
                    data?.status === SchedulerJobStatus.ERROR
                )
                    return false;

                return 2000;
            },
            onSuccess: (data) => {
                if (data) {
                    showToastInfo({
                        key: 'toast-info-job-scheduled-delivery-status',
                        title: 'Processing Scheduled delivery...',
                        loading: true,
                        autoClose: false,
                    });
                }
                if (data?.status === SchedulerJobStatus.COMPLETED) {
                    showToastSuccess({
                        title: 'Scheduled delivery sent successfully',
                    });

                    return setTimeout(
                        () =>
                            notifications.hide(
                                'toast-info-job-scheduled-delivery-status',
                            ),
                        1000,
                    );
                }
                if (data?.status === SchedulerJobStatus.ERROR) {
                    showToastError({
                        title: 'Failed to send scheduled delivery',
                        ...(data?.details?.error && {
                            subtitle: data.details.error,
                        }),
                    });
                    return setTimeout(
                        () =>
                            notifications.hide(
                                'toast-info-job-scheduled-delivery-status',
                            ),
                        1000,
                    );
                }
            },
            onError: async ({ error }) => {
                showToastApiError({
                    title: 'Error polling job status',
                    apiError: error,
                });

                setTimeout(
                    () =>
                        notifications.hide(
                            'toast-info-job-scheduled-delivery-status',
                        ),
                    1000,
                );

                await queryClient.cancelQueries([
                    'jobStatus',
                    sendNowData?.jobId,
                ]);
            },
            enabled: Boolean(sendNowData && sendNowData?.jobId !== undefined),
        },
    );

    const isLoading = useMemo(
        () =>
            sendNowMutation.isLoading ||
            scheduledDeliveryJobStatus?.status === SchedulerJobStatus.STARTED,
        [scheduledDeliveryJobStatus?.status, sendNowMutation.isLoading],
    );

    return {
        ...sendNowMutation,
        isLoading,
    };
};
