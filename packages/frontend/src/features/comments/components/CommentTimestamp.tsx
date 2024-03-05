import { Comment } from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import moment from 'moment';
import { FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

type Props = {
    timestamp: Comment['createdAt'];
};

export const CommentTimestamp: FC<Props> = ({ timestamp }) => {
    const timeAgo = useTimeAgo(timestamp);

    return (
        <Tooltip
            position="top-start"
            fz="10px"
            // Render tooltip closer to the text
            offset={-2}
            label={moment(timestamp).format('YYYY-MM-DD HH:mm:ss')}
        >
            <Text fz="xs" color="gray.5">
                {timeAgo}
            </Text>
        </Tooltip>
    );
};
