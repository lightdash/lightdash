import {
    isSlackPrompt,
    type AiWebAppPrompt,
    type SlackPrompt,
} from '@lightdash/common';
import {
    getAiUsageChannel,
    type AiUsageChannel,
    type AiUsageEvent,
} from '../../../analytics/aiUsage';

export type AiUsageViewerAttribution = Pick<
    AiUsageEvent['properties'],
    'channel' | 'externalUserId'
>;

export const getPromptUsageAttribution = (
    prompt: SlackPrompt | AiWebAppPrompt,
): AiUsageViewerAttribution & { channel: AiUsageChannel } => ({
    channel: getAiUsageChannel({
        createdFrom: prompt.threadCreatedFrom,
        embedSpaceUuid: isSlackPrompt(prompt)
            ? null
            : prompt.threadEmbedSpaceUuid,
    }),
    externalUserId: isSlackPrompt(prompt) ? null : prompt.externalUserId,
});
