import { type AiAgentMessage } from '@lightdash/common';
import { type BoxProps } from '@mantine-8/core';
import dayjs from 'dayjs';

export const ChatElementsUtils = {
    shouldRenderDivider: (
        message: AiAgentMessage,
        index: number,
        allMessages: AiAgentMessage[],
    ) => {
        const previousMessageDate =
            index === 0 ? dayjs() : dayjs(allMessages[index - 1].createdAt);
        return !previousMessageDate.isSame(message.createdAt, 'day');
    },

    getDividerLabel: (dateString: string) => {
        const date = dayjs(dateString);
        if (date.isSame(dayjs(), 'day')) return 'Today';
        if (date.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday';
        return date.format('MMMM D, YYYY');
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
