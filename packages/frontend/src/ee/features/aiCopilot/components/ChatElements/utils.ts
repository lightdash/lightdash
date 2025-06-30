import { type AiAgentMessage } from '@lightdash/common';
import { type BoxProps } from '@mantine-8/core';
import { format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns';

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
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
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
