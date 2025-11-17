import {
    SchedulerJobStatus,
    type AnyType,
    type ApiError,
    type ApiJobStatusResponse,
    type ApiSchedulerRunsResponse,
    type ApiSchedulersResponse,
    type ApiTestSchedulerResponse,
    type CreateSchedulerAndTargets,
    type KnexPaginateArgs,
    type SchedulerAndTargets,
    type SchedulerWithLogs,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { type DestinationType } from './useSchedulerFilters';

const getScheduler = async (uuid: string) =>
    lightdashApi<SchedulerAndTargets>({
        url: `/schedulers/${uuid}`,
        method: 'GET',
        body: undefined,
    });

const getSchedulerLogs = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
    searchQuery?: string,
    filters?: {
        statuses?: SchedulerJobStatus[];
        createdByUserUuids?: string[];
        destinations?: DestinationType[];
    },
) => {
    const params = new URLSearchParams({
        page: paginateArgs.page.toString(),
        pageSize: paginateArgs.pageSize.toString(),
    });

    if (searchQuery) {
        params.set('searchQuery', searchQuery);
    }

    if (filters?.statuses && filters.statuses.length > 0) {
        params.set('statuses', filters.statuses.join(','));
    }

    if (filters?.createdByUserUuids && filters.createdByUserUuids.length > 0) {
        params.set('createdByUserUuids', filters.createdByUserUuids.join(','));
    }

    if (filters?.destinations && filters.destinations.length > 0) {
        params.set('destinations', filters.destinations.join(','));
    }

    return lightdashApi({
        url: `/schedulers/${projectUuid}/logs?${params.toString()}`,
        method: 'GET',
        body: undefined,
    }) as unknown as Promise<LogsResponse>;
};

const getPaginatedSchedulers = async (
    projectUuid: string,
    paginateArgs: KnexPaginateArgs,
    searchQuery?: string,
    sortBy?: string,
    sortDirection?: 'asc' | 'desc',
    filters?: {
        createdByUserUuids?: string[];
        formats?: string[];
        resourceType?: 'chart' | 'dashboard';
        resourceUuids?: string[];
        destinations?: DestinationType[];
    },
) => {
    const urlParams = new URLSearchParams({
        page: String(paginateArgs.page),
        pageSize: String(paginateArgs.pageSize),
        ...(searchQuery ? { searchQuery } : {}),
        ...(sortBy ? { sortBy } : {}),
        ...(sortDirection ? { sortDirection } : {}),
        ...(filters?.createdByUserUuids
            ? { createdByUserUuids: filters.createdByUserUuids.join(',') }
            : {}),
        ...(filters?.formats ? { formats: filters.formats.join(',') } : {}),
        ...(filters?.resourceType
            ? { resourceType: filters.resourceType }
            : {}),
        ...(filters?.resourceUuids
            ? { resourceUuids: filters.resourceUuids.join(',') }
            : {}),
        ...(filters?.destinations
            ? { destinations: filters.destinations.join(',') }
            : {}),
    }).toString();

    return lightdashApi<ApiSchedulersResponse['results']>({
        url: `/schedulers/${projectUuid}/list?${urlParams}`,
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

const getSchedulerRuns = async (
    projectUuid: string,
    {
        schedulerUuid,
        page,
        pageSize,
        sortBy,
        sortDirection,
    }: {
        schedulerUuid?: string;
        page?: number;
        pageSize?: number;
        sortBy?: 'scheduledTime' | 'createdAt';
        sortDirection?: 'asc' | 'desc';
    } = {},
): Promise<ApiSchedulerRunsResponse['results']> => {
    const params = new URLSearchParams();

    if (page !== undefined) params.set('page', String(page));
    if (pageSize !== undefined) params.set('pageSize', String(pageSize));
    if (sortBy) params.set('sortBy', sortBy);
    if (sortDirection) params.set('sortDirection', sortDirection);
    if (schedulerUuid) params.set('schedulerUuid', schedulerUuid);

    return lightdashApi({
        url: `/schedulers/${projectUuid}/runs?${params.toString()}`,
        method: 'GET',
        body: undefined,
    }) as unknown as Promise<ApiSchedulerRunsResponse['results']>;
};

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

type LogsResponse = {
    pagination?: {
        page: number;
        pageSize: number;
        totalPageCount: number;
        totalResults: number;
    };
    data: SchedulerWithLogs;
};

export const useSchedulerLogs = ({
    projectUuid,
    paginateArgs,
    searchQuery,
    filters,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
    searchQuery?: string;
    filters?: {
        statuses?: SchedulerJobStatus[];
        createdByUserUuids?: string[];
        destinations?: DestinationType[];
    };
}) => {
    return useInfiniteQuery<LogsResponse>({
        queryKey: [
            'schedulerLogs',
            projectUuid,
            paginateArgs,
            searchQuery,
            filters,
        ],
        queryFn: async ({ pageParam = 0 }) => {
            return getSchedulerLogs(
                projectUuid,
                {
                    page: (pageParam as number) + 1,
                    pageSize: paginateArgs?.pageSize || 10,
                },
                searchQuery,
                filters,
            );
        },
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length - 1;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages - 1 ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!projectUuid,
    });
};

export const usePaginatedSchedulers = ({
    projectUuid,
    paginateArgs,
    searchQuery,
    sortBy,
    sortDirection,
    filters,
}: {
    projectUuid: string;
    paginateArgs?: KnexPaginateArgs;
    searchQuery?: string;
    sortBy?: string;
    sortDirection?: 'asc' | 'desc';
    filters?: {
        createdByUserUuids?: string[];
        formats?: string[];
        resourceType?: 'chart' | 'dashboard';
        resourceUuids?: string[];
    };
}) => {
    return useInfiniteQuery<ApiSchedulersResponse['results']>({
        queryKey: [
            'paginatedSchedulers',
            projectUuid,
            paginateArgs,
            searchQuery,
            sortBy,
            sortDirection,
            filters,
        ],
        queryFn: async ({ pageParam = 0 }) => {
            return getPaginatedSchedulers(
                projectUuid,
                {
                    page: pageParam as number,
                    pageSize: paginateArgs?.pageSize ?? 10,
                },
                searchQuery,
                sortBy,
                sortDirection,
                filters,
            );
        },
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length - 1;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages - 1 ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
        enabled: !!projectUuid,
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

export const useSchedulerLatestRun = (
    projectUuid: string,
    schedulerUuid: string,
) => {
    return useQuery<ApiSchedulerRunsResponse['results'], ApiError>({
        queryKey: ['schedulerLatestRun', projectUuid, schedulerUuid],
        queryFn: () =>
            getSchedulerRuns(projectUuid, {
                schedulerUuid,
                page: 1,
                pageSize: 1,
                sortBy: 'scheduledTime',
                sortDirection: 'desc',
            }),
        enabled: Boolean(projectUuid && schedulerUuid),
        refetchOnWindowFocus: false,
    });
};
