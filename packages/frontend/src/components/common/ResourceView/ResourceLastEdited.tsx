import {
    type ResourceViewChartItem,
    type ResourceViewDashboardItem,
    type ResourceViewDataAppItem,
} from '@lightdash/common';
import { Text, Tooltip } from '@mantine/core';
import dayjs from 'dayjs';
import type { FC } from 'react';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

interface ResourceLastEditedProps {
    item:
        | ResourceViewChartItem
        | ResourceViewDashboardItem
        | ResourceViewDataAppItem;
}

const ResourceLastEdited: FC<ResourceLastEditedProps> = ({
    item: {
        data: { updatedAt, updatedByUser: user },
    },
}) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <div>
            <Tooltip
                position="top-start"
                label={dayjs(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            >
                <Text fz="xs" fw={500} c="ldGray.7">
                    {timeAgo}
                </Text>
            </Tooltip>

            {user && user.firstName ? (
                <Text fz="xs" c="dimmed">
                    by {user.firstName} {user.lastName}
                </Text>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
