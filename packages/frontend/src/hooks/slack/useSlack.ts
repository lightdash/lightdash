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
import { useCallback } from 'react';
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

const getSlackChannels = async (
    search: string,
    excludeArchived: boolean = true,
    forceRefresh: boolean = false,
) =>
    lightdashApi<SlackChannel[] | undefined>({
        url: `/slack/channels?search=${search}&excludeArchived=${excludeArchived}&forceRefresh=${forceRefresh}`,
        method: 'GET',
        body: undefined,
    });

export const useSlackChannels = (
    search: string,
    excludeArchived: boolean = true,
    useQueryOptions?: UseQueryOptions<SlackChannel[] | undefined, ApiError>,
) => {
    const queryClient = useQueryClient();

    const query = useQuery<SlackChannel[] | undefined, ApiError>({
        queryKey: ['slack_channels', search, excludeArchived],
        queryFn: () => getSlackChannels(search, excludeArchived),
        ...useQueryOptions,
    });

    const refresh = useCallback(async () => {
        const slackChannelsAfterRefresh = await getSlackChannels(
            search,
            excludeArchived,
            true,
        );
        queryClient.setQueryData(
            ['slack_channels', search, excludeArchived],
            slackChannelsAfterRefresh,
        );
    }, [search, excludeArchived, queryClient]);

    return { ...query, refresh };
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
