import { type AiAgentMessage } from '@lightdash/common';
import { type BoxProps } from '@mantine/core';
import { format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns';
import i18n from '../../../../../i18n/i18n';

export const ChatElementsUtils = {
    shouldRenderDivider: (
        message: AiAgentMessage,
        index: number,
        allMessages: AiAgentMessage[],
    ) => {
        const previousMessage: AiAgentMessage | undefined =
            allMessages[index - 1];

        const previousMessageDate = previousMessage?.createdAt
            ? parseISO(previousMessage.createdAt)
            : new Date();

        return !isSameDay(parseISO(message.createdAt), previousMessageDate);
    },

    getDividerLabel: (dateString: string) => {
        const date = parseISO(dateString);
        if (isToday(date))
            return i18n.t('chatDisplay.today', { ns: 'aiCopilotChat' });
        if (isYesterday(date))
            return i18n.t('chatDisplay.yesterday', { ns: 'aiCopilotChat' });
        return format(date, 'MMMM d, yyyy');
    },

    /**
     * Used for centering chat elements with max width
     */
    centeredElementProps: {
        h: '100%',
        w: '100%',
        maw: '62rem',
        mx: 'auto',
        px: 'sm',
    } satisfies BoxProps,
};
