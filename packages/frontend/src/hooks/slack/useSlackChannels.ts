import { ApiError, SlackChannel } from '@lightdash/common';
import { useQuery } from 'react-query';
import { lightdashApi } from '../../api';

const getSlackChannels = async () =>
    lightdashApi<SlackChannel[]>({
        url: `/slack/channels`,
        method: 'GET',
        body: undefined,
    });

export const useSlackChannels = () =>
    useQuery<SlackChannel[], ApiError>({
        queryKey: ['slack_channels'],
        queryFn: getSlackChannels,
    });
