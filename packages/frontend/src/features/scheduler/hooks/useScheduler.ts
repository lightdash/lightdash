import {
    SchedulerJobStatus,
    type AnyType,
    type ApiError,
    type ApiJobStatusResponse,
    type ApiSchedulersResponse,
    type ApiTestSchedulerResponse,
    type CreateSchedulerAndTargets,
    type KnexPaginateArgs,
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

const getPaginatedSchedulers = async (
    projectUuid: string,
    paginateArgs?: KnexPaginateArgs,
    searchQuery?: string,
    sortBy?: string,
    sortDirection?: 'asc' | 'desc',
) => {
    const urlParams = new URLSearchParams({
        ...(paginateArgs
            ? {
                  page: String(paginateArgs.page),
                  pageSize: String(paginateArgs.pageSize),
              }
            : {}),
        ...(searchQuery ? { searchQuery } : {}),
        ...(sortBy ? { sortBy } : {}),
        ...(sortDirection ? { sortDirection } : {}),
    }).toString();

    return lightdashApi<ApiSchedulersResponse['results']>({
        url: `/schedulers/${projectUuid}/list${
            urlParams ? `?${urlParams}` : ''
        }`,
        method: 'GET',
        body: undefined,
    });
};

export const getSchedulerJobStatus = async <
    T = ApiJobStatusResponse['results'],
>(
    jobId: string,
) =>
    lightdashApi<T extends ApiJobStatusResponse['results'] ? T : never>({
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

const sendNowSchedulerByUuid = async (uuid: string) =>
    lightdashApi<ApiTestSchedulerResponse['results']>({
        url: `/schedulers/${uuid}/send`,
        method: 'POST',
        body: undefined,
    });

export const useScheduler = (
    uuid: string | null,
    useQueryOptions?: UseQueryOptions<SchedulerAndTargets, ApiError>,
) =>
    useQuery<SchedulerAndTargets, ApiError>({
        queryKey: ['scheduler', uuid],
        queryFn: () => getScheduler(uuid!),
        enabled: !!uuid,
        ...useQueryOptions,
    });

export const useSchedulerLogs = (projectUuid: string) =>
    useQuery<SchedulerWithLogs, ApiError>({
        queryKey: ['schedulerLogs', projectUuid],
        queryFn: () => getSchedulerLogs(projectUuid),
    });

export const usePaginatedSchedulers = ({
    projectUuid,
    paginateArgs,
    searchQuery,
    sortBy,
    sortDirection,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
    searchQuery?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
}) => {
    return useQuery<ApiSchedulersResponse['results'], ApiError>({
        queryKey: [
            'paginatedSchedulers',
            projectUuid,
            paginateArgs,
            searchQuery,
            sortBy,
            sortDirection,
        ],
        queryFn: () =>
            getPaginatedSchedulers(
                projectUuid,
                paginateArgs,
                searchQuery,
                sortBy,
                sortDirection,
            ),
    });
};

const getJobStatus = async (
    jobId: string,
    onComplete: (response: Record<string, AnyType> | null) => void,
    onError: (error: Error) => void,
) => {
    getSchedulerJobStatus(jobId)
        .then((data) => {
            if (data.status === SchedulerJobStatus.COMPLETED) {
                return onComplete(data.details);
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
    return new Promise<Record<string, AnyType> | null>((resolve, reject) =>
        getJobStatus(
            jobId,
            (details) => resolve(details),
            (error) => reject(error),
        ),
    );
};

const useSendNowJobStatus = (jobId: string | undefined) => {
    const queryClient = useQueryClient();
    const {
        showToastError,
        showToastInfo,
        showToastSuccess,
        showToastApiError,
    } = useToaster();
    return useQuery<ApiJobStatusResponse['results'] | undefined, ApiError>(
        ['jobStatus', jobId],
        () => {
            if (!jobId) return;

            setTimeout(() => {
                notifications.hide('toast-info-job-status');
            }, 1000);

            return getSchedulerJobStatus(jobId);
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

                await queryClient.cancelQueries(['jobStatus', jobId]);
            },
            enabled: Boolean(jobId !== undefined),
        },
    );
};

export const useSendNowScheduler = () => {
    const { showToastInfo, showToastApiError } = useToaster();

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
            onSuccess: (res) => {
                pollJobStatus(res.jobId || '')
                    .then((data) => {
                        if (data?.status === SchedulerJobStatus.ERROR) {
                            throw new Error(data?.details?.error);
                        }
                    })
                    .catch((e) => {
                        throw e;
                    });
            },
            onError: (apiError: ApiError) => {
                showToastApiError({
                    key: 'toast-info-job-status',
                    title: 'Failed to send scheduled delivery',
                    apiError: apiError.error,
                });
            },
        },
    );

    const { data: scheduledDeliveryJobStatus } = useSendNowJobStatus(
        sendNowMutation.data?.jobId,
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

export const useSendNowSchedulerByUuid = (schedulerUuid: string) => {
    const { showToastInfo, showToastApiError } = useToaster();

    const sendNowMutation = useMutation<
        ApiTestSchedulerResponse['results'],
        ApiError,
        void
    >(
        async () => {
            showToastInfo({
                key: 'toast-info-job-status',
                title: 'Processing job...',
                loading: true,
                autoClose: false,
            });
            return sendNowSchedulerByUuid(schedulerUuid);
        },
        {
            mutationKey: ['sendNowSchedulerByUuid', schedulerUuid],
            onSuccess: (res) => {
                pollJobStatus(res.jobId || '')
                    .then((data) => {
                        if (data?.status === SchedulerJobStatus.ERROR) {
                            throw new Error(data?.details?.error);
                        }
                    })
                    .catch((e) => {
                        throw e;
                    });
            },
            onError: (apiError: ApiError) => {
                showToastApiError({
                    key: 'toast-info-job-status',
                    title: 'Failed to send scheduled delivery',
                    apiError: apiError.error,
                });
            },
        },
    );

    const { data: scheduledDeliveryJobStatus } = useSendNowJobStatus(
        sendNowMutation.data?.jobId,
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
