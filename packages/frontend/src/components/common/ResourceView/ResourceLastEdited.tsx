import { Text, Tooltip } from '@mantine/core';
import moment from 'moment';
import { FC } from 'react';

import {
    ResourceViewChartItem,
    ResourceViewDashboardItem,
} from '@lightdash/common';
import { useTimeAgo } from '../../../hooks/useTimeAgo';

interface ResourceLastEditedProps {
    item: ResourceViewChartItem | ResourceViewDashboardItem;
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
                label={moment(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            >
                <Text fz={12} fw={500} color="gray.7">
                    {timeAgo}
                </Text>
            </Tooltip>

            {user && user.firstName ? (
                <Text fz={12} color="gray.6">
                    by {user.firstName} {user.lastName}
                </Text>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
