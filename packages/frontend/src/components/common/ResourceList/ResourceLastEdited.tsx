import { Position } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import moment from 'moment';
import { FC } from 'react';

import { useTimeAgo } from '../../../hooks/useTimeAgo';
import {
    ResourceLastEditedBy,
    ResourceLastEditedTimeAgo,
} from './ResourceLastEdited.styles';
import { ResourceListItem } from './ResourceTypeUtils';

interface ResourceLastEditedProps {
    item: ResourceListItem;
}

const ResourceLastEdited: FC<ResourceLastEditedProps> = ({
    item: {
        data: { updatedAt, updatedByUser: user },
    },
}) => {
    const timeAgo = useTimeAgo(updatedAt);

    return (
        <div>
            <Tooltip2
                lazy
                position={Position.TOP}
                content={moment(updatedAt).format('YYYY-MM-DD HH:mm:ss')}
            >
                <ResourceLastEditedTimeAgo>{timeAgo}</ResourceLastEditedTimeAgo>
            </Tooltip2>

            {user && user.firstName ? (
                <ResourceLastEditedBy>
                    by {user.firstName} {user.lastName}
                </ResourceLastEditedBy>
            ) : null}
        </div>
    );
};

export default ResourceLastEdited;
