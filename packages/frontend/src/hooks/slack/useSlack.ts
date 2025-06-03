import {
    type ApiError,
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
}: {
    search: string;
    excludeArchived: boolean;
    excludeDms: boolean;
    excludeGroups: boolean;
    forceRefresh: boolean;
}) => {
    const queryString = new URLSearchParams();
    queryString.set('search', search);
    queryString.set('excludeArchived', excludeArchived.toString());
    queryString.set('excludeDms', excludeDms.toString());
    queryString.set('excludeGroups', excludeGroups.toString());
    queryString.set('forceRefresh', forceRefresh.toString());

    return lightdashApi<SlackChannel[] | undefined>({
        url: `/slack/channels?${queryString.toString()}`,
        method: 'GET',
        body: undefined,
    });
};

export const useSlackChannels = (
    search: string,
    { excludeArchived = true, excludeDms = false, excludeGroups = false },
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
        ],
        queryFn: () =>
            getSlackChannels({
                search,
                excludeArchived,
                excludeDms,
                excludeGroups,
                forceRefresh: false,
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
        });
        queryClient.setQueryData(
            [
                'slack_channels',
                search,
                excludeArchived,
                excludeDms,
                excludeGroups,
            ],
            slackChannelsAfterRefresh,
        );
        setIsRefreshing(false);
    }, [search, excludeArchived, excludeDms, excludeGroups, queryClient]);

    return {
        ...query,
        isRefreshing: query.isFetching || isRefreshing,
        refresh,
    };
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
