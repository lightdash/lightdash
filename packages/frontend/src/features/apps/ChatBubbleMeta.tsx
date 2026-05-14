import { Group, Text, Tooltip } from '@mantine-8/core';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import classes from './ChatBubbleMeta.module.css';

type Props = {
    timestamp: Date;
    userName: string | null;
    /**
     * Sender kind drives the name color so the user and the assistant are
     * easy to tell apart at a glance: indigo for users (matches the rest of
     * the chat's user accents), orange for the bot (matches the Data App
     * icon used everywhere else — spaces page, sidebar, etc).
     */
    kind: 'user' | 'assistant';
};

/**
 * Header row rendered inside a chat bubble. Name (bold accent) on the left,
 * timestamp (dim) on the right. Hovering the timestamp reveals the absolute
 * date in a tooltip.
 */
const ChatBubbleMeta: FC<Props> = ({ timestamp, userName, kind }) => {
    const timeAgo = useTimeAgo(timestamp);
    return (
        <Group
            gap="xs"
            wrap="nowrap"
            justify={userName ? 'space-between' : 'flex-start'}
            className={classes.meta}
        >
            {userName && (
                <Text
                    fz="xs"
                    fw={600}
                    className={
                        kind === 'assistant' ? classes.botName : classes.name
                    }
                    truncate
                >
                    {userName}
                </Text>
            )}
            <Tooltip
                position={userName ? 'top-end' : 'top-start'}
                fz="10px"
                offset={2}
                label={dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')}
            >
                <Text fz="10px" c="dimmed" className={classes.time}>
                    {timeAgo}
                </Text>
            </Tooltip>
        </Group>
    );
};

export default ChatBubbleMeta;
