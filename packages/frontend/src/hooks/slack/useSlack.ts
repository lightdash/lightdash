import { ApiError, SlackChannel, SlackSettings } from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    UseQueryOptions,
} from 'react-query';
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
    lightdashApi<undefined>({
        url: `/slack/`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteSlack = () => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastError } = useToaster();
    return useMutation<undefined, ApiError, undefined>(deleteSlack, {
        onSuccess: async () => {
            await queryClient.invalidateQueries('slack');

            showToastSuccess({
                title: `Deleted! Slack integration was deleted`,
            });
        },
        onError: (error) => {
            showToastError({
                title: `Failed to delete Slack integration`,
                subtitle: error.error.message,
            });
        },
    });
};

const getSlackChannels = async () =>
    lightdashApi<SlackChannel[]>({
        url: `/slack/channels`,
        method: 'GET',
        body: undefined,
    });

export const useSlackChannels = (
    useQueryOptions?: UseQueryOptions<SlackChannel[], ApiError>,
) =>
    useQuery<SlackChannel[], ApiError>({
        queryKey: ['slack_channels'],
        queryFn: getSlackChannels,
        ...useQueryOptions,
    });
