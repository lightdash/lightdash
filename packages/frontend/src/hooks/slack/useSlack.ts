import {
    SchedulerJobStatus,
    type ApiError,
    type ApiJobStatusResponse,
    type SlackAppCustomSettings,
    type SlackChannel,
    type SlackSettings,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { lightdashApi } from '../../api';
import { getSchedulerJobStatus } from '../../features/scheduler/hooks/useScheduler';
import useToaster from '../toaster/useToaster';

const getSlack = async () =>
    lightdashApi<SlackSettings>({
        url: `/slack/`,
        method: 'GET',
        body: undefined,
    });

export const useGetSlack = () =>
    useQuery<SlackSettings, ApiError>({
        queryKey: ['slack'],
        queryFn: () => getSlack(),
        retry: false,
    });

const deleteSlack = async () =>
    lightdashApi<null>({
        url: `/slack/`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteSlack = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, undefined>(deleteSlack, {
        onSuccess: async () => {
            await queryClient.invalidateQueries(['slack']);

            showToastSuccess({
                title: `Deleted! Slack integration was deleted`,
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to delete Slack integration`,
                apiError: error,
            });
        },
    });
};

const getSlackChannels = async ({
    search,
    excludeArchived,
    excludeDms,
    excludeGroups,
    forceRefresh,
    includeChannelIds,
}: {
    search: string;
    excludeArchived: boolean;
    excludeDms: boolean;
    excludeGroups: boolean;
    forceRefresh: boolean;
    includeChannelIds?: string[];
}) => {
    const queryString = new URLSearchParams();
    queryString.set('search', search);
    queryString.set('excludeArchived', excludeArchived.toString());
    queryString.set('excludeDms', excludeDms.toString());
    queryString.set('excludeGroups', excludeGroups.toString());
    queryString.set('forceRefresh', forceRefresh.toString());
    if (includeChannelIds && includeChannelIds.length > 0) {
        queryString.set('includeChannelIds', includeChannelIds.join(','));
    }

    return lightdashApi<SlackChannel[] | undefined>({
        url: `/slack/channels?${queryString.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useSlackChannels = (
    search: string,
    {
        excludeArchived = true,
        excludeDms = false,
        excludeGroups = false,
        includeChannelIds,
    }: {
        excludeArchived?: boolean;
        excludeDms?: boolean;
        excludeGroups?: boolean;
        includeChannelIds?: string[];
    },
    useQueryOptions?: UseQueryOptions<SlackChannel[] | undefined, ApiError>,
) => {
    const queryClient = useQueryClient();
    const [isRefreshing, setIsRefreshing] = useState(false);

    const query = useQuery<SlackChannel[] | undefined, ApiError>({
        queryKey: [
            'slack_channels',
            search,
            excludeArchived,
            excludeDms,
            excludeGroups,
            includeChannelIds,
        ],
        queryFn: () =>
            getSlackChannels({
                search,
                excludeArchived,
                excludeDms,
                excludeGroups,
                forceRefresh: false,
                includeChannelIds,
            }),
        ...useQueryOptions,
    });

    const refresh = useCallback(async () => {
        setIsRefreshing(true);
        const slackChannelsAfterRefresh = await getSlackChannels({
            search,
            excludeArchived,
            excludeDms,
            excludeGroups,
            forceRefresh: true,
            includeChannelIds,
        });
        queryClient.setQueryData(
            [
                'slack_channels',
                search,
                excludeArchived,
                excludeDms,
                excludeGroups,
                includeChannelIds,
            ],
            slackChannelsAfterRefresh,
        );
        setIsRefreshing(false);
    }, [
        search,
        excludeArchived,
        excludeDms,
        excludeGroups,
        includeChannelIds,
        queryClient,
    ]);

    return {
        ...query,
        isRefreshing: query.isFetching || isRefreshing,
        refresh,
    };
};

const getSlackChannelById = async (channelId: string) =>
    lightdashApi<SlackChannel | null>({
        url: `/slack/channels/${encodeURIComponent(channelId)}`,
        method: 'GET',
        body: undefined,
    });

/**
 * Hook for on-demand channel lookup when user pastes a channel ID
 */
export const useSlackChannelLookup = () => {
    const queryClient = useQueryClient();

    return useMutation<SlackChannel | null, ApiError, string>({
        mutationFn: getSlackChannelById,
        onSuccess: async (channel) => {
            if (channel) {
                // Invalidate channels queries to include the new channel
                await queryClient.invalidateQueries({
                    queryKey: ['slack_channels'],
                    refetchType: 'none', // Don't refetch, just mark as stale
                });
            }
        },
    });
};

const updateSlackCustomSettings = async (opts: SlackAppCustomSettings) =>
    lightdashApi<null>({
        url: `/slack/custom-settings`,
        method: 'PUT',
        body: JSON.stringify({
            ...opts,
            appProfilePhotoUrl: opts.appProfilePhotoUrl || null,
        }),
    });

export const useUpdateSlackAppCustomSettingsMutation = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<null, ApiError, SlackAppCustomSettings>(
        updateSlackCustomSettings,
        {
            onSuccess: async () => {
                await queryClient.invalidateQueries(['slack']);

                showToastSuccess({
                    title: `Success! Slack app settings updated`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update Slack app settings`,
                    apiError: error,
                });
            },
        },
    );
};

const syncSlackChannels = async () =>
    lightdashApi<{ jobId: string }>({
        url: `/slack/sync-channels`,
        method: 'POST',
        body: undefined,
    });

// Recursively poll the job status until it is completed or errored
const getSyncSlackChannelsCompleteJob = async (
    jobId: string,
): Promise<ApiJobStatusResponse['results']> => {
    const job = await getSchedulerJobStatus<ApiJobStatusResponse['results']>(
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
                message: job.details?.error ?? 'Slack channel sync failed',
                data: job.details,
            },
        };
    }

    return new Promise((resolve) => {
        setTimeout(async () => {
            resolve(await getSyncSlackChannelsCompleteJob(jobId));
        }, 2000); // retry after 2 seconds
    });
};

/**
 * Hook to poll the Slack channel sync job status.
 * Shows loading state while syncing, success when done, error on failure.
 */
export const useSyncSlackChannelsJob = (
    jobId: string | undefined,
    onComplete?: () => void,
) => {
    const { showToastApiError, showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    const query = useQuery<ApiJobStatusResponse['results'], ApiError>({
        queryKey: ['sync-slack-channels-job', jobId],
        queryFn: () => getSyncSlackChannelsCompleteJob(jobId || ''),
        enabled: !!jobId,
        staleTime: 0,
        onSuccess: async (job) => {
            if (job.status === SchedulerJobStatus.COMPLETED) {
                // Invalidate channels queries to refresh the cached data
                await queryClient.invalidateQueries({
                    queryKey: ['slack_channels'],
                });
                // Also invalidate the slack installation query to refresh the sync status
                await queryClient.invalidateQueries({
                    queryKey: ['slack'],
                });

                showToastSuccess({
                    title: 'Slack channels synced successfully',
                    subtitle: `${
                        job.details?.totalChannels ?? 'All'
                    } channels updated.`,
                });

                onComplete?.();
            }
        },
        onError: async ({ error }: ApiError) => {
            // Invalidate the slack installation query to refresh the sync status (now ERROR)
            await queryClient.invalidateQueries({
                queryKey: ['slack'],
            });

            showToastApiError({
                title: 'Failed to sync Slack channels',
                apiError: error,
            });

            onComplete?.();
        },
    });

    return {
        ...query,
        // Use isFetching instead of isLoading - isLoading is only true on initial load
        // isFetching is true whenever a fetch is in progress
        isPolling: query.isFetching,
    };
};

/**
 * Hook to trigger a manual Slack channel sync.
 * This queues a background job to fetch all channels from Slack and update the cache.
 * Use with useSyncSlackChannelsJob to poll for completion.
 */
export const useSyncSlackChannels = () => {
    const { showToastApiError } = useToaster();
    return useMutation<{ jobId: string }, ApiError>({
        mutationFn: syncSlackChannels,
        onError: ({ error }) => {
            showToastApiError({
                title: `Failed to start Slack channel sync`,
                apiError: error,
            });
        },
    });
};
