import type { WebClient } from '@slack/web-api';

export type SlackServiceAccountChannel = {
    is_im?: boolean;
    is_mpim?: boolean;
    is_ext_shared?: boolean;
    is_pending_ext_shared?: boolean;
};

export type SlackServiceAccountSender = {
    is_bot?: boolean;
    is_restricted?: boolean;
    is_ultra_restricted?: boolean;
    team_id?: string;
    enterprise_user?: { enterprise_id?: string };
};

export type SlackServiceAccountRefusal =
    | 'expired_service_account'
    | 'direct_message'
    | 'external_channel'
    | 'guest_sender'
    | 'external_sender'
    | 'lookup_failed';

// Only full members of the installing workspace may ask, in a channel that
// isn't shared with another organization.
export const getSlackServiceAccountRefusal = ({
    channel,
    sender,
    teamId,
    enterpriseId,
}: {
    channel: SlackServiceAccountChannel;
    sender: SlackServiceAccountSender;
    teamId: string;
    enterpriseId: string | null;
}): SlackServiceAccountRefusal | null => {
    if (channel.is_im || channel.is_mpim) {
        return 'direct_message';
    }
    if (channel.is_ext_shared || channel.is_pending_ext_shared) {
        return 'external_channel';
    }
    if (sender.is_bot || sender.is_restricted || sender.is_ultra_restricted) {
        return 'guest_sender';
    }
    const sameEnterprise =
        enterpriseId !== null &&
        sender.enterprise_user?.enterprise_id === enterpriseId;
    if (sender.team_id !== teamId && !sameEnterprise) {
        return 'external_sender';
    }
    return null;
};

export const checkSlackServiceAccountChannel = async ({
    client,
    channelId,
    slackUserId,
    teamId,
    enterpriseId,
}: {
    client: WebClient;
    channelId: string;
    slackUserId: string;
    teamId: string;
    enterpriseId: string | null;
}): Promise<SlackServiceAccountRefusal | null> => {
    try {
        const [channelInfo, userInfo] = await Promise.all([
            client.conversations.info({ channel: channelId }),
            client.users.info({ user: slackUserId }),
        ]);
        if (!channelInfo.channel || !userInfo.user) return 'lookup_failed';
        return getSlackServiceAccountRefusal({
            channel: channelInfo.channel,
            sender: userInfo.user,
            teamId,
            enterpriseId,
        });
    } catch {
        return 'lookup_failed';
    }
};

export const SLACK_SERVICE_ACCOUNT_REFUSAL_TEXT: Record<
    SlackServiceAccountRefusal,
    string
> = {
    expired_service_account:
        "This channel's shared service account has expired, so the question wasn't answered. Ask an admin to pick another one.",
    direct_message:
        "Direct messages can't use a shared service account. Ask in the channel instead.",
    external_channel:
        "This channel is shared with another organization, so it can't use a shared service account. Ask an admin to change the channel's settings.",
    guest_sender:
        "Guests can't ask questions in channels that use a shared service account.",
    external_sender:
        'Only members of this workspace can ask questions in channels that use a shared service account.',
    lookup_failed:
        "Couldn't verify this channel, so the question wasn't answered. Try again in a moment.",
};
