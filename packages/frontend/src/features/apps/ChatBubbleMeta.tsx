import { Group, Text, Tooltip } from '@mantine-8/core';
import dayjs from 'dayjs';
import { type FC } from 'react';
import { useTimeAgo } from '../../hooks/useTimeAgo';
import classes from './ChatBubbleMeta.module.css';

type Props = {
    timestamp: Date;
    /**
     * Sender name to show on the left of the header. Pass `null` to render
     * just the timestamp (e.g. assistant replies, which are nameless).
     */
    userName: string | null;
};

/**
 * Header row rendered inside a chat bubble. When a name is present it sits
 * on the left (indigo accent) with the timestamp on the right; without a
 * name the timestamp slides to the left. Hovering the timestamp reveals
 * the absolute date in a tooltip.
 */
const ChatBubbleMeta: FC<Props> = ({ timestamp, userName }) => {
    const timeAgo = useTimeAgo(timestamp);
    return (
        <Group
            gap="xs"
            wrap="nowrap"
            justify={userName ? 'space-between' : 'flex-start'}
            className={classes.meta}
        >
            {userName && (
                <Text fz="xs" fw={600} className={classes.name} truncate>
                    {userName}
                </Text>
            )}
            <Tooltip
                position={userName ? 'top-end' : 'top-start'}
                fz="xs"
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
