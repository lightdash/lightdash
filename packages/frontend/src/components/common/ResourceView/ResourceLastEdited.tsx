import { Tooltip } from '@mantine/core';
import moment from 'moment';
import { FC } from 'react';

import { useTimeAgo } from '../../../hooks/useTimeAgo';
import {
    ResourceLastEditedBy,
    ResourceLastEditedTimeAgo,
} from './ResourceLastEdited.styles';
import {
    ResourceViewChartItem,
    ResourceViewDashboardItem,
} from './resourceTypeUtils';

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
                withArrow
                label={moment(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            >
                <ResourceLastEditedTimeAgo>{timeAgo}</ResourceLastEditedTimeAgo>
            </Tooltip>

            {user && user.firstName ? (
                <ResourceLastEditedBy>
                    by {user.firstName} {user.lastName}
                </ResourceLastEditedBy>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
