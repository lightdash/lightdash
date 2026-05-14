import { useCallback, useMemo } from 'react';
import { useGetSlack, useSlackChannels } from './useSlack';

/**
 * Resolves Slack channel IDs to human-readable names for scheduler run views.
 * Skips the underlying fetch when the org has no Slack installation or when
 * the consumer marks the lookup as disabled.
 *
 * @param includeChannelIds Optionally narrow the Slack-channels query to a
 *   subset of channel IDs. Useful when only a few channels are referenced
 *   by the currently rendered runs.
 * @param enabled When false, skips the Slack queries entirely and returns a
 *   resolver that always returns null.
 */
export const useGetSlackChannelName = ({
    includeChannelIds,
    enabled = true,
}: {
    includeChannelIds?: string[];
    enabled?: boolean;
} = {}) => {
    const { data: slackInstallation, isInitialLoading: isLoadingInstallation } =
        useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const slackChannelsQuery = useSlackChannels(
        '',
        {
            excludeArchived: false,
            includeChannelIds:
                includeChannelIds && includeChannelIds.length > 0
                    ? includeChannelIds
                    : undefined,
        },
        {
            enabled: enabled && organizationHasSlack && !isLoadingInstallation,
        },
    );

    const slackChannelMap = useMemo(() => {
        const map = new Map<string, string>();
        slackChannelsQuery?.data?.forEach((channel) => {
            map.set(channel.id, channel.name);
        });
        return map;
    }, [slackChannelsQuery?.data]);

    const getSlackChannelName = useCallback(
        (channelId: string): string | null =>
            slackChannelMap.get(channelId) ?? null,
        [slackChannelMap],
    );

    return { getSlackChannelName };
};
